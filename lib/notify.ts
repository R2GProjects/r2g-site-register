/**
 * Who to tell, and what to say, when someone is still on the register
 * after knock-off.
 *
 * The auto-close job at 2am stamps a forgotten day shift. This is the cheaper
 * fix that runs first: a reminder at cut-off, while the person can still tap
 * Sign out themselves, and a one-line summary to the site manager so they
 * know who did not.
 */

import {
  dayKey,
  formatDay,
  formatTime,
  SITE_TIMEZONE,
  siteLocalInstant,
} from "@/lib/attendance";
import { autoCloseConfig } from "@/lib/auto-close";

const HOUR_MS = 3_600_000;

export type ReminderSkip =
  | "beforeCutoff"
  | "nightShift"
  | "dueAutoClose"
  | "already"
  | "badTime";

export type ReminderPlan =
  | { remind: true }
  | { remind: false; reason: ReminderSkip };

export interface NotifyClock {
  cutoff: { hours: number; minutes: number };
  maxHours: number;
}

export function notifyClock(
  env: Record<string, string | undefined> = process.env
): NotifyClock {
  const auto = autoCloseConfig(env);
  return { cutoff: auto.cutoff, maxHours: auto.maxHours };
}

/**
 * A still-open record is worth a reminder when knock-off has passed, the
 * person signed in as a day shift, and auto-close has not yet taken over.
 *
 * A night-shift worker who started after cut-off is left alone — the same
 * rule auto-close uses, so the two jobs do not argue.
 */
export function planSignOutReminder(
  input: {
    signInTime: unknown;
    remindedAt?: unknown;
  },
  clock: NotifyClock,
  now: number = Date.now()
): ReminderPlan {
  if (input.remindedAt) {
    const reminded = new Date(String(input.remindedAt)).getTime();
    if (!Number.isNaN(reminded)) return { remind: false, reason: "already" };
  }

  const signInMs = new Date(String(input.signInTime ?? "")).getTime();
  if (Number.isNaN(signInMs) || signInMs > now) {
    return { remind: false, reason: "badTime" };
  }

  const today = dayKey(new Date(now).toISOString());
  const cutoffMs = siteLocalInstant(today, clock.cutoff.hours, clock.cutoff.minutes);
  if (cutoffMs === null) return { remind: false, reason: "badTime" };
  if (now < cutoffMs) return { remind: false, reason: "beforeCutoff" };

  if (signInMs >= cutoffMs) return { remind: false, reason: "nightShift" };

  if (now - signInMs > clock.maxHours * HOUR_MS) {
    return { remind: false, reason: "dueAutoClose" };
  }

  return { remind: true };
}

/**
 * A sign-in outside ordinary site hours. Used in the manager summary, not to
 * refuse the tap — a delivery at 7pm is still a real visit.
 */
export function isAfterHours(
  iso: unknown,
  cutoff: { hours: number; minutes: number },
  timeZone = SITE_TIMEZONE
): boolean {
  const date = new Date(String(iso ?? ""));
  if (Number.isNaN(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  return hour > cutoff.hours || (hour === cutoff.hours && minute >= cutoff.minutes);
}

export function notifyAddress(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function reminderEmail(input: {
  firstName: string;
  siteName: string;
  signedInAt: unknown;
}): { subject: string; text: string } {
  const when = formatTime(input.signedInAt) || "earlier today";
  const name = input.firstName.trim() || "there";
  return {
    subject: `You're still signed in at ${input.siteName}`,
    text: [
      `Hi ${name},`,
      "",
      `The site register still has you signed in at ${input.siteName} (since ${when}).`,
      "If you have left, sign out from the same page you used this morning, or ask the site manager to sign you out.",
      "",
      "If you are still on site, you can ignore this.",
    ].join("\n"),
  };
}

export interface SummaryRow {
  name: string;
  signedInAt: unknown;
  signedOutAt?: unknown;
  onSite: boolean;
  afterHours: boolean;
}

export function summaryEmail(input: {
  siteName: string;
  date: string;
  stillOnSite: SummaryRow[];
  signedInToday: number;
  signedOutToday: number;
  afterHours: SummaryRow[];
}): { subject: string; text: string } {
  const day = formatDay(input.date) || input.date;
  const lines: string[] = [];

  if (input.stillOnSite.length === 0) {
    lines.push("Nobody is still signed in.");
  } else {
    lines.push(`Still signed in (${input.stillOnSite.length}):`);
    for (const row of input.stillOnSite) {
      const when = formatTime(row.signedInAt) || "unknown time";
      lines.push(`- ${row.name} (since ${when})`);
    }
  }

  lines.push("");
  lines.push(
    `Signed in today: ${input.signedInToday}. Signed out today: ${input.signedOutToday}.`
  );

  if (input.afterHours.length > 0) {
    lines.push("");
    lines.push("Signed in after knock-off:");
    for (const row of input.afterHours) {
      const when = formatTime(row.signedInAt) || "unknown time";
      lines.push(`- ${row.name} at ${when}`);
    }
  }

  return {
    subject: `${input.siteName} — ${day}`,
    text: lines.join("\n"),
  };
}

export function summaryDedupeKey(siteId: number, day: string): string {
  return `${siteId}:${day}`;
}

export function managerAddress(
  site: { SiteManagerEmail?: unknown },
  env: Record<string, string | undefined> = process.env
): string | null {
  return notifyAddress(site.SiteManagerEmail) || notifyAddress(env.NOTIFY_DEFAULT_TO);
}
