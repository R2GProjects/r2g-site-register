import { NextResponse } from "next/server";
import { TABLES, create, list, update, findSiteByCode, ensurePasscodeColumn, ensureCredentialColumns } from "@/lib/nocodb";
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
  verifyPasscode,
  WORKER_COOKIE,
  WORKER_MAX_AGE,
} from "@/lib/auth";
import { resolveOrCreateCompany } from "@/lib/company";
import { findDuplicatePerson } from "@/lib/person-auth";
import { guard, HOUR } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyName, companyABN,
      workerType, jobRole, whiteCardNumber, whiteCardExpiry,
      licenceNumber, licenceType, licenceExpiry,
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

    const now = nowISO();

    // Someone who has forgotten their passcode naturally registers again. Left
    // alone that creates a second identity and splits their hours, inductions
    // and site access across two records.
    const existing = await findDuplicatePerson({ mobile, email });
    const suppliedPasscode = passcode ? String(passcode).trim() : "";
    const recognised = Boolean(
      existing &&
        suppliedPasscode &&
        existing.PasscodeHash &&
        verifyPasscode(suppliedPasscode, existing.PasscodeHash)
    );

    if (existing && !recognised) {
      return NextResponse.json(
        {
          error: existing.PasscodeHash
            ? "You are already registered. Sign in with your mobile and passcode instead — entering the right passcode here will also work."
            : "You are already registered. Use your access token to sign in, or ask the site supervisor to look you up.",
          duplicate: true,
          hasPasscode: Boolean(existing.PasscodeHash),
        },
        { status: 409 }
      );
    }

    let personId: number;
    let personUUID: string;
    let companyRowId: number | null;
    let token: string | null = null;

    if (existing) {
      // Recovery: the passcode proved who they are, so reuse the record.
      personId = existing.Id;
      personUUID = existing.PersonUUID;
      companyRowId = existing.Companies_id ?? null;
    } else {
      if (whiteCardExpiry || licenceExpiry) await ensureCredentialColumns();
      companyRowId = await resolveOrCreateCompany(companyName, companyABN);
      token = generateAccessToken();
      personUUID = generateUUID();
      personId = await create(TABLES.People, {
        PersonUUID: personUUID,
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
        EmergencyContactName: emergencyContactName || null,
        EmergencyContactPhone: emergencyContactPhone || null,
        AccessTokenHash: hashToken(token),
        PasscodeHash: passcodeHash,
        AccessEnabled: true,
        CreatedAt1: now,
        UpdatedAt1: now,
      });
    }

    // Auto-approve SiteAccess — worker is physically present at site
    const existingAccess = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${personId})~and(Sites_id,eq,${site.Id})`,
      limit: 1,
      fields: "Id,AccessStatus,StartDate",
    });
    if (existingAccess[0]) {
      await update(TABLES.SiteAccess, {
        Id: existingAccess[0].Id as number,
        AccessStatus: "Approved",
        StartDate: (existingAccess[0].StartDate as string) || now,
        UpdatedAt1: now,
      });
    } else {
      await create(TABLES.SiteAccess, {
        SiteAccessUUID: generateUUID(),
        Site: site.Id,
        Person: personId,
        AccessStatus: "Approved",
        StartDate: now,
        CreatedAt1: now,
        UpdatedAt1: now,
      });
    }

    // A recovered worker may already be signed in; a second open record would
    // double their hours and put them on the evacuation list twice.
    const openAttendance = await list<Record<string, unknown>>(TABLES.Attendance, {
      where: `(People_id,eq,${personId})~and(Status,eq,OnSite)`,
      limit: 1,
      fields: "Id,AttendanceUUID,SignInTime",
    });
    if (openAttendance[0]) {
      const resp = NextResponse.json({
        personId,
        personUUID,
        accessToken: null,
        siteCode,
        siteName: site.SiteName,
        attendanceId: openAttendance[0].Id,
        attendanceUUID: openAttendance[0].AttendanceUUID,
        signedInAt: openAttendance[0].SignInTime,
        recovered: true,
        note: "You were already signed in — we found your existing record.",
      });
      resp.cookies.set(WORKER_COOKIE, createWorkerSession(personId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: WORKER_MAX_AGE,
      });
      return resp;
    }

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
      recovered: Boolean(existing),
      note: existing
        ? "Welcome back — we matched you to your existing record and signed you in."
        : "Registration complete. You are signed in to site.",
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
