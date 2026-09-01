import { TABLES, list, update, create } from "@/lib/nocodb";
import { generateUUID, nowISO } from "@/lib/auth";
import { dayKey, parseClockTime, siteLocalInstant } from "@/lib/attendance";

const HOUR_MS = 3_600_000;

export interface AutoCloseConfig {
  /** Site-local time of day used as the sign-out stamp for a normal day shift. */
  cutoff: { hours: number; minutes: number };
  /** A record open longer than this is treated as a forgotten sign-out. */
  maxHours: number;
  /** Upper bound on records touched in a single run. */
  batchLimit: number;
}

export const DEFAULT_CUTOFF = "18:00";
export const DEFAULT_MAX_HOURS = 12;

export function autoCloseConfig(
  env: Record<string, string | undefined> = process.env
): AutoCloseConfig {
  const cutoff = parseClockTime(env.AUTO_CLOSE_CUTOFF) ??
    parseClockTime(DEFAULT_CUTOFF) ?? { hours: 18, minutes: 0 };

  const parsedMax = Number(env.AUTO_CLOSE_MAX_HOURS);
  const maxHours =
    Number.isFinite(parsedMax) && parsedMax > 0 && parsedMax <= 48
      ? parsedMax
      : DEFAULT_MAX_HOURS;

  const parsedLimit = Number(env.AUTO_CLOSE_LIMIT);
  const batchLimit =
    Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 2000
      ? parsedLimit
      : 500;

  return { cutoff, maxHours, batchLimit };
}

export interface AutoClosePlan {
  signOutAt: string;
  hours: number;
  reason: "cutoff" | "maxShift";
}

/**
 * Decides whether a still-open record is a forgotten sign-out, and when it
 * should be stamped.
 *
 * The test is elapsed time rather than "signed in on an earlier date", so a
 * night-shift worker who started at 11pm and is genuinely still on site at 2am
 * is left alone. Once a record passes `maxHours` it is stamped at that day's
 * cut-off where that falls inside the shift, which is closer to when the person
 * actually left than the moment the job happens to run.
 */
export function planAutoClose(
  signInTime: unknown,
  config: AutoCloseConfig,
  now: number = Date.now()
): AutoClosePlan | null {
  if (!signInTime) return null;
  const signInMs = new Date(String(signInTime)).getTime();
  if (Number.isNaN(signInMs) || signInMs > now) return null;

  if (now - signInMs <= config.maxHours * HOUR_MS) return null;

  const capMs = signInMs + config.maxHours * HOUR_MS;
  const cutoffMs = siteLocalInstant(
    dayKey(signInTime),
    config.cutoff.hours,
    config.cutoff.minutes
  );

  const useCutoff =
    cutoffMs !== null && cutoffMs > signInMs && cutoffMs < capMs;
  const endMs = useCutoff ? (cutoffMs as number) : capMs;

  return {
    signOutAt: new Date(endMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
    hours: (endMs - signInMs) / HOUR_MS,
    reason: useCutoff ? "cutoff" : "maxShift",
  };
}

export interface AutoCloseResult {
  scanned: number;
  closed: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  config: { cutoff: string; maxHours: number };
  records: Array<{
    id: number;
    siteId: number | null;
    personId: number | null;
    signInTime: string | null;
    signOutAt: string;
    hours: number;
    reason: AutoClosePlan["reason"];
    error?: string;
  }>;
}

interface OpenRecord {
  Id: number;
  SignInTime: string | null;
  Status: string | null;
  Sites_id: number | null;
  People_id: number | null;
  Visitors_id: number | null;
}

async function closeOne(
  record: OpenRecord,
  plan: AutoClosePlan,
  timestamp: string
): Promise<void> {
  await update(TABLES.Attendance, {
    Id: record.Id,
    SignOutTime: plan.signOutAt,
    Status: "AutoClosed",
    UpdatedAt1: timestamp,
  });

  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "AutoSignOut",
    Person: String(record.People_id || ""),
    Attendance: String(record.Id),
    Site: String(record.Sites_id || ""),
    PerformedBy: "system",
    Source: "AutoClose",
    OldValue: JSON.stringify({ Status: record.Status, SignOutTime: null }),
    NewValue: JSON.stringify({
      Status: "AutoClosed",
      SignOutTime: plan.signOutAt,
      Reason: plan.reason,
    }),
    IPAddress: null,
    UserAgent: null,
    CreatedAt1: timestamp,
  });
}

/**
 * Closes every attendance record that has been left open past the configured
 * shift length. Safe to run repeatedly — a record already closed no longer
 * matches the query.
 */
export async function runAutoClose(options?: {
  dryRun?: boolean;
  config?: AutoCloseConfig;
  now?: number;
}): Promise<AutoCloseResult> {
  const config = options?.config ?? autoCloseConfig();
  const now = options?.now ?? Date.now();
  const dryRun = options?.dryRun ?? false;

  const open = await list<OpenRecord>(TABLES.Attendance, {
    where: "(Status,eq,OnSite)",
    limit: config.batchLimit,
    sort: "SignInTime",
    fields: "Id,SignInTime,Status,Sites_id,People_id,Visitors_id",
  });

  const result: AutoCloseResult = {
    scanned: open.length,
    closed: 0,
    skipped: 0,
    failed: 0,
    dryRun,
    config: {
      cutoff: `${String(config.cutoff.hours).padStart(2, "0")}:${String(
        config.cutoff.minutes
      ).padStart(2, "0")}`,
      maxHours: config.maxHours,
    },
    records: [],
  };

  const due: Array<{ record: OpenRecord; plan: AutoClosePlan }> = [];
  for (const record of open) {
    const plan = planAutoClose(record.SignInTime, config, now);
    if (!plan) {
      result.skipped += 1;
      continue;
    }
    due.push({ record, plan });
  }

  const timestamp = nowISO();

  // Small batches keep a long backlog from opening hundreds of parallel
  // connections to NocoDB on the first run.
  const CHUNK = 5;
  for (let i = 0; i < due.length; i += CHUNK) {
    const chunk = due.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async ({ record, plan }) => {
        const entry = {
          id: record.Id,
          siteId: record.Sites_id ?? null,
          personId: record.People_id ?? null,
          signInTime: record.SignInTime,
          signOutAt: plan.signOutAt,
          hours: Number(plan.hours.toFixed(2)),
          reason: plan.reason,
        };

        if (dryRun) {
          result.records.push(entry);
          result.closed += 1;
          return;
        }

        try {
          await closeOne(record, plan, timestamp);
          result.records.push(entry);
          result.closed += 1;
        } catch (err) {
          result.records.push({ ...entry, error: String(err) });
          result.failed += 1;
        }
      })
    );
  }

  return result;
}
