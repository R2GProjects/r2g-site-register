import { NextResponse } from "next/server";
import { TABLES, list, attachSiteDetails, isoDateParam, numericId } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const siteId = numericId(searchParams.get("siteId"));
    const fromDate = isoDateParam(searchParams.get("from"));
    const toDate = isoDateParam(searchParams.get("to"));

    const conditions: string[] = [];
    if (siteId) conditions.push(`(Sites_id,eq,${siteId})`);
    if (fromDate) conditions.push(`(SignInTime,gte,${fromDate})`);
    if (toDate) conditions.push(`(SignInTime,lte,${toDate})`);

    const where = conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : `(${conditions.join("~and")})`
      : "";

    const records = await attachSiteDetails(await list<Record<string, unknown>>(TABLES.Attendance, {
      where,
      sort: "-SignInTime",
      limit: 2000,
      fields: "Id,AttendanceUUID,AttendanceType,SignInTime,SignOutTime,SignInMethod,WorkActivity,Status,Site,Person,Visitor,Company,CreatedAt1",
    }));

    const header = "SiteCode,SiteName,Type,Name,SignInTime,SignOutTime,Status,WorkActivity,SignInMethod\n";
    const rows = records.map(r => {
      const site = r.Site as { SiteCode?: string; SiteName?: string } | undefined;
      const personName = r.Person
        ? `${(r.Person as { FirstName?: string })?.FirstName || ""} ${(r.Person as { LastName?: string })?.LastName || ""}`
        : r.Visitor
          ? `${(r.Visitor as { FirstName?: string })?.FirstName || ""} ${(r.Visitor as { LastName?: string })?.LastName || ""}`
          : "";
      return [
        site?.SiteCode || "",
        site?.SiteName || "",
        r.AttendanceType || "",
        personName,
        r.SignInTime || "",
        r.SignOutTime || "",
        r.Status || "",
        r.WorkActivity || "",
        r.SignInMethod || "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    }).join("\n");

    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="attendance-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}