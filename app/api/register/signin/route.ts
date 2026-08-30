import { NextResponse } from "next/server";
import { TABLES, list, create, findSiteByCode, ensurePasscodeColumn } from "@/lib/nocodb";
import { generateAccessToken, hashToken, hashPasscode, nowISO, generateUUID, getClientIP, validatePasscode } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyName, companyABN,
      workerType, jobRole, whiteCardNumber, licenceNumber, licenceType,
      emergencyContactName, emergencyContactPhone,
      acknowledgedSiteRules, fitForWorkConfirmed, passcode,
    } = await request.json();

    if (!siteCode || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Missing required fields: siteCode, firstName, lastName" },
        { status: 400 }
      );
    }

    const site = await findSiteByCode(
      siteCode,
      "Id,SiteUUID,SiteName,SiteCode,Status,RequiresInduction"
    );
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    if (site.Status !== "Active" && site.Status !== "Setup") {
      return NextResponse.json({ error: "Site is not active" }, { status: 400 });
    }

    // Resolve or create company
    let companyRowId: number | null = null;
    if (companyName) {
      const existing = await list<Record<string, unknown>>(TABLES.Companies, {
        where: `(CompanyName,eq,${companyName})`,
        limit: 1,
        fields: "Id",
      });
      if (existing[0]) {
        companyRowId = existing[0].Id as number;
      } else {
        const now = nowISO();
        companyRowId = await create(TABLES.Companies, {
          CompanyUUID: generateUUID(),
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
    const personUUID = generateUUID();

    const personId = await create(TABLES.People, {
      PersonUUID: personUUID,
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

    // Auto-approve SiteAccess — worker is physically present at site
    const saUUID = generateUUID();
    await create(TABLES.SiteAccess, {
      SiteAccessUUID: saUUID,
      Site: site.Id,
      Person: personId,
      AccessStatus: "Approved",
      StartDate: now,
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    // Immediately sign the worker in — create attendance record
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";
    const attendanceUUID = generateUUID();

    const attendanceId = await create(TABLES.Attendance, {
      AttendanceUUID: attendanceUUID,
      Site: site.Id,
      Person: personId,
      Company: companyRowId ?? null,
      AttendanceType: workerType || "Contractor",
      SignInTime: now,
      SignInMethod: "SelfRegistration",
      WorkActivity: null,
      AcknowledgedSiteRules: acknowledgedSiteRules || false,
      FitForWorkConfirmed: fitForWorkConfirmed || false,
      SignInIP: ip,
      SignInUserAgent: ua,
      Status: "OnSite",
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    return NextResponse.json({
      personId,
      personUUID,
      accessToken: token,
      siteCode,
      siteName: site.SiteName,
      attendanceId,
      attendanceUUID,
      signedInAt: now,
      note: "Registration complete. You are signed in to site.",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}