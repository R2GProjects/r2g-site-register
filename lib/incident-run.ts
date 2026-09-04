import { generateUUID, nowISO } from "@/lib/auth";
import { managerAddress } from "@/lib/notify";
import {
  incidentEmail,
  incidentStatus,
  reporterName,
  validateIncident,
} from "@/lib/incident";
import { sendNotify } from "@/lib/mail";
import {
  TABLES,
  attachSiteDetails,
  create,
  ensureIncidentTable,
  getOne,
  list,
  listPage,
  numericId,
  update,
} from "@/lib/nocodb";
import type { Person } from "@/lib/types";

const INCIDENT_FIELDS =
  "Id,IncidentUUID,Kind,Status,What,WhereOnSite,Action,OccurredAt,Day,Sites_id,People_id,Attendance_id,ReporterName,AdminNotes,CreatedAt1,UpdatedAt1";

function withIds<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    Sites_id: numericId(row.Sites_id),
    People_id: numericId(row.People_id),
    Attendance_id: numericId(row.Attendance_id),
  };
}

export async function openAttendanceAtSite(
  personId: number,
  siteId: number
): Promise<number | null> {
  const rows = await list<Record<string, unknown>>(TABLES.Attendance, {
    where: `((People_id,eq,${personId})~and(Status,eq,OnSite)~and(Sites_id,eq,${siteId}))`,
    limit: 1,
    fields: "Id,Sites_id,Status",
  });
  return numericId(rows[0]?.Id);
}

export async function fileIncident(input: {
  body: Record<string, unknown>;
  person: Person;
  now?: number;
}): Promise<{ id: number } | { error: string; status: number }> {
  const parsed = validateIncident(
    { ...input.body, status: "open" },
    input.now
  );
  if (!parsed.ok) {
    const message =
      parsed.reason === "noKind"
        ? "Say whether this is a hazard, a near miss or an incident."
        : parsed.reason === "noWhat"
          ? "Describe what you saw."
          : parsed.reason === "tooLong"
            ? "That description is too long to store."
            : parsed.reason === "noSite"
              ? "Pick the site this relates to."
              : parsed.reason === "badTime"
                ? "The time could not be read."
                : "That status is not used.";
    return { error: message, status: 400 };
  }

  const site = await getOne<Record<string, unknown>>(
    TABLES.Sites,
    parsed.draft.siteId
  );
  if (!site) return { error: "Site not found.", status: 404 };

  const attendanceId = await openAttendanceAtSite(
    input.person.Id,
    parsed.draft.siteId
  );
  const table = await ensureIncidentTable();
  const nowStamp = nowISO();
  const id = await create(table, {
    IncidentUUID: generateUUID(),
    Kind: parsed.draft.kind,
    Status: "open",
    What: parsed.draft.what,
    WhereOnSite: parsed.draft.whereOnSite || null,
    Action: parsed.draft.action || null,
    OccurredAt: parsed.draft.occurredAt,
    Day: parsed.draft.day,
    Sites_id: String(parsed.draft.siteId),
    People_id: String(input.person.Id),
    Attendance_id: attendanceId ? String(attendanceId) : null,
    ReporterName: reporterName(input.person),
    CreatedAt1: nowStamp,
    UpdatedAt1: nowStamp,
  });

  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "IncidentFiled",
    Person: String(input.person.Id),
    Attendance: attendanceId ? String(attendanceId) : null,
    Site: String(parsed.draft.siteId),
    PerformedBy: reporterName(input.person),
    Source: "Worker",
    NewValue: parsed.draft.what,
    CreatedAt1: nowStamp,
  });

  const to = managerAddress(site);
  if (to) {
    const mail = incidentEmail({
      kind: parsed.draft.kind,
      siteName: String(site.SiteName || site.SiteCode || "Site"),
      reporter: reporterName(input.person),
      what: parsed.draft.what,
      whereOnSite: parsed.draft.whereOnSite,
    });
    try {
      await sendNotify({
        kind: "incident-report",
        to,
        subject: mail.subject,
        text: mail.text,
        siteCode: String(site.SiteCode || ""),
      });
    } catch {
      // The report is the record. Telling the manager must not undo it.
    }
  }

  return { id };
}

export async function listIncidents(query: {
  siteId: number | null;
  status: string;
  from: string;
  to: string;
}) {
  const table = await ensureIncidentTable();
  const conditions: string[] = [];
  if (query.siteId) conditions.push(`(Sites_id,eq,${query.siteId})`);
  if (query.status) conditions.push(`(Status,eq,${query.status})`);
  if (query.from) conditions.push(`(Day,gte,${query.from})`);
  if (query.to) conditions.push(`(Day,lte,${query.to})`);
  const where =
    conditions.length === 0
      ? ""
      : conditions.length === 1
        ? conditions[0]
        : `(${conditions.join("~and")})`;
  const result = await listPage<Record<string, unknown>>(table, {
    where,
    limit: 100,
    sort: "-OccurredAt",
    fields: INCIDENT_FIELDS,
  });
  const withSites = await attachSiteDetails(result.list.map(withIds));
  return { ...result, list: withSites };
}

export async function updateIncident(input: {
  id: number;
  status?: unknown;
  adminNotes?: unknown;
  performedBy?: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  let nextStatus: string | undefined;
  if (input.status != null && String(input.status).trim() !== "") {
    const parsed = incidentStatus(input.status);
    if (!parsed) return { error: "That status is not used.", status: 400 };
    nextStatus = parsed;
  }
  const table = await ensureIncidentTable();
  const existing = await getOne<Record<string, unknown>>(table, input.id);
  if (!existing) return { error: "Report not found.", status: 404 };
  const fields: Record<string, unknown> = { UpdatedAt1: nowISO() };
  if (nextStatus) fields.Status = nextStatus;
  if ("adminNotes" in input) {
    fields.AdminNotes = String(input.adminNotes ?? "").trim() || null;
  }
  await update(table, { Id: input.id, ...fields });
  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "IncidentUpdated",
    Site: String(existing.Sites_id || ""),
    Person: String(existing.People_id || ""),
    PerformedBy: input.performedBy?.trim() || "admin",
    Source: "AdminPanel",
    OldValue: String(existing.Status || ""),
    NewValue: String(fields.Status ?? existing.Status ?? ""),
    CreatedAt1: nowISO(),
  });
  return { ok: true };
}
