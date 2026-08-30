import { NextResponse } from "next/server";
import { TABLES, list, listPage, attachSiteDetails, attachPersonDetails, attachVisitorDetails } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";
import { buildAttendanceSummary, hoursLogged } from "@/lib/attendance";

async function enrichAttendance(records: Array<Record<string, unknown>>) {
  const withSites = await attachSiteDetails(records);
  const withPeople = await attachPersonDetails(withSites);
  return attachVisitorDetails(withPeople);
}

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const personId = searchParams.get("personId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = page * limit;

    const conditions: string[] = [];
    if (siteId) conditions.push(`(Sites_id,eq,${siteId})`);
    if (personId) conditions.push(`(People_id,eq,${personId})`);
    if (status) conditions.push(`(Status,eq,${status})`);

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
    const all = await list<Record<string, unknown>>(TABLES.Attendance, {
      where,
      limit: 2000,
      sort: "-SignInTime",
    });
    const listRows = await enrichAttendance(result.list);
    const summaryRows = await enrichAttendance(all);
    return NextResponse.json({
      ...result,
      list: listRows.map(row => ({
        ...row,
        Hours: hoursLogged(row.SignInTime, row.SignOutTime),
      })),
      summary: buildAttendanceSummary(summaryRows),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}