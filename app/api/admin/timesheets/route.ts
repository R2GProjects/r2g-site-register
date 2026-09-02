import { NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/auth";
import { loadTimesheets, timesheetQueryFrom } from "@/lib/timesheet-run";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const report = await loadTimesheets(timesheetQueryFrom(searchParams));
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
