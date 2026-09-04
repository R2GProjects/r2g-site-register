import { NextResponse } from "next/server";
import { adminActor, validateAdminAuth } from "@/lib/auth";
import { numericId } from "@/lib/nocodb";
import { listAdminUsers, saveAdminUser, setAdminActive } from "@/lib/admin-run";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({
      list: await listAdminUsers(),
      you: adminActor(request),
      bootstrap: (process.env.ADMIN_USERNAME || "").trim(),
    });
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
    const saved = await saveAdminUser(body);
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ Id: saved.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const id = numericId(body.Id ?? body.id);
    if (!id) return NextResponse.json({ error: "Id required" }, { status: 400 });
    if (body.active !== undefined || body.Active !== undefined) {
      if (
        body.Username === undefined &&
        body.username === undefined &&
        body.password === undefined &&
        body.Password === undefined &&
        body.DisplayName === undefined &&
        body.displayName === undefined
      ) {
        const saved = await setAdminActive(id, body.Active ?? body.active);
        if ("error" in saved) {
          return NextResponse.json({ error: saved.error }, { status: saved.status });
        }
        return NextResponse.json({ ok: true });
      }
    }
    const saved = await saveAdminUser({ ...body, Id: id });
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ Id: saved.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
