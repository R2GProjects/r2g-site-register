import { NextResponse } from "next/server";
import { TABLES, list, numericId } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const siteId = numericId(searchParams.get("siteId"));

    const activeSites = siteId
      ? await list<Record<string, unknown>>(TABLES.Sites, {
          where: `(Id,eq,${siteId})`,
          limit: 1,
          fields: "Id,SiteUUID,SiteName,SiteCode,SiteManager,SiteManagerPhone,Address",
        })
      : await list<Record<string, unknown>>(TABLES.Sites, {
          where: "(Status,eq,Active)",
          fields: "Id,SiteUUID,SiteName,SiteCode,SiteManager,SiteManagerPhone,Address",
        });

    const result = [];

    for (const site of activeSites) {
      const onsitePeople = await list<Record<string, unknown>>(TABLES.Attendance, {
        where: `(Sites_id,eq,${site.Id})~and(Status,eq,OnSite)~and(AttendanceType,neq,Visitor)`,
        fields: "Id,AttendanceUUID,AttendanceType,SignInTime,SignInMethod,Status,Person,CreatedAt1",
        limit: 500,
      });

      const onsiteVisitors = await list<Record<string, unknown>>(TABLES.Attendance, {
        where: `(Sites_id,eq,${site.Id})~and(Status,eq,OnSite)~and(AttendanceType,eq,Visitor)`,
        fields: "Id,AttendanceUUID,SignInTime,Status,Visitor,CreatedAt1",
        limit: 500,
      });

      const peopleWithDetails = [];
      for (const att of onsitePeople) {
        const pid = (att.Person as { Id: number })?.Id;
        if (pid) {
          const persons = await list<Record<string, unknown>>(TABLES.People, {
            where: `(Id,eq,${pid})`,
            limit: 1,
            fields: "Id,FirstName,LastName,EmergencyContactName,EmergencyContactPhone,WorkerType,Company",
          });
          peopleWithDetails.push({ attendance: att, person: persons[0] || null });
        }
      }

      const visitorsWithDetails = [];
      for (const att of onsiteVisitors) {
        const vid = (att.Visitor as { Id: number })?.Id;
        if (vid) {
          const visitors = await list<Record<string, unknown>>(TABLES.Visitors, {
            where: `(Id,eq,${vid})`,
            limit: 1,
            fields: "Id,FirstName,LastName,EmergencyContactName,EmergencyContactPhone,CompanyName,ReasonForVisit",
          });
          visitorsWithDetails.push({ attendance: att, visitor: visitors[0] || null });
        }
      }

      result.push({
        site,
        workerCount: onsitePeople.length,
        visitorCount: onsiteVisitors.length,
        workers: peopleWithDetails,
        visitors: visitorsWithDetails,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
