import { NextResponse } from "next/server";
import { TABLES, listPage, create, update, escapeLikeValue, numericId } from "@/lib/nocodb";
import { validateAdminAuth, nowISO, generateUUID } from "@/lib/auth";
import type { Site } from "@/lib/types";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = page * limit;

    let where = "";
    const term = escapeLikeValue(q);
    if (term) {
      where = `(SiteName,like,%${term}%)~or(SiteCode,like,%${term}%)`;
    }

    const result = await listPage<Site>(TABLES.Sites, {
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

export async function POST(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const now = nowISO();
    const id = await create(TABLES.Sites, {
      SiteUUID: generateUUID(),
      SiteCode: body.SiteCode,
      SiteName: body.SiteName,
      ProjectNumber: body.ProjectNumber || null,
      Address: body.Address || null,
      Suburb: body.Suburb || null,
      State: body.State || null,
      Postcode: body.Postcode || null,
      SiteManager: body.SiteManager || null,
      SiteManagerPhone: body.SiteManagerPhone || null,
      Client: body.Client || null,
      Status: body.Status || "Setup",
      StartDate: body.StartDate || null,
      CompletionDate: body.CompletionDate || null,
      Latitude: body.Latitude || null,
      Longitude: body.Longitude || null,
      EmergencyPlanURL: body.EmergencyPlanURL || null,
      RequiresInduction: body.RequiresInduction ?? false,
      InductionRules: body.InductionRules || null,
      Notes: body.Notes || null,
      CreatedAt1: now,
      UpdatedAt1: now,
    });
    return NextResponse.json({ Id: id });
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
    if (!numericId(body.Id)) {
      return NextResponse.json({ error: "Id required" }, { status: 400 });
    }
    await update(TABLES.Sites, { ...body, UpdatedAt1: nowISO() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}