import { NextResponse } from "next/server";
import { TABLES, list } from "@/lib/nocodb";
import { metresBetween, parseLatitude, parseLongitude } from "@/lib/geofence";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseLatitude(searchParams.get("lat"));
    const lng = parseLongitude(searchParams.get("lng"));
    const radiusM = parseInt(searchParams.get("radius") || "500");

    if (lat === null || lng === null) {
      return NextResponse.json({ error: "lat and lng query parameters required" }, { status: 400 });
    }

    const sites = await list<Record<string, unknown>>(TABLES.Sites, {
      where: "(Status,eq,Active)",
      fields: "Id,SiteUUID,SiteCode,SiteName,Address,Latitude,Longitude,SiteManager,Status",
      limit: 200,
    });

    const nearby = sites
      .map((site) => {
        const siteLat = parseLatitude(site.Latitude);
        const siteLng = parseLongitude(site.Longitude);
        if (siteLat === null || siteLng === null) return null;
        const distM = Math.round(metresBetween(lat, lng, siteLat, siteLng));
        if (distM > radiusM) return null;
        return { ...site, distanceM: distM };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.distanceM as number) - (b!.distanceM as number));

    return NextResponse.json(nearby);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
