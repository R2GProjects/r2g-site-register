import { NextResponse } from "next/server";
import { TABLES, list, numericId, linkedSiteId } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";

const SITE_FIELDS =
  "Id,SiteUUID,SiteName,SiteCode,SiteManager,SiteManagerPhone,Address";

const PERSON_FIELDS =
  "Id,FirstName,LastName,EmergencyContactName,EmergencyContactPhone,WorkerType,Mobile,Company";

const VISITOR_FIELDS =
  "Id,FirstName,LastName,EmergencyContactName,EmergencyContactPhone,CompanyName,ReasonForVisit,Mobile";

/** NocoDB takes ids in the query string, so they are fetched in bounded chunks. */
async function listByIds(
  tableId: string,
  ids: number[],
  fields: string
): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await list<Record<string, unknown>>(tableId, {
      where: `(Id,in,${chunk.join(",")})`,
      fields,
      limit: chunk.length,
    });
    for (const row of rows) map.set(row.Id as number, row);
  }
  return map;
}

function linkedPersonId(record: Record<string, unknown>): number | null {
  const person = record.Person as { Id?: unknown } | null;
  if (person && typeof person === "object" && typeof person.Id === "number") {
    return person.Id;
  }
  return typeof record.People_id === "number" ? record.People_id : null;
}

function linkedVisitorId(record: Record<string, unknown>): number | null {
  const visitor = record.Visitor as { Id?: unknown } | null;
  if (visitor && typeof visitor === "object" && typeof visitor.Id === "number") {
    return visitor.Id;
  }
  return typeof record.Visitors_id === "number" ? record.Visitors_id : null;
}

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
          fields: SITE_FIELDS,
        })
      : await list<Record<string, unknown>>(TABLES.Sites, {
          where: "(Status,eq,Active)",
          fields: SITE_FIELDS,
        });

    if (activeSites.length === 0) return NextResponse.json([]);
    const siteIds = new Set(activeSites.map((s) => s.Id as number));

    // Everyone currently on site, in one query. This is bounded by how many
    // people are on site right now, not by how much history exists.
    const onSite = await list<Record<string, unknown>>(TABLES.Attendance, {
      where: "(Status,eq,OnSite)",
      fields:
        "Id,AttendanceUUID,AttendanceType,SignInTime,SignInMethod,Status,Person,Visitor,Sites_id,Site,CreatedAt1",
      limit: 2000,
      sort: "SignInTime",
    });

    const relevant = onSite.filter((a) => {
      const id = linkedSiteId(a);
      return id != null && siteIds.has(id);
    });

    const personIds = [
      ...new Set(
        relevant
          .filter((a) => a.AttendanceType !== "Visitor")
          .map(linkedPersonId)
          .filter((id): id is number => id != null)
      ),
    ];
    const visitorIds = [
      ...new Set(
        relevant
          .filter((a) => a.AttendanceType === "Visitor")
          .map(linkedVisitorId)
          .filter((id): id is number => id != null)
      ),
    ];

    const [peopleById, visitorsById] = await Promise.all([
      listByIds(TABLES.People, personIds, PERSON_FIELDS),
      listByIds(TABLES.Visitors, visitorIds, VISITOR_FIELDS),
    ]);

    const result = activeSites.map((site) => {
      const forSite = relevant.filter((a) => linkedSiteId(a) === site.Id);

      const workers = forSite
        .filter((a) => a.AttendanceType !== "Visitor")
        .map((attendance) => {
          const id = linkedPersonId(attendance);
          return { attendance, person: (id && peopleById.get(id)) || null };
        });

      const visitors = forSite
        .filter((a) => a.AttendanceType === "Visitor")
        .map((attendance) => {
          const id = linkedVisitorId(attendance);
          return { attendance, visitor: (id && visitorsById.get(id)) || null };
        });

      return {
        site,
        workerCount: workers.length,
        visitorCount: visitors.length,
        workers,
        visitors,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
