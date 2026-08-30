import { NextResponse } from "next/server";
import { TABLES, list } from "@/lib/nocodb";
import { resolvePerson } from "@/lib/person-auth";

export async function POST(request: Request) {
  try {
    const { accessToken, passcode } = await request.json();
    const lookup = await resolvePerson({ accessToken, passcode });
    if (!lookup.person) {
      return NextResponse.json({ error: lookup.error || "Invalid access token" }, { status: lookup.status || 401 });
    }

    const person = lookup.person;
    if (!person.AccessEnabled) {
      return NextResponse.json({ error: "Access disabled. Contact admin." }, { status: 403 });
    }

    const siteAccess = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${person.Id})`,
      fields: "Id,SiteAccessUUID,Site,AccessStatus,StartDate,EndDate,SiteInductionComplete",
    });

    const activeAttendance = await list<Record<string, unknown>>(TABLES.Attendance, {
      where: `(People_id,eq,${person.Id})~and(Status,eq,OnSite)`,
      limit: 1,
      fields: "Id,AttendanceUUID,SignInTime,SignInMethod,WorkActivity,Status,Site",
    });

    const siteIds = new Set<number>();
    for (const sa of siteAccess) {
      const sid = (sa.Site as { Id: number })?.Id;
      if (sid) siteIds.add(sid);
    }
    if (activeAttendance[0]) {
      const sid = (activeAttendance[0].Site as { Id: number })?.Id;
      if (sid) siteIds.add(sid);
    }

    const siteMap = new Map<number, Record<string, unknown>>();
    if (siteIds.size > 0) {
      const sites = await list<Record<string, unknown>>(TABLES.Sites, {
        where: `(Id,in,${Array.from(siteIds).join(",")})`,
        fields: "Id,SiteUUID,SiteCode,SiteName,Status,Address,SiteManager",
      });
      for (const s of sites) siteMap.set(s.Id as number, s);
    }

    const enrichedAccess = siteAccess.map(sa => {
      const sid = (sa.Site as { Id: number })?.Id;
      return {
        ...sa,
        Site: sid ? siteMap.get(sid) || sa.Site : sa.Site,
      };
    });

    const onsite = activeAttendance[0]
      ? {
          ...activeAttendance[0],
          Site: siteMap.get((activeAttendance[0].Site as { Id: number })?.Id) || activeAttendance[0].Site,
        }
      : null;

    const { AccessTokenHash: _tokenHash, PasscodeHash: _passHash, ...safePerson } = person;
    return NextResponse.json({
      person: safePerson,
      siteAccess: enrichedAccess,
      onsite,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}