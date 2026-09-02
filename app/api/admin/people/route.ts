import { NextResponse } from "next/server";
import { TABLES, list, listPage, create, update, remove, ensurePasscodeColumn, ensureCredentialColumns, ensurePersonPhotoColumn, escapeLikeValue, numericId } from "@/lib/nocodb";
import { validateAdminAuth, nowISO, generateUUID, generateAccessToken, hashToken, hashPasscode, normalizeMobile, validatePasscode } from "@/lib/auth";
import type { Person } from "@/lib/types";
import {
  credentialWarnDays,
  evaluateCredentials,
  type CredentialSource,
} from "@/lib/credentials";
import { cardImageCreateFields, cardImagePatchFields } from "@/lib/media";

const PEOPLE_LIST_FIELDS =
  "Id,PersonUUID,FirstName,LastName,Mobile,Email,WorkerType,JobRole,AccessEnabled,WhiteCardNumber,WhiteCardExpiry,LicenceNumber,LicenceType,LicenceExpiry";

const PEOPLE_DETAIL_FIELDS =
  `${PEOPLE_LIST_FIELDS},WhiteCardImage,LicenceImage,PersonPhoto,EmergencyContactName,EmergencyContactPhone,Notes`;

async function passcodeFields(
  passcode: unknown,
  mobile: unknown
): Promise<{ PasscodeHash?: string; error?: string }> {
  if (passcode == null || String(passcode).trim() === "") return {};
  const invalid = validatePasscode(String(passcode));
  if (invalid) return { error: invalid };
  if (!normalizeMobile(mobile as string)) {
    return {
      error:
        "This person needs a mobile number before a passcode can be set — the mobile is what identifies them at sign-in.",
    };
  }
  await ensurePasscodeColumn();
  return { PasscodeHash: hashPasscode(String(passcode)) };
}

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = numericId(searchParams.get("id"));

    await ensureCredentialColumns();
    const warnDays = credentialWarnDays();

    // Card photographs and the face photo are left out of the list — they are
    // large, and a page of twenty-five would be megabytes for a table that
    // only shows names. One record is fetched in full by id when someone opens it.
    if (id) {
      await ensurePersonPhotoColumn();
      const [row] = await list<Person>(TABLES.People, {
        where: `(Id,eq,${id})`,
        limit: 1,
        fields: PEOPLE_DETAIL_FIELDS,
      });
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        ...row,
        credentials: evaluateCredentials(row as CredentialSource, { warnDays }),
      });
    }

    const q = searchParams.get("q");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = page * limit;

    let where = "";
    const term = escapeLikeValue(q);
    if (term) {
      where = `(FirstName,like,%${term}%)~or(LastName,like,%${term}%)`;
    }

    const result = await listPage<Person>(TABLES.People, {
      where,
      limit,
      offset,
      sort: "-UpdatedAt1",
      fields: PEOPLE_LIST_FIELDS,
    });

    // Evaluated server-side so the list and the gate cannot disagree about
    // whose tickets have lapsed.
    const withCredentials = result.list.map((p) => ({
      ...p,
      credentials: evaluateCredentials(p as CredentialSource, { warnDays }),
    }));

    return NextResponse.json({ ...result, list: withCredentials });
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
    const hashed = await passcodeFields(body.passcode, body.Mobile);
    if (hashed.error) {
      return NextResponse.json({ error: hashed.error }, { status: 400 });
    }
    const images = cardImageCreateFields(body.WhiteCardImage, body.LicenceImage, body.PersonPhoto);
    if (images.error) {
      return NextResponse.json({ error: images.error }, { status: 400 });
    }
    await ensureCredentialColumns();
    if (images.fields.PersonPhoto) await ensurePersonPhotoColumn();
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
      WhiteCardExpiry: body.WhiteCardExpiry || null,
      LicenceNumber: body.LicenceNumber || null,
      LicenceType: body.LicenceType || null,
      LicenceExpiry: body.LicenceExpiry || null,
      ...images.fields,
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
    const targetId = numericId(body.Id);
    if (!targetId) {
      return NextResponse.json({ error: "Id required" }, { status: 400 });
    }

    let mobile = body.Mobile;
    if (mobile == null && body.passcode) {
      const [existing] = await list<Person>(TABLES.People, {
        where: `(Id,eq,${targetId})`,
        limit: 1,
        fields: "Id,Mobile",
      });
      mobile = existing?.Mobile ?? null;
    }
    const hashed = await passcodeFields(body.passcode, mobile);
    if (hashed.error) {
      return NextResponse.json({ error: hashed.error }, { status: 400 });
    }
    const images = cardImagePatchFields(body);
    if (images.error) {
      return NextResponse.json({ error: images.error }, { status: 400 });
    }
    if (
      "WhiteCardExpiry" in body ||
      "LicenceExpiry" in body ||
      Object.keys(images.fields).length
    ) {
      await ensureCredentialColumns();
    }
    if ("PersonPhoto" in images.fields) await ensurePersonPhotoColumn();
    const {
      passcode: _passcode,
      credentials: _credentials,
      WhiteCardImage: _whiteCardImage,
      LicenceImage: _licenceImage,
      PersonPhoto: _personPhoto,
      ...rest
    } = body;
    await update(TABLES.People, {
      ...rest,
      ...images.fields,
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
    const id = numericId(body.Id);
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