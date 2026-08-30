import { NextResponse } from "next/server";
import { TABLES, list, create, findSiteByCode, ensurePasscodeColumn } from "@/lib/nocodb";
import { generateAccessToken, hashToken, hashPasscode, nowISO, generateUUID, validatePasscode } from "@/lib/auth";

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

    let site: Record<string, unknown> | null = null;
    if (siteCode) {
      site = await findSiteByCode(siteCode, "Id,SiteUUID,SiteName,SiteCode,Status");
      if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    let companyRowId: number | null = null;
    if (companyId) {
      companyRowId = companyId;
    } else if (companyName) {
      const existing = await list<Record<string, unknown>>(TABLES.Companies, {
        where: `(CompanyName,eq,${companyName})`,
        limit: 1,
        fields: "Id",
      });
      if (existing[0]) {
        companyRowId = existing[0].Id as number;
      } else {
        const coUUID = generateUUID();
        const now = nowISO();
        companyRowId = await create(TABLES.Companies, {
          CompanyUUID: coUUID,
          CompanyName: companyName,
          ABN: companyABN || null,
          Status: "Active",
          CreatedAt1: now,
          UpdatedAt1: now,
        });
      }
    }

    let passcodeHash: string | null = null;
    if (passcode && String(passcode).trim()) {
      const invalid = validatePasscode(String(passcode));
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
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
      passcode: passcode && String(passcode).trim() ? String(passcode).trim() : null,
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