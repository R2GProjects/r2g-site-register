/**
 * A daily pre-start / toolbox talk: who was at the huddle, drawn from who
 * is signed in, frozen at the moment it is saved.
 *
 * The on-site list moves. This record must not. Someone who walks off after
 * the talk stays on the roll; someone who arrives later is added only if the
 * supervisor refreshes. Missing a name does not block sign-in — the register
 * still lets them on, and the talk record says they were not marked present.
 */

import { dayKey, personName } from "@/lib/attendance";

export type PreStartKind = "person" | "visitor" | "unknown";

export interface PreStartAttendee {
  key: string;
  kind: PreStartKind;
  name: string;
  attendanceId: number | null;
  personId: number | null;
  visitorId: number | null;
  signedInAt: string | null;
  present: boolean;
}

export interface PreStartInput {
  siteId?: unknown;
  topic?: unknown;
  hazards?: unknown;
  ledBy?: unknown;
  heldAt?: unknown;
  attendees?: unknown;
}

export type PreStartProblem =
  | "noSite"
  | "badTime"
  | "badRoll";

export interface PreStartDraft {
  siteId: number;
  day: string;
  heldAt: string;
  topic: string;
  hazards: string;
  ledBy: string;
  attendees: PreStartAttendee[];
}

export interface PreStartCounts {
  onRoll: number;
  present: number;
  absent: number;
}

function asId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    const id = (value as { Id?: unknown }).Id;
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) return id;
  }
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Present is the boolean true, nothing else — a string "true" is not a tick. */
export function asPresent(value: unknown): boolean {
  return value === true;
}

export function attendeeKey(record: Record<string, unknown>): string {
  const personId = asId(record.Person) ?? asId(record.People_id);
  if (personId) return `person:${personId}`;
  const visitorId = asId(record.Visitor) ?? asId(record.Visitors_id);
  if (visitorId) return `visitor:${visitorId}`;
  const attendanceId = asId(record.Id);
  return attendanceId ? `attendance:${attendanceId}` : "unknown";
}

export function attendeeFromOnSite(
  record: Record<string, unknown>
): PreStartAttendee {
  const personId = asId(record.Person) ?? asId(record.People_id);
  const visitorId = asId(record.Visitor) ?? asId(record.Visitors_id);
  const kind: PreStartKind = personId
    ? "person"
    : visitorId
      ? "visitor"
      : "unknown";
  return {
    key: attendeeKey(record),
    kind,
    name: personName(record),
    attendanceId: asId(record.Id),
    personId,
    visitorId,
    signedInAt: record.SignInTime ? String(record.SignInTime) : null,
    present: true,
  };
}

export function attendeesFromOnSite(
  records: Array<Record<string, unknown>>
): PreStartAttendee[] {
  const seen = new Set<string>();
  const list: PreStartAttendee[] = [];
  for (const record of records) {
    const row = attendeeFromOnSite(record);
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    list.push(row);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/**
 * Refresh the roll from who is signed in now. New arrivals are added as
 * present. People already on the roll keep the tick the supervisor set,
 * even if they have since signed out.
 */
export function mergeAttendees(
  existing: PreStartAttendee[],
  onSiteNow: PreStartAttendee[]
): PreStartAttendee[] {
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const merged = existing.map((row) => ({ ...row }));
  for (const next of onSiteNow) {
    const current = byKey.get(next.key);
    if (!current) {
      merged.push({ ...next, present: true });
      continue;
    }
    const i = merged.findIndex((row) => row.key === next.key);
    merged[i] = {
      ...current,
      name: next.name || current.name,
      attendanceId: next.attendanceId ?? current.attendanceId,
      signedInAt: next.signedInAt ?? current.signedInAt,
    };
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

export function applyPresent(
  attendees: PreStartAttendee[],
  presentKeys: unknown
): PreStartAttendee[] {
  const keys = new Set(
    Array.isArray(presentKeys)
      ? presentKeys.filter((key): key is string => typeof key === "string")
      : []
  );
  return attendees.map((row) => ({ ...row, present: keys.has(row.key) }));
}

export function preStartCounts(attendees: PreStartAttendee[]): PreStartCounts {
  let present = 0;
  for (const row of attendees) {
    if (row.present) present += 1;
  }
  return {
    onRoll: attendees.length,
    present,
    absent: attendees.length - present,
  };
}

function normalizeAttendee(raw: unknown): PreStartAttendee | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const key = String(row.key ?? "").trim();
  if (!key) return null;
  const kind: PreStartKind =
    row.kind === "visitor" || row.kind === "unknown" ? row.kind : "person";
  return {
    key,
    kind,
    name: String(row.name ?? "").trim() || "Unknown",
    attendanceId: asId(row.attendanceId),
    personId: asId(row.personId),
    visitorId: asId(row.visitorId),
    signedInAt: row.signedInAt ? String(row.signedInAt) : null,
    present: asPresent(row.present),
  };
}

export function parseRoll(raw: unknown): PreStartAttendee[] {
  if (Array.isArray(raw)) {
    return raw
      .map(normalizeAttendee)
      .filter((row): row is PreStartAttendee => row !== null);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseRoll(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function serializeRoll(attendees: PreStartAttendee[]): string {
  return JSON.stringify(attendees);
}

export function validatePreStart(
  input: PreStartInput,
  now = Date.now()
): { ok: true; draft: PreStartDraft } | { ok: false; reason: PreStartProblem } {
  const siteId = asId(input.siteId);
  if (!siteId) return { ok: false, reason: "noSite" };

  const heldSource = input.heldAt ? String(input.heldAt) : new Date(now).toISOString();
  const heldMs = new Date(heldSource).getTime();
  if (Number.isNaN(heldMs)) return { ok: false, reason: "badTime" };
  const heldAt = new Date(heldMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const day = dayKey(heldAt);
  if (!day) return { ok: false, reason: "badTime" };

  if (input.attendees != null && !Array.isArray(input.attendees)) {
    return { ok: false, reason: "badRoll" };
  }
  const attendees = parseRoll(input.attendees ?? []);

  return {
    ok: true,
    draft: {
      siteId,
      day,
      heldAt,
      topic: String(input.topic ?? "").trim(),
      hazards: String(input.hazards ?? "").trim(),
      ledBy: String(input.ledBy ?? "").trim(),
      attendees,
    },
  };
}
