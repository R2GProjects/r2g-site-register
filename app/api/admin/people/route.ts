import { NextResponse } from "next/server";
import { TABLES, list, listPage, create, update, remove, ensurePasscodeColumn } from "@/lib/nocodb";
import { validateAdminAuth, nowISO, generateUUID, generateAccessToken, hashToken, hashPasscode, validatePasscode } from "@/lib/auth";
import type { Person } from "@/lib/types";

async function passcodeFields(passcode: unknown): Promise<{ PasscodeHash?: string; error?: string }> {
  if (passcode == null || String(passcode).trim() === "") return {};
  const invalid = validatePasscode(String(passcode));
  if (invalid) return { error: invalid };
  await ensurePasscodeColumn();
  return { PasscodeHash: hashPasscode(String(passcode)) };
}

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
    if (q) {
      where = `(FirstName,like,%${q}%)~or(LastName,like,%${q}%)`;
    }

    const result = await listPage<Person>(TABLES.People, {
      where,
      limit,
      offset,
      sort: "-UpdatedAt1",
      fields: "Id,PersonUUID,FirstName,LastName,Mobile,Email,WorkerType,JobRole,AccessEnabled",
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
    const hashed = await passcodeFields(body.passcode);
    if (hashed.error) {
      return NextResponse.json({ error: hashed.error }, { status: 400 });
    }
    const now = nowISO();
    const token = generateAccessToken();
    const id = await create(TABLES.People, {
      PersonUUID: generateUUID(),
      FirstName: body.FirstName,
      LastName: body.LastName,
      Mobile: body.Mobile || null,
      Email: body.Email || null,
      Company: body.Company || null,
      WorkerType: body.WorkerType || null,
      JobRole: body.JobRole || null,
      WhiteCardNumber: body.WhiteCardNumber || null,
      LicenceNumber: body.LicenceNumber || null,
      LicenceType: body.LicenceType || null,
      EmergencyContactName: body.EmergencyContactName || null,
      EmergencyContactPhone: body.EmergencyContactPhone || null,
      AccessTokenHash: hashToken(token),
      ...(hashed.PasscodeHash ? { PasscodeHash: hashed.PasscodeHash } : {}),
      AccessEnabled: body.AccessEnabled ?? true,
      Notes: body.Notes || null,
      CreatedAt1: now,
      UpdatedAt1: now,
    });
    return NextResponse.json({ Id: id, accessToken: token });
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
    const hashed = await passcodeFields(body.passcode);
    if (hashed.error) {
      return NextResponse.json({ error: hashed.error }, { status: 400 });
    }
    const { passcode: _passcode, ...rest } = body;
    await update(TABLES.People, {
      ...rest,
      ...(hashed.PasscodeHash ? { PasscodeHash: hashed.PasscodeHash } : {}),
      UpdatedAt1: nowISO(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const id = parseInt(String(body.Id || ""));
    if (!id) {
      return NextResponse.json({ error: "Id required" }, { status: 400 });
    }

    const access = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${id})`,
      limit: 200,
      fields: "Id",
    });
    for (const row of access) {
      await remove(TABLES.SiteAccess, row.Id as number);
    }

    await remove(TABLES.People, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      error: "Could not delete this person. They may still have attendance records. Disable access instead, or remove their attendance first.",
      detail: String(err),
    }, { status: 409 });
  }
}