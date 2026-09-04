import { NextResponse } from "next/server";
import { TABLES, create, list, update, findSiteByCode, ensurePasscodeColumn, ensureCredentialColumns, ensurePrivacyColumns, ensurePersonPhotoColumn } from "@/lib/nocodb";
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
import { privacyAcceptance } from "@/lib/privacy";
import { guard, HOUR } from "@/lib/rate-limit";
import { cardImageCreateFields } from "@/lib/media";
import { evaluatePresence, gateCookieFromRequest } from "@/lib/presence";
import { isKioskRequest } from "@/lib/kiosk";
import {
  isAccessQueueReason,
  pendingApprovalNote,
  signInAccess,
  siteAccessBlockedPayload,
} from "@/lib/site-access";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyName, companyABN,
      workerType, jobRole, whiteCardNumber, whiteCardExpiry, whiteCardImage,
      licenceNumber, licenceType, licenceExpiry, licenceImage, photo,
      emergencyContactName, emergencyContactPhone,
      acknowledgedSiteRules, fitForWorkConfirmed, passcode, privacyAccepted,
      lat, lng, kiosk,
    } = await request.json();
    const kioskMode = isKioskRequest(kiosk);

    if (!siteCode || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Missing required fields: siteCode, firstName, lastName" },
        { status: 400 }
      );
    }
    if (privacyAccepted !== true) {
      return NextResponse.json(
        { error: "Please confirm you have read how your details are used." },
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
      "Id,SiteUUID,SiteName,SiteCode,Status,RequiresInduction,Latitude,Longitude"
    );
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    if (site.Status !== "Active" && site.Status !== "Setup") {
      return NextResponse.json({ error: "Site is not active" }, { status: 400 });
    }

    const presence = evaluatePresence({
      siteCode,
      lat,
      lng,
      site,
      gateToken: gateCookieFromRequest(request),
    });
    if (!presence.ok) {
      return NextResponse.json({ error: presence.error }, { status: presence.status });
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
      // They have just accepted the current notice, so stamp it — people
      // registered before the notice existed would otherwise never have one.
      personId = existing.Id;
      personUUID = existing.PersonUUID;
      companyRowId = existing.Companies_id ?? null;
      await ensurePrivacyColumns("people");
      await update(TABLES.People, {
        Id: personId,
        ...privacyAcceptance(now),
        UpdatedAt1: now,
      });
    } else {
      const images = cardImageCreateFields(whiteCardImage, licenceImage, photo);
      if (images.error) {
        return NextResponse.json({ error: images.error }, { status: 400 });
      }
      if (whiteCardExpiry || licenceExpiry || images.fields.WhiteCardImage || images.fields.LicenceImage) {
        await ensureCredentialColumns();
      }
      if (images.fields.PersonPhoto) await ensurePersonPhotoColumn();
      companyRowId = await resolveOrCreateCompany(companyName, companyABN);
      token = generateAccessToken();
      personUUID = generateUUID();
      await ensurePrivacyColumns("people");
      personId = await create(TABLES.People, {
        PersonUUID: personUUID,
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
        AccessTokenHash: hashToken(token),
        PasscodeHash: passcodeHash,
        AccessEnabled: true,
        CreatedAt1: now,
        UpdatedAt1: now,
      });
    }

    // Being at the gate is not approval. A missing row becomes Pending so it
    // shows in Admin → People; an existing row is left as the admin left it.
    const existingAccess = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${personId})~and(Sites_id,eq,${site.Id})`,
      limit: 1,
      fields: "Id,AccessStatus,StartDate",
    });
    let accessStatus: unknown = existingAccess[0]?.AccessStatus;
    if (!existingAccess[0]) {
      await create(TABLES.SiteAccess, {
        SiteAccessUUID: generateUUID(),
        Site: site.Id,
        Person: personId,
        AccessStatus: "Pending",
        StartDate: now,
        CreatedAt1: now,
        UpdatedAt1: now,
      });
      accessStatus = "Pending";
    }
    const accessDecision = signInAccess(accessStatus);
    if (!accessDecision.ok) {
      if (!isAccessQueueReason(accessDecision.reason)) {
        return NextResponse.json(siteAccessBlockedPayload(accessDecision.reason), {
          status: 403,
        });
      }
      const pending = NextResponse.json({
        personId,
        personUUID,
        accessToken: token,
        siteCode,
        siteName: site.SiteName,
        pendingApproval: true,
        recovered: Boolean(existing),
        note: pendingApprovalNote(),
      });
      if (!kioskMode) {
        pending.cookies.set(WORKER_COOKIE, createWorkerSession(personId), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: WORKER_MAX_AGE,
        });
      }
      return pending;
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
      if (!kioskMode) {
        resp.cookies.set(WORKER_COOKIE, createWorkerSession(personId), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: WORKER_MAX_AGE,
        });
      }
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
      SignInMethod: presence.method,
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
    if (!kioskMode) {
      resp.cookies.set(WORKER_COOKIE, createWorkerSession(personId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: WORKER_MAX_AGE,
      });
    }
    return resp;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}