import { NextResponse } from "next/server";
import {
  TABLES,
  listPage,
  create,
  update,
  escapeLikeValue,
  numericId,
  ensureCompanyCoverColumns,
} from "@/lib/nocodb";
import { validateAdminAuth, nowISO, generateUUID } from "@/lib/auth";
import { credentialWarnDays } from "@/lib/credentials";
import {
  evaluateCompanyCover,
  type CompanyCoverSource,
} from "@/lib/company-cover";
import type { Company } from "@/lib/types";

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function dateOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  return text ? text.slice(0, 10) : null;
}

function coverFields(body: Record<string, unknown>) {
  return {
    PublicLiabilityNumber: textOrNull(body.PublicLiabilityNumber),
    PublicLiabilityExpiry: dateOrNull(body.PublicLiabilityExpiry),
    WorkersCompNumber: textOrNull(body.WorkersCompNumber),
    WorkersCompExpiry: dateOrNull(body.WorkersCompExpiry),
    ContractorLicenceNumber: textOrNull(body.ContractorLicenceNumber),
    ContractorLicenceExpiry: dateOrNull(body.ContractorLicenceExpiry),
  };
}

function withCover<T extends CompanyCoverSource>(row: T, warnDays: number) {
  return {
    ...row,
    cover: evaluateCompanyCover(row, { warnDays }),
  };
}

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureCompanyCoverColumns();
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

    const warnDays = credentialWarnDays();
    const result = await listPage<Company>(TABLES.Companies, {
      where,
      limit,
      offset,
      sort: "-UpdatedAt1",
    });
    return NextResponse.json({
      ...result,
      list: result.list.map((row) => withCover(row, warnDays)),
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
    await ensureCompanyCoverColumns();
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
      ...coverFields(body),
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
    const id = numericId(body.Id);
    if (!id) {
      return NextResponse.json({ error: "Id required" }, { status: 400 });
    }
    await ensureCompanyCoverColumns();
    await update(TABLES.Companies, {
      Id: id,
      CompanyName: body.CompanyName,
      TradingName: body.TradingName || null,
      ABN: body.ABN || null,
      ContactName: body.ContactName || null,
      ContactPhone: body.ContactPhone || null,
      ContactEmail: body.ContactEmail || null,
      CompanyType: body.CompanyType || null,
      Status: body.Status || "Active",
      Notes: body.Notes || null,
      ...coverFields(body),
      UpdatedAt1: nowISO(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
