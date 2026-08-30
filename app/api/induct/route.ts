import { NextResponse } from "next/server";
import { findSiteByCode } from "@/lib/nocodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing site code" }, { status: 400 });
    }

    const site = await findSiteByCode(
      code,
      "Id,SiteUUID,SiteCode,SiteName,Address,SiteManager,SiteManagerPhone,EmergencyPlanURL,RequiresInduction,InductionRules"
    );

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    return NextResponse.json({
      siteCode: site.SiteCode,
      siteName: site.SiteName,
      address: site.Address,
      siteManager: site.SiteManager,
      siteManagerPhone: site.SiteManagerPhone,
      emergencyPlanURL: site.EmergencyPlanURL,
      requiresInduction: site.RequiresInduction,
      inductionRules: site.InductionRules,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}