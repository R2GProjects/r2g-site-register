import { NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/auth";
import { allowedValue } from "@/lib/nocodb";
import { loadTimesheets, timesheetQueryFrom } from "@/lib/timesheet-run";
import {
  timesheetCompaniesCsv,
  timesheetPeopleCsv,
  timesheetShiftsCsv,
} from "@/lib/timesheet";

const GROUPS = ["people", "companies", "shifts"] as const;

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const group = allowedValue(searchParams.get("group"), GROUPS) || "shifts";
    const report = await loadTimesheets(timesheetQueryFrom(searchParams));
    const body =
      group === "people"
        ? timesheetPeopleCsv(report.people)
        : group === "companies"
          ? timesheetCompaniesCsv(report.companies)
          : timesheetShiftsCsv(report.people);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="timesheet-${group}-${day}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
