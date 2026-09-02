import {
  TABLES,
  list,
  update,
  create,
  ensureNotifyColumns,
  attachPersonDetails,
  attachVisitorDetails,
  attachSiteDetails,
} from "@/lib/nocodb";
import { generateUUID, nowISO } from "@/lib/auth";
import { dayKey, personName } from "@/lib/attendance";
import {
  isAfterHours,
  managerAddress,
  notifyClock,
  notifyAddress,
  planSignOutReminder,
  reminderEmail,
  summaryEmail,
  type SummaryRow,
} from "@/lib/notify";
import { notifyTransport, sendNotify } from "@/lib/mail";

const BATCH = 500;

export interface NotifyRunResult {
  dryRun: boolean;
  configured: boolean;
  reminders: {
    scanned: number;
    sent: number;
    skipped: number;
    failed: number;
    noAddress: number;
  };
  summaries: { sent: number; skipped: number; failed: number };
  records: Array<{
    kind: "reminder" | "summary";
    to?: string;
    site?: string;
    name?: string;
    skipped?: string;
    error?: string;
  }>;
}

function displayName(row: Record<string, unknown>): string {
  return personName(row);
}

function personFirstName(row: Record<string, unknown>): string {
  const person = row.Person as { FirstName?: string } | undefined;
  if (person?.FirstName) return person.FirstName;
  const visitor = row.Visitor as { FirstName?: string } | undefined;
  return visitor?.FirstName || "there";
}

function rowEmail(row: Record<string, unknown>): string | null {
  const person = row.Person as { Email?: unknown } | undefined;
  const visitor = row.Visitor as { Email?: unknown } | undefined;
  return notifyAddress(person?.Email) || notifyAddress(visitor?.Email);
}

function siteOf(row: Record<string, unknown>): {
  Id?: number;
  SiteName?: string;
  SiteCode?: string;
  SiteManagerEmail?: unknown;
  LastSummaryDate?: unknown;
} | null {
  const site = row.Site;
  if (site && typeof site === "object") {
    return site as {
      Id?: number;
      SiteName?: string;
      SiteCode?: string;
      SiteManagerEmail?: unknown;
      LastSummaryDate?: unknown;
    };
  }
  return null;
}

/**
 * Sends sign-out reminders and a per-site daily summary.
 *
 * Safe to run repeatedly: a reminder writes SignOutRemindedAt, a summary
 * writes LastSummaryDate, and a failed send leaves both blank so the next
 * run tries again.
 */
