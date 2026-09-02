/**
 * Offline attendance queue.
 *
 * A live POST is still the happy path. When the radio is gone — lift core,
 * basement, a site at the edge of coverage — the tap is stored on the device
 * and sent when a request can actually leave. The time on the record is the
 * tap, not the sync, otherwise a 7am sign-in that flushes at lunch becomes
 * four hours of missing work.
 */

export const OFFLINE_STORAGE_KEY = "sr_offline_queue";
export const GATE_TOKEN_STORAGE_KEY = "sr_gate_token";

/** Long enough for a morning in a basement; short enough that yesterday is not "queued". */
export const DEFAULT_QUEUE_MAX_AGE_MS = 18 * 60 * 60 * 1000;

/** Phones lie about the clock by a minute or two. */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

export type QueueAction = "signin" | "signout";

export interface QueueItem {
  id: string;
  action: QueueAction;
  path: "/api/attend/signin" | "/api/attend/signout";
  body: Record<string, unknown>;
  queuedAt: string;
  dedupeKey: string;
}

export interface StoredQueue {
  v: 1;
  items: QueueItem[];
}

export function isQueuedRequest(value: unknown): boolean {
  return value === true;
}

export function queuePath(action: QueueAction): QueueItem["path"] {
  return action === "signin" ? "/api/attend/signin" : "/api/attend/signout";
}

export function queueDedupeKey(
  action: QueueAction,
  body: Record<string, unknown>
): string {
  const who = String(body.accessToken || body.mobile || "session");
  const site = action === "signin" ? String(body.siteCode || "") : "";
  return `${action}:${who}:${site}`.toUpperCase();
}

export function makeQueueItem(input: {
  id: string;
  action: QueueAction;
  body: Record<string, unknown>;
  queuedAt: string;
}): QueueItem {
  return {
    id: input.id,
    action: input.action,
    path: queuePath(input.action),
    body: input.body,
    queuedAt: input.queuedAt,
    dedupeKey: queueDedupeKey(input.action, input.body),
  };
}

/**
 * Keep the first tap. A double-press on a laggy button must not move the
 * recorded time, and must not send the same person in twice.
 */
export function enqueue(items: QueueItem[], incoming: QueueItem): QueueItem[] {
  if (items.some((item) => item.dedupeKey === incoming.dedupeKey)) {
    return items;
  }
  return [...items, incoming];
}

export function removeItem(items: QueueItem[], id: string): QueueItem[] {
  return items.filter((item) => item.id !== id);
}

export type FlushDecision = "retry" | "drop";

/**
 * 5xx and a dead radio are worth another try. 4xx will not become 200 with
 * the same payload, so the item leaves the queue rather than blocking the
 * ones behind it.
 */
export function decideFlushResult(
  networkError: boolean,
  status: number | null
): FlushDecision {
  if (networkError) return "retry";
  if (status === null) return "retry";
  if (status >= 500) return "retry";
  return "drop";
}

export function shouldQueueFailure(
  networkError: boolean,
  status: number | null
): boolean {
  return decideFlushResult(networkError, status) === "retry";
}

export type EventTime =
  | { ok: true; iso: string; at: number }
  | { ok: false; error: string };

/**
 * The instant that belongs on the attendance row.
 *
 * A live request (no queuedAt) uses the server clock. A flushed request must
 * carry the tap time, bounded so a phone cannot invent last week.
 */
export function resolveQueuedEventTime(
  queuedAt: unknown,
  now: number = Date.now(),
  maxAgeMs: number = DEFAULT_QUEUE_MAX_AGE_MS
): EventTime {
  if (queuedAt === undefined || queuedAt === null || queuedAt === "") {
    return { ok: true, iso: new Date(now).toISOString(), at: now };
  }
  const at = Date.parse(String(queuedAt));
  if (Number.isNaN(at)) {
    return { ok: false, error: "Queued time is not a valid date" };
  }
  if (at > now + CLOCK_SKEW_MS) {
    return { ok: false, error: "Queued time is in the future" };
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return { ok: false, error: "Queued time is too old to record" };
  }
  if (now - at > maxAgeMs) {
    return {
      ok: false,
      error: "Queued sign-in is too old to record. Sign in again at the gate.",
    };
  }
  return { ok: true, iso: new Date(at).toISOString(), at };
}

/** A sign-out must not precede the sign-in it closes, or the hours go negative. */
export function resolveSignOutTime(signInAt: unknown, eventAt: number): number {
  const start = Date.parse(String(signInAt ?? ""));
  if (Number.isNaN(start)) return eventAt;
  return Math.max(eventAt, start);
}

export function parseStoredQueue(raw: string | null | undefined): QueueItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredQueue;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isQueueItem);
  } catch {
    return [];
  }
}

export function serializeStoredQueue(items: QueueItem[]): string {
  const payload: StoredQueue = { v: 1, items };
  return JSON.stringify(payload);
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as QueueItem;
  return (
    typeof item.id === "string" &&
    (item.action === "signin" || item.action === "signout") &&
    (item.path === "/api/attend/signin" || item.path === "/api/attend/signout") &&
    typeof item.queuedAt === "string" &&
    typeof item.dedupeKey === "string" &&
    item.body !== null &&
    typeof item.body === "object"
  );
}

export function flushBody(item: QueueItem): Record<string, unknown> {
  return {
    ...item.body,
    queued: true,
    queuedAt: item.queuedAt,
  };
}
