const EARTH_RADIUS_M = 6_371_000;

export const DEFAULT_RADIUS_METRES = 300;

/**
 * How far from the stored pin a worker still counts as on site.
 *
 * Three hundred metres covers a typical building site plus GPS error. A civil
 * job that sprawls further can raise GEOFENCE_RADIUS_METRES; the ceiling stops
 * a mis-set value from treating half the suburb as the site.
 */
export function geofenceRadiusMetres(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = Number(env.GEOFENCE_RADIUS_METRES);
  return Number.isFinite(parsed) && parsed >= 50 && parsed <= 2000
    ? Math.floor(parsed)
    : DEFAULT_RADIUS_METRES;
}

/** Great-circle distance in metres. */
export function metresBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseLatitude(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < -90 || n > 90) return null;
  return n;
}

export function parseLongitude(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < -180 || n > 180) return null;
  return n;
}

export function siteCoordinates(site: {
  Latitude?: unknown;
  Longitude?: unknown;
}): { lat: number; lng: number } | null {
  const lat = parseLatitude(site.Latitude);
  const lng = parseLongitude(site.Longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

/**
 * Whether a reading falls inside the site radius, inclusive of the fence.
 *
 * Inclusive so a worker standing on the recorded pin, or exactly radius metres
 * out, is not turned away by rounding.
 */
export function isInsideGeofence(
  point: { lat: number; lng: number },
  site: { lat: number; lng: number },
  radiusMetres: number
): boolean {
  return metresBetween(point.lat, point.lng, site.lat, site.lng) <= radiusMetres;
}
