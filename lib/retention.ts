import {
  TABLES,
  list,
  update,
  create,
  ensureRetentionColumns,
  escapeWhereValue,
} from "@/lib/nocodb";
import { generateUUID, nowISO } from "@/lib/auth";
import { retentionYears } from "@/lib/privacy";

const DAY_MS = 86_400_000;

export const DEFAULT_RETENTION_LIMIT = 100;

/**
 * The instant after which a last-activity date is still inside the window.
 *
 * Counted as 365-day years rather than calendar years, so a leap day makes
 * the window a day shorter. That errs toward anonymising slightly earlier,
 * which is the right direction for a rule that exists to stop holding data.
 */
export function retentionCutoffMs(
  years: number,
  now: number = Date.now()
): number {
  return now - years * 365 * DAY_MS;
}

export function latestInstant(values: unknown[]): number | null {
  let latest: number | null = null;
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const ms = new Date(String(value)).getTime();
    if (Number.isNaN(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return latest;
}

export type RetentionSkip = "already" | "onsite" | "recent" | "unknown";

export type RetentionDecision =
  | { action: "anonymise"; lastActivity: number }
  | { action: "skip"; reason: RetentionSkip };

/**
 * Whether a person or visitor is past the retention window.
 *
 * Attendance facts stay. This only decides whether the identifying fields on
 * the person or visitor row should be stripped. Someone currently on site is
 * left alone even if their created date is ancient. A record with no usable
 * date is left alone — wiping on the strength of missing data is the wrong
 * way to fail.
 */
export function planRetention(
  subject: {
    anonymisedAt?: unknown;
    onSite: boolean;
    activityDates: unknown[];
  },
  cutoffMs: number
): RetentionDecision {
  if (latestInstant([subject.anonymisedAt]) !== null) {
    return { action: "skip", reason: "already" };
  }
  if (subject.onSite) {
    return { action: "skip", reason: "onsite" };
  }
  const lastActivity = latestInstant(subject.activityDates);
  if (lastActivity === null) {
    return { action: "skip", reason: "unknown" };
  }
  if (lastActivity > cutoffMs) {
    return { action: "skip", reason: "recent" };
  }
  return { action: "anonymise", lastActivity };
}

/** Identifying fields stripped from a worker. Attendance rows keep the id. */
export function personAnonymiseFields(
  id: number,
  now: string
): Record<string, unknown> {
  return {
    FirstName: "Former",
    LastName: `Worker ${id}`,
    Mobile: null,
    Email: null,
    EmergencyContactName: null,
    EmergencyContactPhone: null,
    WhiteCardNumber: null,
    WhiteCardExpiry: null,
    WhiteCardImage: null,
    WhiteCardVerified: false,
    LicenceNumber: null,
    LicenceType: null,
    LicenceExpiry: null,
    LicenceImage: null,
    Photo: null,
    PersonPhoto: null,
    Notes: null,
    PasscodeHash: null,
    AccessTokenHash: null,
    AccessEnabled: false,
    AnonymisedAt: now,
    UpdatedAt1: now,
  };
}

/** Identifying fields stripped from a visitor. The visit row keeps the id. */
export function visitorAnonymiseFields(
  id: number,
  now: string
): Record<string, unknown> {
  return {
    FirstName: "Former",
    LastName: `Visitor ${id}`,
    Mobile: null,
    Email: null,
    CompanyName: null,
    ReasonForVisit: null,
    PersonVisiting: null,
    EmergencyContactName: null,
    EmergencyContactPhone: null,
    Notes: null,
    AnonymisedAt: now,
  };
}

export interface RetentionResult {
  scanned: number;
  anonymised: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  years: number;
  cutoff: string;
  records: Array<{
    kind: "person" | "visitor";
    id: number;
    lastActivity: string | null;
    reason?: RetentionSkip;
    error?: string;
  }>;
}

function batchLimit(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number(env.RETENTION_LIMIT);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 500
    ? parsed
    : DEFAULT_RETENTION_LIMIT;
}

async function recentOrOnSiteIds(
  idField: "People_id" | "Visitors_id",
  ids: number[],
  cutoffISO: string
): Promise<{ recent: Set<number>; onSite: Set<number> }> {
  const recent = new Set<number>();
  const onSite = new Set<number>();
  if (ids.length === 0) return { recent, onSite };

  const rows = await list<Record<string, unknown>>(TABLES.Attendance, {
    where: `(${idField},in,${ids.join(",")})~and((Status,eq,OnSite)~or(SignInTime,gte,${escapeWhereValue(cutoffISO)}))`,
    limit: 2000,
    fields: `Id,${idField},SignInTime,Status`,
  });

  for (const row of rows) {
    const id = Number(row[idField]);
    if (!Number.isFinite(id)) continue;
    if (row.Status === "OnSite") onSite.add(id);
    recent.add(id);
  }
  return { recent, onSite };
}

async function anonymisePerson(
  id: number,
  now: string,
  lastActivity: number
): Promise<void> {
  await update(TABLES.People, { Id: id, ...personAnonymiseFields(id, now) });

  const inductions = await list<Record<string, unknown>>(TABLES.Inductions, {
    where: `(People_id,eq,${id})`,
    limit: 200,
    fields: "Id,SignatureImage,Signature",
  });
  for (const row of inductions) {
    if (row.SignatureImage || row.Signature) {
      await update(TABLES.Inductions, {
        Id: row.Id as number,
        SignatureImage: null,
        Signature: null,
        UpdatedAt1: now,
      });
    }
  }

  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "DataRetention",
    Person: String(id),
    PerformedBy: "system",
    Source: "Retention",
    OldValue: JSON.stringify({ Id: id, kind: "person" }),
    NewValue: JSON.stringify({
      anonymised: true,
      lastActivity: new Date(lastActivity).toISOString(),
    }),
    CreatedAt1: now,
  });
}

