import { NextResponse } from "next/server";
import { TABLES, list } from "@/lib/nocodb";

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") || "");
    const lng = parseFloat(searchParams.get("lng") || "");
    const radiusM = parseInt(searchParams.get("radius") || "500");

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: "lat and lng query parameters required" }, { status: 400 });
    }

    const sites = await list<Record<string, unknown>>(TABLES.Sites, {
      where: "(Status,eq,Active)",
      fields: "Id,SiteUUID,SiteCode,SiteName,Address,Latitude,Longitude,SiteManager,Status",
      limit: 200,
    });

    const nearby = sites
      .map((site) => {
        const siteLat = site.Latitude as number | null;
        const siteLng = site.Longitude as number | null;
        if (siteLat == null || siteLng == null) return null;
        const distKm = haversine(lat, lng, siteLat, siteLng);
        const distM = Math.round(distKm * 1000);
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