import { dayBoundaryISO } from "@/lib/attendance";
import {
  TABLES,
  attachCompanyDetails,
  attachPersonDetails,
  attachSiteDetails,
  attachVisitorDetails,
  getOne,
  list,
  numericId,
} from "@/lib/nocodb";
import {
  buildTimesheets,
  recordMatchesCompany,
  type TimesheetReport,
} from "@/lib/timesheet";

export interface TimesheetQuery {
  siteId: number | null;
  personId: number | null;
  companyId: number | null;
  from: string;
  to: string;
}

export function timesheetQueryFrom(searchParams: URLSearchParams): TimesheetQuery {
  return {
    siteId: numericId(searchParams.get("siteId")),
    personId: numericId(searchParams.get("personId")),
    companyId: numericId(searchParams.get("companyId")),
    from: String(searchParams.get("from") ?? "").trim(),
    to: String(searchParams.get("to") ?? "").trim(),
  };
}

function whereFrom(query: TimesheetQuery): string {
  const from = dayBoundaryISO(query.from, "start");
  const to = dayBoundaryISO(query.to, "end");
  const conditions: string[] = [];
  if (query.siteId) conditions.push(`(Sites_id,eq,${query.siteId})`);
  if (query.personId) conditions.push(`(People_id,eq,${query.personId})`);
  if (from) conditions.push(`(SignInTime,gte,${from})`);
  if (to) conditions.push(`(SignInTime,lte,${to})`);
  if (conditions.length === 0) return "";
  if (conditions.length === 1) return conditions[0];
  return `(${conditions.join("~and")})`;
}

const ATTENDANCE_FIELDS =
  "Id,AttendanceType,SignInTime,SignOutTime,Status,Site,Sites_id,Person,People_id,Visitor,Visitors_id,Company,Companies_id";

export async function loadTimesheets(
  query: TimesheetQuery,
  now = Date.now()
): Promise<TimesheetReport & { recordCount: number; capped: boolean }> {
  const records = await attachCompanyDetails(
    await attachVisitorDetails(
      await attachPersonDetails(
        await attachSiteDetails(
          await list<Record<string, unknown>>(TABLES.Attendance, {
            where: whereFrom(query),
            sort: "-SignInTime",
            limit: 2000,
            fields: ATTENDANCE_FIELDS,
          })
        ),
        "Id,FirstName,LastName,Company,Companies_id"
      )
    )
  );

  let filtered = records;
  if (query.companyId) {
    const company = await getOne<Record<string, unknown>>(
      TABLES.Companies,
      query.companyId
    );
    const name = String(company?.CompanyName ?? "");
    filtered = records.filter((row) =>
      recordMatchesCompany(row, query.companyId!, name)
    );
  }

  return {
    ...buildTimesheets(filtered, now),
    recordCount: filtered.length,
    capped: records.length >= 2000,
  };
}