export async function runNotify(options?: {
  dryRun?: boolean;
  now?: number;
  env?: Record<string, string | undefined>;
}): Promise<NotifyRunResult> {
  await ensureNotifyColumns();

  const now = options?.now ?? Date.now();
  const dryRun = options?.dryRun ?? false;
  const env = options?.env ?? process.env;
  const clock = notifyClock(env);
  const transport = notifyTransport(env);
  const configured = transport.kind !== "none";
  const today = dayKey(new Date(now).toISOString());
  const timestamp = nowISO();

  const result: NotifyRunResult = {
    dryRun,
    configured,
    reminders: { scanned: 0, sent: 0, skipped: 0, failed: 0, noAddress: 0 },
    summaries: { sent: 0, skipped: 0, failed: 0 },
    records: [],
  };

  const open = await attachVisitorDetails(
    await attachPersonDetails(
      await attachSiteDetails(
        await list<Record<string, unknown>>(TABLES.Attendance, {
          where: "(Status,eq,OnSite)",
          limit: BATCH,
          sort: "SignInTime",
          fields:
            "Id,SignInTime,Status,Sites_id,People_id,Visitors_id,SignOutRemindedAt",
        })
      ),
      "Id,FirstName,LastName,Email"
    )
  );

  result.reminders.scanned = open.length;

  for (const row of open) {
    const plan = planSignOutReminder(
      { signInTime: row.SignInTime, remindedAt: row.SignOutRemindedAt },
      clock,
      now
    );
    if (!plan.remind) {
      result.reminders.skipped += 1;
      continue;
    }

    const to = rowEmail(row);
    const site = siteOf(row);
    const siteName = site?.SiteName || site?.SiteCode || "site";
    const name = displayName(row);

    if (!to) {
      result.reminders.noAddress += 1;
      result.records.push({
        kind: "reminder",
        name,
        site: String(site?.SiteCode || ""),
        skipped: "noAddress",
      });
      continue;
    }

    const mail = reminderEmail({
      firstName: personFirstName(row),
      siteName: String(siteName),
      signedInAt: row.SignInTime,
    });

    if (!configured) {
      result.reminders.skipped += 1;
      result.records.push({
        kind: "reminder",
        to,
        name,
        site: String(site?.SiteCode || ""),
        skipped: "notConfigured",
      });
      continue;
    }

    if (dryRun) {
      result.reminders.sent += 1;
      result.records.push({
        kind: "reminder",
        to,
        name,
        site: String(site?.SiteCode || ""),
        skipped: "dryRun",
      });
      continue;
    }

    const sent = await sendNotify(
      {
        kind: "signout-reminder",
        to,
        subject: mail.subject,
        text: mail.text,
        siteCode: site?.SiteCode ? String(site.SiteCode) : undefined,
      },
      transport
    );

    if (!sent.ok) {
      result.reminders.failed += 1;
      result.records.push({
        kind: "reminder",
        to,
        name,
        site: String(site?.SiteCode || ""),
        error: sent.error,
      });
      continue;
    }

    await update(TABLES.Attendance, {
      Id: row.Id as number,
      SignOutRemindedAt: timestamp,
      UpdatedAt1: timestamp,
    });
    await create(TABLES.AuditLog, {
      AuditUUID: generateUUID(),
      EventType: "SignOutReminder",
      Person: String(row.People_id || ""),
      Attendance: String(row.Id),
      Site: String(row.Sites_id || ""),
      PerformedBy: "system",
      Source: "Notify",
      NewValue: JSON.stringify({ to, site: site?.SiteCode || null }),
      CreatedAt1: timestamp,
    });
    result.reminders.sent += 1;
    result.records.push({
      kind: "reminder",
      to,
      name,
      site: String(site?.SiteCode || ""),
    });
  }

  const sites = await list<Record<string, unknown>>(TABLES.Sites, {
    where: "(Status,eq,Active)~or(Status,eq,Setup)",
    fields: "Id,SiteCode,SiteName,SiteManagerEmail,LastSummaryDate,Status",
    limit: 200,
  });

  for (const site of sites) {
    const siteId = site.Id as number;
    if (String(site.LastSummaryDate || "") === today) {
      result.summaries.skipped += 1;
      continue;
    }

    const history = await attachVisitorDetails(
      await attachPersonDetails(
        await list<Record<string, unknown>>(TABLES.Attendance, {
          where: `(Sites_id,eq,${siteId})`,
          sort: "-SignInTime",
          limit: BATCH,
          fields: "Id,SignInTime,SignOutTime,Status,People_id,Visitors_id",
        }),
        "Id,FirstName,LastName,Email"
      )
    );

    const stillOnSite: SummaryRow[] = [];
    const afterHours: SummaryRow[] = [];
    let signedInToday = 0;
    let signedOutToday = 0;

    for (const row of history) {
      const inToday = dayKey(row.SignInTime) === today;
      const outToday = row.SignOutTime ? dayKey(row.SignOutTime) === today : false;
      if (inToday) signedInToday += 1;
      if (outToday) signedOutToday += 1;
      const after = isAfterHours(row.SignInTime, clock.cutoff);
      const summaryRow: SummaryRow = {
        name: displayName(row),
        signedInAt: row.SignInTime,
        signedOutAt: row.SignOutTime,
        onSite: row.Status === "OnSite",
        afterHours: after,
      };
      if (row.Status === "OnSite") stillOnSite.push(summaryRow);
      if (inToday && after) afterHours.push(summaryRow);
    }

    if (stillOnSite.length === 0 && signedInToday === 0) {
      result.summaries.skipped += 1;
      continue;
    }

    const to = managerAddress(site, env);
    const siteName = String(site.SiteName || site.SiteCode || "Site");
    const mail = summaryEmail({
      siteName,
      date: today,
      stillOnSite,
      signedInToday,
      signedOutToday,
      afterHours,
    });

    if (!to) {
      result.summaries.skipped += 1;
      result.records.push({
        kind: "summary",
        site: String(site.SiteCode || ""),
        skipped: "noAddress",
      });
      continue;
    }

    if (!configured) {
      result.summaries.skipped += 1;
      result.records.push({
        kind: "summary",
        to,
        site: String(site.SiteCode || ""),
        skipped: "notConfigured",
      });
      continue;
    }

    if (dryRun) {
      result.summaries.sent += 1;
      result.records.push({
        kind: "summary",
        to,
        site: String(site.SiteCode || ""),
        skipped: "dryRun",
      });
      continue;
    }

    const sent = await sendNotify(
      {
        kind: "daily-summary",
        to,
        subject: mail.subject,
        text: mail.text,
        siteCode: site.SiteCode ? String(site.SiteCode) : undefined,
      },
      transport
    );

    if (!sent.ok) {
      result.summaries.failed += 1;
      result.records.push({
        kind: "summary",
        to,
        site: String(site.SiteCode || ""),
        error: sent.error,
      });
      continue;
    }

    await update(TABLES.Sites, {
      Id: siteId,
      LastSummaryDate: today,
      UpdatedAt1: timestamp,
    });
    await create(TABLES.AuditLog, {
      AuditUUID: generateUUID(),
      EventType: "DailySummary",
      Site: String(siteId),
      PerformedBy: "system",
      Source: "Notify",
      NewValue: JSON.stringify({
        to,
        date: today,
        stillOnSite: stillOnSite.length,
        signedInToday,
      }),
      CreatedAt1: timestamp,
    });
    result.summaries.sent += 1;
    result.records.push({
      kind: "summary",
      to,
      site: String(site.SiteCode || ""),
    });
  }

  return result;
}
