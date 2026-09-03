import { NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/auth";
import { numericId } from "@/lib/nocodb";
import {
  getPreStart,
  listPreStarts,
  loadPreStartDraft,
  preStartQueryFrom,
  refreshPreStartRoll,
  savePreStart,
} from "@/lib/prestart-run";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const query = preStartQueryFrom(searchParams);
    if (query.id) {
      const row = await getPreStart(query.id);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(row);
    }
    if (searchParams.get("draft") === "1") {
      if (!query.siteId) {
        return NextResponse.json({ error: "Pick a site." }, { status: 400 });
      }
      return NextResponse.json(await loadPreStartDraft(query.siteId));
    }
    return NextResponse.json(await listPreStarts(query));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (body.action === "refresh") {
      const siteId = numericId(body.siteId);
      if (!siteId) {
        return NextResponse.json({ error: "Pick a site." }, { status: 400 });
      }
      return NextResponse.json({
        attendees: await refreshPreStartRoll(body.attendees, siteId),
      });
    }
    const saved = await savePreStart(body);
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ Id: saved.id, ...saved.draft });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
