import { NextResponse } from "next/server";
import { TABLES, list, create, findSiteByCode } from "@/lib/nocodb";
import { getClientIP, nowISO, generateUUID } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const {
      siteCode, firstName, lastName, mobile, email,
      companyName, reasonForVisit, personVisiting,
      emergencyContactName, emergencyContactPhone,
      acknowledgedSiteRules,
    } = await request.json();

    if (!siteCode || !firstName || !lastName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const site = await findSiteByCode(siteCode, "Id,SiteUUID,SiteName,SiteCode,Status");
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    if (site.Status !== "Active" && site.Status !== "Setup") {
      return NextResponse.json({ error: "Site is not active" }, { status: 400 });
    }

    const now = nowISO();
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";

    const visitorId = await create(TABLES.Visitors, {
      VisitorUUID: generateUUID(),
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
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}