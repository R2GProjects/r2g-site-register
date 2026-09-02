import { NextResponse } from "next/server";
import { TABLES, list, numericId, ensurePersonPhotoColumn } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";
import {
  buildEvacuationRoll,
  isVisitorAttendance,
  linkedPersonId,
  linkedVisitorId,
} from "@/lib/emergency";

const SITE_FIELDS =
  "Id,SiteUUID,SiteName,SiteCode,SiteManager,SiteManagerPhone,Address";

const PERSON_FIELDS =
  "Id,FirstName,LastName,EmergencyContactName,EmergencyContactPhone,WorkerType,Mobile,Company,PersonPhoto";

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

    // Everyone currently on site, in one query. This is bounded by how many
    // people are on site right now, not by how much history exists.
    const onSite = await list<Record<string, unknown>>(TABLES.Attendance, {
      where: "(Status,eq,OnSite)",
      fields:
        "Id,AttendanceUUID,AttendanceType,SignInTime,SignInMethod,Status,Person,Visitor,Sites_id,Site,CreatedAt1",
      limit: 2000,
      sort: "SignInTime",
    });

    const personIds = [
      ...new Set(
        onSite
          .filter((a) => !isVisitorAttendance(a))
          .map(linkedPersonId)
          .filter((id): id is number => id != null)
      ),
    ];
    const visitorIds = [
      ...new Set(
        onSite
          .filter(isVisitorAttendance)
          .map(linkedVisitorId)
          .filter((id): id is number => id != null)
      ),
    ];

    const [peopleById, visitorsById] = await Promise.all([
      (async () => {
        await ensurePersonPhotoColumn();
        return listByIds(TABLES.People, personIds, PERSON_FIELDS);
      })(),
      listByIds(TABLES.Visitors, visitorIds, VISITOR_FIELDS),
    ]);

    return NextResponse.json(
      buildEvacuationRoll(activeSites, onSite, peopleById, visitorsById)
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}