async function anonymiseVisitor(
  id: number,
  now: string,
  lastActivity: number
): Promise<void> {
  await update(TABLES.Visitors, { Id: id, ...visitorAnonymiseFields(id, now) });
  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "DataRetention",
    Person: `visitor:${id}`,
    PerformedBy: "system",
    Source: "Retention",
    OldValue: JSON.stringify({ Id: id, kind: "visitor" }),
    NewValue: JSON.stringify({
      anonymised: true,
      lastActivity: new Date(lastActivity).toISOString(),
    }),
    CreatedAt1: now,
  });
}

/**
 * Strips identifying fields from people and visitors whose last activity is
 * older than DATA_RETENTION_YEARS. Attendance rows are not touched.
 */
export async function runRetention(options?: {
  dryRun?: boolean;
  years?: number;
  now?: number;
  limit?: number;
}): Promise<RetentionResult> {
  const years = options?.years ?? retentionYears();
  const now = options?.now ?? Date.now();
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? batchLimit();
  const cutoffMs = retentionCutoffMs(years, now);
  const cutoffISO = new Date(cutoffMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const timestamp = nowISO();

  await ensureRetentionColumns();

  const result: RetentionResult = {
    scanned: 0,
    anonymised: 0,
    skipped: 0,
    failed: 0,
    dryRun,
    years,
    cutoff: cutoffISO,
    records: [],
  };

  // A wider window than the write limit, so already-anonymised rows at the
  // front of the table do not prevent the job from reaching anyone new.
  const window = Math.min(500, Math.max(limit * 5, limit));
  const people = (
    await list<Record<string, unknown>>(TABLES.People, {
      sort: "CreatedAt1",
      limit: window,
      fields: "Id,CreatedAt1,AnonymisedAt",
    })
  ).filter((row) => latestInstant([row.AnonymisedAt]) === null);
  const visitors = (
    await list<Record<string, unknown>>(TABLES.Visitors, {
      sort: "CreatedAt1",
      limit: window,
      fields: "Id,CreatedAt1,AnonymisedAt",
    })
  ).filter((row) => latestInstant([row.AnonymisedAt]) === null);

  const personIds = people.map((p) => p.Id as number);
  const visitorIds = visitors.map((v) => v.Id as number);
  const [peopleFlags, visitorFlags] = await Promise.all([
    recentOrOnSiteIds("People_id", personIds, cutoffISO),
    recentOrOnSiteIds("Visitors_id", visitorIds, cutoffISO),
  ]);

  type Job = {
    kind: "person" | "visitor";
    id: number;
    decision: RetentionDecision;
  };
  const jobs: Job[] = [];

  for (const row of people) {
    const id = row.Id as number;
    const decision = planRetention(
      {
        anonymisedAt: row.AnonymisedAt,
        onSite: peopleFlags.onSite.has(id),
        activityDates: [
          row.CreatedAt1,
          peopleFlags.recent.has(id) ? cutoffMs + 1 : null,
        ],
      },
      cutoffMs
    );
    result.scanned += 1;
    jobs.push({ kind: "person", id, decision });
  }

  for (const row of visitors) {
    const id = row.Id as number;
    const decision = planRetention(
      {
        anonymisedAt: row.AnonymisedAt,
        onSite: visitorFlags.onSite.has(id),
        activityDates: [
          row.CreatedAt1,
          visitorFlags.recent.has(id) ? cutoffMs + 1 : null,
        ],
      },
      cutoffMs
    );
    result.scanned += 1;
    jobs.push({ kind: "visitor", id, decision });
  }

  const CHUNK = 5;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async ({ kind, id, decision }) => {
        if (decision.action === "skip") {
          result.skipped += 1;
          result.records.push({
            kind,
            id,
            lastActivity: null,
            reason: decision.reason,
          });
          return;
        }

        const lastActivity = new Date(decision.lastActivity)
          .toISOString()
          .replace(/\.\d{3}Z$/, "Z");

        if (dryRun) {
          result.anonymised += 1;
          result.records.push({ kind, id, lastActivity });
          return;
        }

        try {
          if (kind === "person") {
            await anonymisePerson(id, timestamp, decision.lastActivity);
          } else {
            await anonymiseVisitor(id, timestamp, decision.lastActivity);
          }
          result.anonymised += 1;
          result.records.push({ kind, id, lastActivity });
        } catch (err) {
          result.failed += 1;
          result.records.push({
            kind,
            id,
            lastActivity,
            error: String(err),
          });
        }
      })
    );
  }

  return result;
}
