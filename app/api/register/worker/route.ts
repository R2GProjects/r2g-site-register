import { NextResponse } from "next/server";
import { TABLES, create, findSiteByCode, ensurePasscodeColumn, numericId } from "@/lib/nocodb";
import {
  generateAccessToken,
  hashToken,
  hashPasscode,
  nowISO,
  generateUUID,
  normalizeMobile,
  validatePasscode,
} from "@/lib/auth";
import { resolveOrCreateCompany } from "@/lib/company";
import { guard, HOUR } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyId, companyName, companyABN,
      workerType, jobRole, whiteCardNumber, licenceNumber, licenceType,
      emergencyContactName, emergencyContactPhone, passcode,
    } = await request.json();

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Missing required fields: firstName, lastName" }, { status: 400 });
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

    const token = generateAccessToken();
    const tokenHash = hashToken(token);
    const now = nowISO();

    const personId = await create(TABLES.People, {
      PersonUUID: generateUUID(),
      FirstName: firstName,
      LastName: lastName,
      Mobile: mobile || null,
      Email: email || null,
      Company: companyRowId,
      WorkerType: workerType || "Contractor",
      JobRole: jobRole || null,
      WhiteCardNumber: whiteCardNumber || null,
      LicenceNumber: licenceNumber || null,
      LicenceType: licenceType || null,
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

    return NextResponse.json({
      personId,
      accessToken: token,
      passcode: passcodeHash ? String(passcode).trim() : null,
      siteCode: site ? site.SiteCode : null,
      siteName: site ? site.SiteName : null,
      note: site
        ? "Registration complete. Site access is pending admin approval."
        : "Registration complete. Save your access token — you can request site access later.",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
