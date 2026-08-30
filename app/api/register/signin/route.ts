import { NextResponse } from "next/server";
import { TABLES, create, findSiteByCode, ensurePasscodeColumn } from "@/lib/nocodb";
import {
  generateAccessToken,
  hashToken,
  hashPasscode,
  nowISO,
  generateUUID,
  getClientIP,
  normalizeMobile,
  validatePasscode,
  createWorkerSession,
  WORKER_COOKIE,
  WORKER_MAX_AGE,
} from "@/lib/auth";
import { resolveOrCreateCompany } from "@/lib/company";
import { guard, HOUR } from "@/lib/rate-limit";

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

    // Sized for a crew onboarding from one site wifi address, not a single user.
    const limit = guard(request, "register-signin", {
      limit: 60,
      windowMs: HOUR,
      message: "Too many registrations from this connection. Try again later.",
    });
    if (limit.blocked) return limit.blocked;

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

    const companyRowId = await resolveOrCreateCompany(companyName, companyABN);

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
    await create(TABLES.SiteAccess, {
      SiteAccessUUID: generateUUID(),
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

    const resp = NextResponse.json({
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
