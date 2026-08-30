import { NextResponse } from "next/server";
import { TABLES, list, getOne, attachSiteDetails, attachPersonDetails, attachVisitorDetails } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";
import { buildAttendanceSummary, hoursLogged, personName } from "@/lib/attendance";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const siteId = parseInt(params.id);
    if (isNaN(siteId)) {
      return NextResponse.json({ error: "Invalid site id" }, { status: 400 });
    }

    const site = await getOne<Record<string, unknown>>(TABLES.Sites, siteId);
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const records = await attachVisitorDetails(await attachPersonDetails(await attachSiteDetails(
      await list<Record<string, unknown>>(TABLES.Attendance, {
        where: `(Sites_id,eq,${siteId})`,
        sort: "-SignInTime",
        limit: 2000,
      })
    )));

    const history: Array<Record<string, unknown>> = records.map(row => ({
      ...row,
      Hours: hoursLogged(row.SignInTime, row.SignOutTime),
      DisplayName: personName(row),
    }));
    const onsite = history.filter(row => row.Status === "OnSite");

    return NextResponse.json({
      site,
      onsite,
      history,
      summary: buildAttendanceSummary(records),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
