import { NextResponse } from "next/server";
import { TABLES, create, findSiteByCode, ensurePasscodeColumn, ensureCredentialColumns, ensurePrivacyColumns, ensurePersonPhotoColumn, numericId } from "@/lib/nocodb";
import { privacyAcceptance } from "@/lib/privacy";
import {
  generateAccessToken,
  hashToken,
  hashPasscode,
  nowISO,
  generateUUID,
  normalizeMobile,
  validatePasscode,
  createWorkerSession,
  WORKER_COOKIE,
  WORKER_MAX_AGE,
} from "@/lib/auth";
import { resolveOrCreateCompany } from "@/lib/company";
import { findDuplicatePerson } from "@/lib/person-auth";
import { guard, HOUR } from "@/lib/rate-limit";
import { cardImageCreateFields } from "@/lib/media";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyId, companyName, companyABN,
      workerType, jobRole, whiteCardNumber, whiteCardExpiry, whiteCardImage,
      licenceNumber, licenceType, licenceExpiry, licenceImage, photo,
      emergencyContactName, emergencyContactPhone, passcode, privacyAccepted,
    } = await request.json();

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Missing required fields: firstName, lastName" }, { status: 400 });
    }
    if (privacyAccepted !== true) {
      return NextResponse.json(
        { error: "Please confirm you have read how your details are used." },
        { status: 400 }
      );
    }

    const limit = guard(request, "register-worker", {
      limit: 10,
      windowMs: HOUR,
      message: "Too many registrations from this connection. Try again later.",
    });
    if (limit.blocked) return limit.blocked;

    let site: Record<string, unknown> | null = null;
    if (siteCode) {
      site = await findSiteByCode(siteCode, "Id,SiteUUID,SiteName,SiteCode,Status");
      if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // A second record for the same person splits their hours, inductions and
    // site access across two identities that nothing links together.
    const existing = await findDuplicatePerson({ mobile, email });
    if (existing) {
      return NextResponse.json(
        {
          error: existing.PasscodeHash
            ? "Someone is already registered with that mobile or email. Sign in with your mobile and passcode instead."
            : "Someone is already registered with that mobile or email. Use your access token to sign in, or ask the site supervisor to look you up.",
          duplicate: true,
          hasPasscode: Boolean(existing.PasscodeHash),
        },
        { status: 409 }
      );
    }

    const companyRowId = numericId(companyId) ?? (await resolveOrCreateCompany(companyName, companyABN));

    let passcodeHash: string | null = null;
    if (passcode && String(passcode).trim()) {
      const invalid = validatePasscode(String(passcode));
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      if (!normalizeMobile(mobile)) {
        return NextResponse.json(
          { error: "A mobile number is required to use a passcode — it is what identifies you at sign-in." },
          { status: 400 }
        );
      }
      await ensurePasscodeColumn();
      passcodeHash = hashPasscode(String(passcode));
    }

    const images = cardImageCreateFields(whiteCardImage, licenceImage, photo);
    if (images.error) {
      return NextResponse.json({ error: images.error }, { status: 400 });
    }
    if (whiteCardExpiry || licenceExpiry || images.fields.WhiteCardImage || images.fields.LicenceImage) {
      await ensureCredentialColumns();
    }
    if (images.fields.PersonPhoto) await ensurePersonPhotoColumn();

    const token = generateAccessToken();
    const tokenHash = hashToken(token);
    const now = nowISO();

    await ensurePrivacyColumns("people");
    const personId = await create(TABLES.People, {
      PersonUUID: generateUUID(),
      ...privacyAcceptance(now),
      FirstName: firstName,
      LastName: lastName,
      Mobile: mobile || null,
      Email: email || null,
      Company: companyRowId,
      WorkerType: workerType || "Contractor",
      JobRole: jobRole || null,
      WhiteCardNumber: whiteCardNumber || null,
      WhiteCardExpiry: whiteCardExpiry || null,
      LicenceNumber: licenceNumber || null,
      LicenceType: licenceType || null,
      LicenceExpiry: licenceExpiry || null,
      ...images.fields,
      EmergencyContactName: emergencyContactName || null,
      EmergencyContactPhone: emergencyContactPhone || null,
      AccessTokenHash: tokenHash,
      PasscodeHash: passcodeHash,
      AccessEnabled: true,
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    if (site) {
      await create(TABLES.SiteAccess, {
        SiteAccessUUID: generateUUID(),
        Site: site.Id,
        Person: personId,
        AccessStatus: "Pending",
        CreatedAt1: now,
        UpdatedAt1: now,
      });
    }

    const resp = NextResponse.json({
      personId,
      accessToken: token,
      passcode: passcodeHash ? String(passcode).trim() : null,
      siteCode: site ? site.SiteCode : null,
      siteName: site ? site.SiteName : null,
      note: site
        ? "Registration complete. Site access is pending admin approval."
        : "Registration complete. Save your access token — you can request site access later.",
    });
    resp.cookies.set(WORKER_COOKIE, createWorkerSession(personId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: WORKER_MAX_AGE,
    });
    return resp;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
