import { NextResponse } from "next/server";
import { TABLES, list, findSiteByCode } from "@/lib/nocodb";
import { createGateToken, GATE_COOKIE, GATE_MAX_AGE } from "@/lib/presence";

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

    // Opening this URL is what scanning the gate QR does. The cookie is the
    // proof sign-in accepts when the phone will not (or cannot) share a GPS fix.
    const gateToken = createGateToken(String(site.SiteCode));
    // The cookie is httpOnly; the token is also returned so an offline queue
    // can replay the scan after the cookie has expired.
    const resp = NextResponse.json({ ...site, gateToken });
    resp.cookies.set(GATE_COOKIE, gateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GATE_MAX_AGE,
    });
    return resp;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}