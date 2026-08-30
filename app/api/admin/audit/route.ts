import { NextResponse } from "next/server";
import { TABLES, listPage } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = page * limit;

    const result = await listPage<Record<string, unknown>>(TABLES.AuditLog, {
      limit,
      offset,
      sort: "-CreatedAt1",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}