import { NextResponse } from "next/server";
import { TABLES, getOne, attachSiteDetails } from "@/lib/nocodb";
import { readVisitorPass } from "@/lib/auth";
import { guard, MINUTE } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const limit = guard(request, "visitor-status", {
      limit: 60,
      windowMs: 10 * MINUTE,
      message: "Too many requests. Wait a few minutes and try again.",
    });
    if (limit.blocked) return limit.blocked;

    const token = new URL(request.url).searchParams.get("token");
    const pass = readVisitorPass(token);
    if (!pass) {
      return NextResponse.json(
        { error: "This pass is not valid or has expired." },
        { status: 401 }
      );
    }

    const record = await getOne<Record<string, unknown>>(
      TABLES.Attendance,
      pass.attendanceId
    );
    if (!record || Number(record.Visitors_id) !== pass.visitorId) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    const visitor = await getOne<Record<string, unknown>>(
      TABLES.Visitors,
      pass.visitorId
    );
    const [withSite] = await attachSiteDetails([record]);
    const site = withSite.Site as { SiteName?: string; SiteCode?: string } | undefined;

    return NextResponse.json({
      name: `${visitor?.FirstName ?? ""} ${visitor?.LastName ?? ""}`.trim(),
      siteName: site?.SiteName ?? null,
      siteCode: site?.SiteCode ?? null,
      signInTime: record.SignInTime ?? null,
      signOutTime: record.SignOutTime ?? null,
      status: record.Status ?? null,
      onSite: record.Status === "OnSite",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
