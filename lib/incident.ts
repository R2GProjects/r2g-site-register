/**
 * A hazard, near miss or incident raised from a phone on site.
 *
 * The register already knows who was signed in. This record ties the report
 * to that attendance so a later investigation can see who was there, without
 * making the form a second register. An empty description is refused; a
 * missing attendance is not — someone walking off can still report what they
 * saw.
 */

import { dayKey } from "@/lib/attendance";

export const INCIDENT_KINDS = ["hazard", "nearmiss", "incident"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_STATUSES = ["open", "noted", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  hazard: "Hazard",
  nearmiss: "Near miss",
  incident: "Incident",
};

export const MAX_INCIDENT_CHARS = 4000;

export type IncidentProblem =
  | "noKind"
  | "noWhat"
  | "tooLong"
  | "noSite"
  | "badTime"
  | "badStatus";

export interface IncidentInput {
  kind?: unknown;
  what?: unknown;
  whereOnSite?: unknown;
  action?: unknown;
  siteId?: unknown;
  occurredAt?: unknown;
  status?: unknown;
}

export interface IncidentDraft {
  kind: IncidentKind;
  status: IncidentStatus;
  what: string;
  whereOnSite: string;
  action: string;
  siteId: number;
  occurredAt: string;
  day: string;
}

function asId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function incidentKind(value: unknown): IncidentKind | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (raw === "nearmiss" || raw === "nearmisses") return "nearmiss";
  if (raw === "hazard" || raw === "hazards") return "hazard";
  if (raw === "incident" || raw === "incidents") return "incident";
  return null;
}

export function incidentStatus(value: unknown): IncidentStatus | null {
  const raw = String(value ?? "").trim().toLowerCase();
  return (INCIDENT_STATUSES as readonly string[]).includes(raw)
    ? (raw as IncidentStatus)
    : null;
}

export function reporterName(person: {
  FirstName?: unknown;
  LastName?: unknown;
}): string {
  return `${String(person.FirstName ?? "")} ${String(person.LastName ?? "")}`.trim() || "Unknown";
}

export function validateIncident(
  input: IncidentInput,
  now = Date.now()
): { ok: true; draft: IncidentDraft } | { ok: false; reason: IncidentProblem } {
  const kind = incidentKind(input.kind);
  if (!kind) return { ok: false, reason: "noKind" };

  const what = String(input.what ?? "").trim();
  if (!what) return { ok: false, reason: "noWhat" };
  const whereOnSite = String(input.whereOnSite ?? "").trim();
  const action = String(input.action ?? "").trim();
  if (
    what.length > MAX_INCIDENT_CHARS ||
    whereOnSite.length > MAX_INCIDENT_CHARS ||
    action.length > MAX_INCIDENT_CHARS
  ) {
    return { ok: false, reason: "tooLong" };
  }

  const siteId = asId(input.siteId);
  if (!siteId) return { ok: false, reason: "noSite" };

  const occurredSource = input.occurredAt
    ? String(input.occurredAt)
    : new Date(now).toISOString();
  const occurredMs = new Date(occurredSource).getTime();
  if (Number.isNaN(occurredMs)) return { ok: false, reason: "badTime" };
  const occurredAt = new Date(occurredMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const day = dayKey(occurredAt);
  if (!day) return { ok: false, reason: "badTime" };

  let status: IncidentStatus = "open";
  if (input.status != null && String(input.status).trim() !== "") {
    const parsed = incidentStatus(input.status);
    if (!parsed) return { ok: false, reason: "badStatus" };
    status = parsed;
  }

  return {
    ok: true,
    draft: { kind, status, what, whereOnSite, action, siteId, occurredAt, day },
  };
}

export function incidentEmail(input: {
  kind: IncidentKind;
  siteName: string;
  reporter: string;
  what: string;
  whereOnSite?: string;
}): { subject: string; text: string } {
  const label = INCIDENT_KIND_LABEL[input.kind];
  const lines = [
    `${input.reporter} reported a ${label.toLowerCase()} at ${input.siteName}.`,
    "",
    input.what,
  ];
  if (input.whereOnSite) {
    lines.push("", `Where: ${input.whereOnSite}`);
  }
  return {
    subject: `${input.siteName} — ${label}`,
    text: lines.join("\n"),
  };
}
