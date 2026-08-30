import { NextResponse } from "next/server";
import { TABLES, list, create, update, findSiteByCode } from "@/lib/nocodb";
import { getClientIP, nowISO, generateUUID } from "@/lib/auth";
import { resolvePerson } from "@/lib/person-auth";

export async function POST(request: Request) {
  try {
    const { accessToken, passcode, siteCode, workActivity, acknowledgedSiteRules, fitForWorkConfirmed } = await request.json();
    if (!siteCode) {
      return NextResponse.json({ error: "Missing siteCode" }, { status: 400 });
    }

    const resolved = await resolvePerson({ accessToken, passcode });
    if (!resolved.person) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status || 401 });
    }
    const person = resolved.person;
    if (!person.AccessEnabled) {
      return NextResponse.json({ error: "Access disabled" }, { status: 403 });
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

    const now = nowISO();
    let access = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${person.Id})~and(Sites_id,eq,${site.Id})~and(AccessStatus,eq,Approved)`,
      limit: 1,
    });
    if (!access[0]) {
      const existingAccess = await list<Record<string, unknown>>(TABLES.SiteAccess, {
        where: `(People_id,eq,${person.Id})~and(Sites_id,eq,${site.Id})`,
        limit: 1,
      });
      if (existingAccess[0]) {
        await update(TABLES.SiteAccess, {
          Id: existingAccess[0].Id as number,
          AccessStatus: "Approved",
          ApprovedDate: now,
          StartDate: (existingAccess[0].StartDate as string) || now,
          UpdatedAt1: now,
        });
        access = [{ ...existingAccess[0], AccessStatus: "Approved" }];
      } else {
        const accessId = await create(TABLES.SiteAccess, {
          SiteAccessUUID: generateUUID(),
          Site: site.Id,
          Person: person.Id,
          AccessStatus: "Approved",
          StartDate: now,
          CreatedAt1: now,
          UpdatedAt1: now,
        });
        access = [{ Id: accessId, SiteInductionComplete: false }];
      }
    }
    const sa = access[0];
    if (sa.EndDate) {
      const end = new Date(sa.EndDate as string);
      if (end < new Date()) {
        return NextResponse.json({ error: "Site access has expired" }, { status: 403 });
      }
    }

    // Induction gating: block sign-in if site requires induction and worker hasn't completed it
    if (site.RequiresInduction && !sa.SiteInductionComplete) {
      return NextResponse.json(
        { error: "Site induction required before sign-in", inductionRequired: true, siteCode: site.SiteCode as string },
        { status: 403 }
      );
    }

    const existing = await list<Record<string, unknown>>(TABLES.Attendance, {
      where: `(People_id,eq,${person.Id})~and(Status,eq,OnSite)`,
      limit: 1,
      fields: "Id,AttendanceUUID,SignInTime,Status,Site,Sites_id",
    });
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";

    if (existing[0]) {
      const existingSiteId =
        (existing[0].Site as { Id?: number } | undefined)?.Id ??
        (existing[0].Sites_id as number | undefined);
      if (existingSiteId === site.Id) {
        return NextResponse.json({
          attendanceId: existing[0].Id,
          person: { Id: person.Id, FirstName: person.FirstName, LastName: person.LastName },
          site: { Id: site.Id, SiteCode: site.SiteCode, SiteName: site.SiteName },
          signedInAt: existing[0].SignInTime,
          alreadyOnSite: true,
        });
      }
      await update(TABLES.Attendance, {
        Id: existing[0].Id as number,
        SignOutTime: now,
        SignOutIP: ip,
        SignOutUserAgent: ua,
        Status: "SignedOut",
        UpdatedAt1: now,
      });
    }

    const attendanceId = await create(TABLES.Attendance, {
      AttendanceUUID: generateUUID(),
      Site: site.Id,
      Person: person.Id,
      Company: person.Companies_id ?? null,
      AttendanceType: person.WorkerType || "Contractor",
      SignInTime: now,
      SignInMethod: "PersonalQR",
      WorkActivity: workActivity || null,
      AcknowledgedSiteRules: acknowledgedSiteRules || false,
      FitForWorkConfirmed: fitForWorkConfirmed || false,
      SignInIP: ip,
      SignInUserAgent: ua,
      Status: "OnSite",
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    return NextResponse.json({
      attendanceId,
      person: { Id: person.Id, FirstName: person.FirstName, LastName: person.LastName },
      site: { Id: site.Id, SiteCode: site.SiteCode, SiteName: site.SiteName },
      signedInAt: now,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}