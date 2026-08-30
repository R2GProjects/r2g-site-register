import { NextResponse } from "next/server";
import { getClientIP } from "@/lib/auth";

interface Bucket {
  count: number;
  resetAt: number;
}

// Process-local, which matches the single-container deployment. Move to a shared
// store if the app is ever run behind more than one instance.
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** Clear a bucket after a successful attempt so honest users are never locked out. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function rateLimitKey(request: Request, scope: string, identifier?: string): string {
  const id = (identifier || "").trim().toLowerCase();
  return `${scope}:${getClientIP(request)}${id ? `:${id}` : ""}`;
}

export function tooManyRequests(result: RateLimitResult, message: string): NextResponse {
  return NextResponse.json(
    { error: message, retryAfterSec: result.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}

/**
 * Applies a limit and returns a ready-made 429 when it is exceeded, or the key
 * so the caller can clear it after a successful attempt.
 */
export function guard(
  request: Request,
  scope: string,
  options: { limit: number; windowMs: number; identifier?: string; message?: string }
): { key: string; blocked: NextResponse | null } {
  const key = rateLimitKey(request, scope, options.identifier);
  const result = checkRateLimit(key, options.limit, options.windowMs);
  return {
    key,
    blocked: result.allowed
      ? null
      : tooManyRequests(
          result,
          options.message || "Too many attempts. Wait a moment and try again."
        ),
  };
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
