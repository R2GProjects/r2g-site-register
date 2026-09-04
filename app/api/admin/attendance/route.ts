import { NextResponse } from "next/server";
import { TABLES, list, listPage, attachSiteDetails, attachPersonDetails, attachVisitorDetails, allowedValue, numericId } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";
import {
  buildAttendanceSummary,
  dayBoundaryISO,
  hoursLogged,
  includeAttendanceSummary,
} from "@/lib/attendance";

const ATTENDANCE_STATUSES = ["OnSite", "SignedOut", "EmergencyEvacuated", "AutoClosed"] as const;
const SUMMARY_FIELDS =
  "Id,SignInTime,SignOutTime,Status,Person,People_id,Visitor,Visitors_id";

async function enrichAttendance(records: Array<Record<string, unknown>>) {
  const withSites = await attachSiteDetails(records);
  const withPeople = await attachPersonDetails(withSites);
  return attachVisitorDetails(withPeople);
}

async function enrichSummary(records: Array<Record<string, unknown>>) {
  const withPeople = await attachPersonDetails(records);
  return attachVisitorDetails(withPeople);
}

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const siteId = numericId(searchParams.get("siteId"));
    const personId = numericId(searchParams.get("personId"));
    const status = allowedValue(searchParams.get("status"), ATTENDANCE_STATUSES);
    // Dates arrive as plain YYYY-MM-DD and are widened to the site's local day.
    const from = dayBoundaryISO(searchParams.get("from"), "start");
    const to = dayBoundaryISO(searchParams.get("to"), "end");
    const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50") || 50));
    const offset = page * limit;

    const conditions: string[] = [];
    if (siteId) conditions.push(`(Sites_id,eq,${siteId})`);
    if (personId) conditions.push(`(People_id,eq,${personId})`);
    if (status) conditions.push(`(Status,eq,${status})`);
    if (from) conditions.push(`(SignInTime,gte,${from})`);
    if (to) conditions.push(`(SignInTime,lte,${to})`);

    const where = conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : `(${conditions.join("~and")})`
      : "";

    const result = await listPage<Record<string, unknown>>(TABLES.Attendance, {
      where,
      limit,
      offset,
      sort: "-SignInTime",
    });
    const listRows = await enrichAttendance(result.list);
    const wantSummary = includeAttendanceSummary(page, searchParams.get("summary"));
    let summary = null;
    let capped = false;
    if (wantSummary) {
      const all = await list<Record<string, unknown>>(TABLES.Attendance, {
        where,
        limit: 2000,
        sort: "-SignInTime",
        fields: SUMMARY_FIELDS,
      });
      capped = all.length >= 2000;
      summary = buildAttendanceSummary(await enrichSummary(all));
    }
    return NextResponse.json({
      ...result,
      list: listRows.map(row => ({
        ...row,
        Hours: hoursLogged(row.SignInTime, row.SignOutTime),
      })),
      summary,
      capped,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}