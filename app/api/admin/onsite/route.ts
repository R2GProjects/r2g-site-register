import { NextResponse } from "next/server";
import { TABLES, list, attachSiteDetails, numericId } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";
import type { Attendance } from "@/lib/types";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const siteId = numericId(searchParams.get("siteId"));

    let where = "(Status,eq,OnSite)";
    if (siteId) where = `(${where}~and(Sites_id,eq,${siteId}))`;

    const records = await list<Attendance>(TABLES.Attendance, {
      where,
      fields: "Id,AttendanceUUID,AttendanceType,SignInTime,SignInMethod,WorkActivity,Status,Site,Sites_id,Person,People_id,Visitor,Company,CreatedAt1",
      sort: "-SignInTime",
      limit: 200,
    });

    return NextResponse.json(await attachSiteDetails(records as unknown as Record<string, unknown>[]));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
