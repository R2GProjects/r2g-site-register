import { NextResponse } from "next/server";
import { TABLES, create, findSiteByCode, ensurePrivacyColumns } from "@/lib/nocodb";
import { getClientIP, nowISO, generateUUID, createVisitorPass } from "@/lib/auth";
import { guard, HOUR } from "@/lib/rate-limit";
import { privacyAcceptance } from "@/lib/privacy";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyName, reasonForVisit, personVisiting,
      emergencyContactName, emergencyContactPhone,
      acknowledgedSiteRules, privacyAccepted,
    } = await request.json();

    if (!siteCode || !firstName || !lastName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (privacyAccepted !== true) {
      return NextResponse.json(
        { error: "Please confirm you have read how your details are used." },
        { status: 400 }
      );
    }

    const limit = guard(request, "register-visitor", {
      limit: 60,
      windowMs: HOUR,
      message: "Too many visitor sign-ins from this connection. Try again later.",
    });
    if (limit.blocked) return limit.blocked;

    const site = await findSiteByCode(siteCode, "Id,SiteUUID,SiteName,SiteCode,Status");
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    if (site.Status !== "Active" && site.Status !== "Setup") {
      return NextResponse.json({ error: "Site is not active" }, { status: 400 });
    }

    const now = nowISO();
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";

    await ensurePrivacyColumns("visitors");
    const visitorId = await create(TABLES.Visitors, {
      VisitorUUID: generateUUID(),
      ...privacyAcceptance(now),
      FirstName: firstName,
      LastName: lastName,
      Mobile: mobile || null,
      Email: email || null,
      CompanyName: companyName || null,
      ReasonForVisit: reasonForVisit || null,
      PersonVisiting: personVisiting || null,
      EmergencyContactName: emergencyContactName || null,
      EmergencyContactPhone: emergencyContactPhone || null,
      CreatedAt1: now,
    });

    const attendanceId = await create(TABLES.Attendance, {
      AttendanceUUID: generateUUID(),
      Site: site.Id,
      Visitor: visitorId,
      AttendanceType: "Visitor",
      SignInTime: now,
      SignInMethod: "Visitor",
      AcknowledgedSiteRules: acknowledgedSiteRules || false,
      SignInIP: ip,
      SignInUserAgent: ua,
      Status: "OnSite",
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    return NextResponse.json({
      visitorId,
      attendanceId,
      siteName: site.SiteName,
      signedInAt: now,
      // Lets the visitor reopen their own sign-out screen after closing the tab.
      passToken: createVisitorPass(visitorId, attendanceId),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}