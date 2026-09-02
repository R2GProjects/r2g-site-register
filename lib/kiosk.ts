/**
 * Shared-tablet gate mode.
 *
 * A kiosk is bound to one site. It must reset between people and must not
 * leave the previous worker's session cookie on the device — the next person
 * at the tablet would otherwise be signed in as them.
 */

export const KIOSK_COOKIE = "sr_kiosk";
export const KIOSK_MAX_AGE = 365 * 24 * 60 * 60;

/** Half-filled forms vanish so the next person does not see the last one's details. */
export const DEFAULT_IDLE_MS = 45_000;

/** Long enough to read the name, short enough that the next person is not waiting. */
export const DEFAULT_SUCCESS_MS = 8_000;

/** Visitor pass QR has to stay up long enough to photograph. */
export const DEFAULT_VISITOR_PASS_MS = 20_000;

const SITE_CODE = /^[A-Z0-9]{2,20}$/;

export function isKioskSiteCode(code: unknown): boolean {
  return typeof code === "string" && SITE_CODE.test(code);
}

export function kioskPath(siteCode: unknown): string {
  const code = String(siteCode ?? "").trim().toUpperCase();
  return `/kiosk/${encodeURIComponent(code)}`;
}

export function isKioskRequest(value: unknown): boolean {
  return value === true;
}

export function kioskCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    // Readable by the header so Admin stays hidden on every page, not only /kiosk.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KIOSK_MAX_AGE,
  };
}

/**
 * The site this tablet is locked to, or null if the cookie is missing or junk.
 * Junk is rejected rather than trusted — a crafted value must not become a path.
 */
export function kioskSiteCodeFromCookie(cookieHeader: string): string | null {
  const match = String(cookieHeader || "").match(
    new RegExp(`(?:^|;\\s*)${KIOSK_COOKIE}=([^;]*)`)
  );
  if (!match) return null;
  let raw = match[1].trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const code = raw.trim().toUpperCase();
  return isKioskSiteCode(code) ? code : null;
}

export function kioskIdleExpired(
  lastActivityMs: number,
  nowMs: number,
  idleMs: number = DEFAULT_IDLE_MS
): boolean {
  if (
    !Number.isFinite(lastActivityMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(idleMs) ||
    idleMs <= 0
  ) {
    return false;
  }
  return nowMs - lastActivityMs >= idleMs;
}

export function visitorPassUrl(origin: string, passToken: string): string {
  return `${origin.replace(/\/$/, "")}/v/${encodeURIComponent(passToken)}`;
}
