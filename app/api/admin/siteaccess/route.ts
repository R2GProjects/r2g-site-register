import { NextResponse } from "next/server";
import { TABLES, list, listPage, create, update } from "@/lib/nocodb";
import { validateAdminAuth, nowISO, getClientIP, generateUUID } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = page * limit;

    const conditions: string[] = [];
    if (personId) conditions.push(`(People_id,eq,${personId})`);
    if (siteId) conditions.push(`(Sites_id,eq,${siteId})`);
    if (status) conditions.push(`(AccessStatus,eq,${status})`);

    const where = conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : `(${conditions.join("~and")})`
      : "";

    const result = await listPage<Record<string, unknown>>(TABLES.SiteAccess, {
      where,
      limit,
      offset,
      sort: "-UpdatedAt1",
    });
    return NextResponse.json(result);
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
    if (!body.Id) {
      return NextResponse.json({ error: "Id required" }, { status: 400 });
    }
    await update(TABLES.SiteAccess, { ...body, UpdatedAt1: nowISO() });
    return NextResponse.json({ ok: true });
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
    const now = nowISO();
    const id = await create(TABLES.SiteAccess, {
      SiteAccessUUID: generateUUID(),
      Site: body.Sites_id || body.Site,
      Person: body.People_id || body.Person,
      AccessStatus: body.AccessStatus || "Pending",
      StartDate: body.StartDate || null,
      EndDate: body.EndDate || null,
      SiteInductionComplete: body.SiteInductionComplete ?? false,
      SiteInductionDate: body.SiteInductionDate || null,
      Notes: body.Notes || null,
      CreatedAt1: now,
      UpdatedAt1: now,
    });
    return NextResponse.json({ Id: id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}