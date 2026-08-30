import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

export interface SessionPayload {
  u: string;
  exp: number;
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
  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
    return null;
  }

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
  const match = cookie.match(/sr_session=([^;]+)/);
  if (!match) return false;
  return verifyToken(match[1]) !== null;
}

export async function validateAdminAuth(request: Request): Promise<boolean> {
  return verifySession(request);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizePasscode(passcode: string): string {
  return passcode.trim().toLowerCase();
}

export function hashPasscode(passcode: string): string {
  return hashToken(normalizePasscode(passcode));
}

export function validatePasscode(passcode: string): string | null {
  const value = passcode.trim();
  if (value.length < 4) return "Passcode must be at least 4 characters";
  if (value.length > 32) return "Passcode must be 32 characters or fewer";
  return null;
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
  return "127.0.0.1";
}