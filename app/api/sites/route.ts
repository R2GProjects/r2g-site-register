import { NextResponse } from "next/server";
import { TABLES, list, findSiteByCode } from "@/lib/nocodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      const sites = await list<Record<string, unknown>>(TABLES.Sites, {
        where: "(Status,eq,Active)~or(Status,eq,Setup)",
        fields: "Id,SiteCode,SiteName,Status",
        sort: "SiteName",
        limit: 200,
      });
      return NextResponse.json(sites);
    }

    const site = await findSiteByCode(
      code,
      "Id,SiteUUID,SiteCode,SiteName,Address,Suburb,State,Postcode,SiteManager,SiteManagerPhone,Client,Status,Latitude,Longitude,EmergencyPlanURL,RequiresInduction,InductionRules,SiteQRCodeURL"
    );

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    return NextResponse.json(site);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}