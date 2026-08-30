import { NextResponse } from "next/server";
import { TABLES, listPage, create, update, escapeLikeValue, numericId } from "@/lib/nocodb";
import { validateAdminAuth, nowISO, generateUUID } from "@/lib/auth";
import type { Company } from "@/lib/types";

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
      where = `(CompanyName,like,%${term}%)`;
    }

    const result = await listPage<Company>(TABLES.Companies, {
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
    const id = await create(TABLES.Companies, {
      CompanyUUID: generateUUID(),
      CompanyName: body.CompanyName,
      TradingName: body.TradingName || null,
      ABN: body.ABN || null,
      ContactName: body.ContactName || null,
      ContactPhone: body.ContactPhone || null,
      ContactEmail: body.ContactEmail || null,
      CompanyType: body.CompanyType || null,
      Status: body.Status || "Active",
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
    await update(TABLES.Companies, { ...body, UpdatedAt1: nowISO() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}