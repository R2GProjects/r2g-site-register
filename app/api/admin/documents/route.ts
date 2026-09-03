import { NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/auth";
import { numericId } from "@/lib/nocodb";
import {
  archiveDocument,
  getDocument,
  listAcks,
  listSiteDocuments,
  saveDocument,
} from "@/lib/documents-run";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = numericId(searchParams.get("id") || searchParams.get("documentId"));
    if (id) {
      const row = await getDocument(id);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const acks =
        searchParams.get("acks") === "1" || searchParams.get("acks") === "true"
          ? await listAcks(id)
          : undefined;
      return NextResponse.json({ ...row, acks });
    }
    const list = await listSiteDocuments(numericId(searchParams.get("siteId")));
    return NextResponse.json({ list });
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
    const saved = await saveDocument(body);
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ Id: saved.id, version: saved.version });
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
    if (body.archive === true) {
      const archived = await archiveDocument(id);
      if ("error" in archived) {
        return NextResponse.json({ error: archived.error }, { status: archived.status });
      }
      return NextResponse.json({ ok: true });
    }
    const saved = await saveDocument({ ...body, Id: id });
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ Id: saved.id, version: saved.version });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
