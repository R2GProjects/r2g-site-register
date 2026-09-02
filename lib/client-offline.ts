"use client";

import {
  enqueue,
  flushBody,
  GATE_TOKEN_STORAGE_KEY,
  makeQueueItem,
  OFFLINE_STORAGE_KEY,
  parseStoredQueue,
  queuePath,
  removeItem,
  serializeStoredQueue,
  shouldQueueFailure,
  type QueueAction,
  type QueueItem,
} from "@/lib/offline-queue";

const CHANGED = "sr-offline-queue";

export function rememberGateToken(token: unknown) {
  if (typeof window === "undefined") return;
  const value = String(token ?? "").trim();
  if (!value || !value.includes(".")) return;
  sessionStorage.setItem(GATE_TOKEN_STORAGE_KEY, value);
}

export function readRememberedGateToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = sessionStorage.getItem(GATE_TOKEN_STORAGE_KEY);
  return value || undefined;
}

export function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  return parseStoredQueue(localStorage.getItem(OFFLINE_STORAGE_KEY));
}

function writeQueue(items: QueueItem[]) {
  localStorage.setItem(OFFLINE_STORAGE_KEY, serializeStoredQueue(items));
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeQueue(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function newItemId(): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `srq-${rand}`;
}

function attendancePayload(
  action: QueueAction,
  body: Record<string, unknown>
): Record<string, unknown> {
  if (action !== "signin") return { ...body };
  const gateToken = body.gateToken || readRememberedGateToken();
  return gateToken ? { ...body, gateToken } : { ...body };
}

export type AttendanceResult =
  | { status: "ok"; data: Record<string, unknown> }
  | { status: "queued" }
  | {
      status: "error";
      error: string;
      statusCode: number;
      data: Record<string, unknown>;
    };

/**
 * POST an attendance action. A dead radio stores the tap on this device and
 * returns `queued` so the worker can walk on. A 4xx is still a real refusal.
 */
export async function postAttendance(
  action: QueueAction,
  body: Record<string, unknown>
): Promise<AttendanceResult> {
  const payload = attendancePayload(action, body);
  try {
    const res = await fetch(queuePath(action), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { status: "ok", data };
    if (shouldQueueFailure(false, res.status)) {
      queueTap(action, payload);
      return { status: "queued" };
    }
    return {
      status: "error",
      error: String(data.error || "Request failed"),
      statusCode: res.status,
      data,
    };
  } catch {
    queueTap(action, payload);
    return { status: "queued" };
  }
}

function queueTap(action: QueueAction, body: Record<string, unknown>) {
  const queuedAt = new Date().toISOString();
  const next = enqueue(
    readQueue(),
    makeQueueItem({
      id: newItemId(),
      action,
      queuedAt,
      body,
    })
  );
  writeQueue(next);
}

export async function flushOfflineQueue(): Promise<{
  sent: number;
  remaining: number;
  lastError?: string;
}> {
  if (typeof window === "undefined") {
    return { sent: 0, remaining: 0 };
  }
  let items = readQueue();
  let sent = 0;
  let lastError: string | undefined;

  while (items[0]) {
    const current = items[0];
    try {
      const res = await fetch(current.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flushBody(current)),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (shouldQueueFailure(false, res.status)) {
        break;
      }
      items = removeItem(items, current.id);
      writeQueue(items);
      if (res.ok) sent += 1;
      else lastError = String(data.error || "Request failed");
    } catch {
      break;
    }
  }

  return { sent, remaining: items.length, lastError };
}
