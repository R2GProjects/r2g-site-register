import { NextResponse } from "next/server";
import { TABLES, listPage } from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const onsiteRes = await listPage<Record<string, unknown>>(TABLES.Attendance, {
      where: "(Status,eq,OnSite)",
      limit: 1,
    });
    const totalPeople = await listPage<Record<string, unknown>>(TABLES.People, { limit: 1 });
    const totalSites = await listPage<Record<string, unknown>>(TABLES.Sites, { limit: 1 });
    const onsiteCount = onsiteRes.totalRows;
    const workerOnsiteRes = await listPage<Record<string, unknown>>(TABLES.Attendance, {
      where: "(Status,eq,OnSite)~and(AttendanceType,neq,Visitor)",
      limit: 1,
    });
    const visitorOnsiteRes = await listPage<Record<string, unknown>>(TABLES.Attendance, {
      where: "(Status,eq,OnSite)~and(AttendanceType,eq,Visitor)",
      limit: 1,
    });
    const activeSitesRes = await listPage<Record<string, unknown>>(TABLES.Sites, {
      where: "(Status,eq,Active)",
      limit: 1,
    });

    return NextResponse.json({
      onsite: onsiteCount,
      workerOnsite: workerOnsiteRes.totalRows,
      visitorOnsite: visitorOnsiteRes.totalRows,
      totalPeople: totalPeople.totalRows,
      totalSites: totalSites.totalRows,
      activeSites: activeSitesRes.totalRows,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}