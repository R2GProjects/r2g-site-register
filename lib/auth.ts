import crypto from "crypto";

const SESSION_SECRET = resolveSessionSecret();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

export const SESSION_COOKIE = "sr_session";
export const SESSION_MAX_AGE = SESSION_TTL / 1000;

const WORKER_TTL = 12 * 60 * 60 * 1000; // 12 hours — covers a long shift
export const WORKER_COOKIE = "sr_worker";
export const WORKER_MAX_AGE = WORKER_TTL / 1000;

function resolveSessionSecret(): string {
  const configured = (process.env.SESSION_SECRET || "").trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set. Generate one and set it in the environment before starting the app."
    );
  }
  return crypto.randomBytes(32).toString("hex");
}

export interface SessionPayload {
  u: string;
  exp: number;
}

/** Constant-time comparison that returns false instead of throwing on a length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function signPayload(payload: SessionPayload): string {
  const data = JSON.stringify(payload);
  const b64 = Buffer.from(data).toString("base64url");
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("hex");
  return `${b64}.${hmac}`;
}

export function verifyToken(token: string): SessionPayload | null {
  const [b64, hmac] = token.split(".");
  if (!b64 || !hmac) return null;

  const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("hex");
  if (!safeEqual(hmac, expectedHmac)) return null;

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSession(): string {
  return signPayload({
    u: process.env.ADMIN_USERNAME || "admin",
    exp: Date.now() + SESSION_TTL,
  });
}

export function verifySession(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;
  return verifyToken(match[1]) !== null;
}

export async function validateAdminAuth(request: Request): Promise<boolean> {
  return verifySession(request);
}

interface WorkerSessionPayload {
  p: number;
  exp: number;
}

/** Short-lived proof that a worker already authenticated, so the token stays out of later requests. */
export function createWorkerSession(personId: number): string {
  const b64 = Buffer.from(
    JSON.stringify({ p: personId, exp: Date.now() + WORKER_TTL } satisfies WorkerSessionPayload)
  ).toString("base64url");
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("hex");
  return `${b64}.${hmac}`;
}

export function readWorkerSession(request: Request): number | null {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${WORKER_COOKIE}=([^;]+)`));
  if (!match) return null;

  const [b64, hmac] = match[1].split(".");
  if (!b64 || !hmac) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("hex");
  if (!safeEqual(hmac, expected)) return null;

  try {
    const payload: WorkerSessionPayload = JSON.parse(
      Buffer.from(b64, "base64url").toString("utf-8")
    );
    if (Date.now() > payload.exp || typeof payload.p !== "number") return null;
    return payload.p;
  } catch {
    return null;
  }
}

/** A visitor keeps their pass across sessions, so it outlives a single shift. */
const VISITOR_PASS_TTL = 3 * 24 * 60 * 60 * 1000;

interface VisitorPassPayload {
  v: number;
  a: number;
  exp: number;
}

/**
 * Signed proof of one visitor sign-in, safe to put in a URL. It names the exact
 * attendance record, so holding it lets the visitor close their own visit and
 * nothing else — unlike a bare row id, which anyone could guess.
 */
export function createVisitorPass(visitorId: number, attendanceId: number): string {
  const b64 = Buffer.from(
    JSON.stringify({
      v: visitorId,
      a: attendanceId,
      exp: Date.now() + VISITOR_PASS_TTL,
    } satisfies VisitorPassPayload)
  ).toString("base64url");
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("hex");
  return `${b64}.${hmac}`;
}

export function readVisitorPass(
  token: string | null | undefined
): { visitorId: number; attendanceId: number } | null {
  if (!token) return null;
  const [b64, hmac] = String(token).split(".");
  if (!b64 || !hmac) return null;

  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(b64).digest("hex");
  if (!safeEqual(hmac, expected)) return null;

  try {
    const payload: VisitorPassPayload = JSON.parse(
      Buffer.from(b64, "base64url").toString("utf-8")
    );
    if (
      typeof payload.v !== "number" ||
      typeof payload.a !== "number" ||
      Date.now() > payload.exp
    ) {
      return null;
    }
    return { visitorId: payload.v, attendanceId: payload.a };
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizePasscode(passcode: string): string {
  return passcode.trim().toLowerCase();
}

const PASSCODE_SCHEME = "s2";
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;

/** Salted scrypt digest, stored as `s2$<salt>$<key>`. */
export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const key = crypto
    .scryptSync(normalizePasscode(passcode), salt, SCRYPT_KEYLEN)
    .toString("hex");
  return `${PASSCODE_SCHEME}$${salt}$${key}`;
}

/** True for digests written before salted hashing, which are bare SHA-256 hex. */
export function isLegacyPasscodeHash(stored: string | null | undefined): boolean {
  return Boolean(stored) && !String(stored).startsWith(`${PASSCODE_SCHEME}$`);
}

export function verifyPasscode(passcode: string, stored: string | null | undefined): boolean {
  if (!stored || !passcode) return false;
  const normalized = normalizePasscode(passcode);

  if (isLegacyPasscodeHash(stored)) {
    return safeEqual(hashToken(normalized), String(stored));
  }

  const [, salt, key] = String(stored).split("$");
  if (!salt || !key) return false;
  const candidate = crypto.scryptSync(normalized, salt, SCRYPT_KEYLEN).toString("hex");
  return safeEqual(candidate, key);
}

export function validatePasscode(passcode: string): string | null {
  const value = passcode.trim();
  if (value.length < 6) return "Passcode must be at least 6 characters";
  if (value.length > 64) return "Passcode must be 64 characters or fewer";
  return null;
}

/** Digits only, with a leading +61 rewritten to 0 so AU numbers compare equal however they were typed. */
export function normalizeMobile(mobile: string | null | undefined): string {
  const digits = String(mobile ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("61") && digits.length > 9) return `0${digits.slice(2)}`;
  return digits;
}

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}
