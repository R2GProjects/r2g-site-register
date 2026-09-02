import crypto from "crypto";
import {
  geofenceRadiusMetres,
  isInsideGeofence,
  metresBetween,
  parseLatitude,
  parseLongitude,
  siteCoordinates,
} from "@/lib/geofence";
import { safeEqual } from "@/lib/auth";

export const GATE_COOKIE = "sr_gate";
export const GATE_MAX_AGE = 30 * 60;

const GATE_TTL_MS = GATE_MAX_AGE * 1000;

function sessionSecret(): string {
  const configured = (process.env.SESSION_SECRET || "").trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set.");
  }
  return "dev-only-gate-secret";
}

export function normalizeSiteCode(code: unknown): string {
  return String(code ?? "").trim().toUpperCase();
}

interface GatePayload {
  c: string;
  exp: number;
}

/**
 * Proof that this browser recently opened the site page — the URL the gate QR
 * points at. Valid long enough to induct and then sign in, short enough that
 * yesterday's visit does not count as being at the gate today.
 */
export function createGateToken(
  siteCode: string,
  now: number = Date.now()
): string {
  const payload: GatePayload = {
    c: normalizeSiteCode(siteCode),
    exp: now + GATE_TTL_MS,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", sessionSecret()).update(b64).digest("hex");
  return `${b64}.${hmac}`;
}

export function readGateToken(
  token: unknown,
  now: number = Date.now()
): { siteCode: string } | null {
  const raw = String(token ?? "");
  const [b64, hmac] = raw.split(".");
  if (!b64 || !hmac) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(b64).digest("hex");
  if (!safeEqual(hmac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as GatePayload;
    if (!payload?.c || typeof payload.exp !== "number") return null;
    if (now > payload.exp) return null;
    return { siteCode: normalizeSiteCode(payload.c) };
  } catch {
    return null;
  }
}

export function gateCookieFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${GATE_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export type SignInMethod = "Geofence" | "SiteQR";

export type PresenceResult =
  | { ok: true; method: SignInMethod }
  | { ok: false; error: string; status: 400 | 403 };

const SCAN_OR_LOCATE =
  "Sign in at the site. Scan the site QR at the gate, or allow location so we can confirm you are there.";

/**
 * Whether this request is evidence of being at the site.
 *
 * A GPS reading inside the fence is the stronger proof and is judged first —
 * a phone at home that happens to hold yesterday's gate cookie must not get
 * in. Opening the site page (the URL on the gate QR) is the fallback for
 * basements and phones that refuse location.
 */
export function evaluatePresence(
  input: {
    siteCode: unknown;
    lat?: unknown;
    lng?: unknown;
    site: { Latitude?: unknown; Longitude?: unknown };
    gateToken?: unknown;
  },
  options?: { now?: number; radiusMetres?: number }
): PresenceResult {
  const wanted = normalizeSiteCode(input.siteCode);
  if (!wanted) {
    return { ok: false, error: "Missing siteCode", status: 400 };
  }

  const lat = parseLatitude(input.lat);
  const lng = parseLongitude(input.lng);
  const hasFix = lat !== null && lng !== null;

  if (hasFix) {
    const pin = siteCoordinates(input.site);
    if (!pin) {
      return {
        ok: false,
        error:
          "This site has no location on file. Scan the site QR at the gate to sign in.",
        status: 403,
      };
    }
    const radius = options?.radiusMetres ?? geofenceRadiusMetres();
    if (!isInsideGeofence({ lat, lng }, pin, radius)) {
      const metres = Math.round(metresBetween(lat, lng, pin.lat, pin.lng));
      return {
        ok: false,
        error: `You do not appear to be at this site (${metres} m away). Sign in at the gate, or scan the site QR.`,
        status: 403,
      };
    }
    return { ok: true, method: "Geofence" };
  }

  const gate = readGateToken(input.gateToken, options?.now);
  if (gate && gate.siteCode === wanted) {
    return { ok: true, method: "SiteQR" };
  }

  return { ok: false, error: SCAN_OR_LOCATE, status: 403 };
}
