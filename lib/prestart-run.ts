import { generateUUID, nowISO } from "@/lib/auth";
import { dayKey } from "@/lib/attendance";
import {
  TABLES,
  attachPersonDetails,
  attachSiteDetails,
  attachVisitorDetails,
  create,
  ensurePreStartTable,
  getOne,
  list,
  listPage,
  numericId,
  update,
} from "@/lib/nocodb";
import {
  attendeesFromOnSite,
  mergeAttendees,
  parseRoll,
  preStartCounts,
  serializeRoll,
  validatePreStart,
  type PreStartAttendee,
  type PreStartDraft,
} from "@/lib/prestart";

const PRESTART_FIELDS =
  "Id,PreStartUUID,Day,HeldAt,Topic,Hazards,LedBy,Sites_id,Roll,CreatedAt1,UpdatedAt1";

export interface PreStartQuery {
  siteId: number | null;
  from: string;
  to: string;
  id: number | null;
}

export function preStartQueryFrom(searchParams: URLSearchParams): PreStartQuery {
  return {
    siteId: numericId(searchParams.get("siteId")),
    from: String(searchParams.get("from") ?? "").trim(),
    to: String(searchParams.get("to") ?? "").trim(),
    id: numericId(searchParams.get("id")),
  };
}

function whereFrom(query: PreStartQuery): string {
  const from = query.from;
  const to = query.to;
  const conditions: string[] = [];
  if (query.siteId) conditions.push(`(Sites_id,eq,${query.siteId})`);
  if (from) conditions.push(`(Day,gte,${from})`);
  if (to) conditions.push(`(Day,lte,${to})`);
  if (conditions.length === 0) return "";
  if (conditions.length === 1) return conditions[0];
  return `(${conditions.join("~and")})`;
}

function withNumericSite<T extends Record<string, unknown>>(row: T): T {
  const siteId = numericId(row.Sites_id);
  return siteId ? { ...row, Sites_id: siteId } : row;
}

export function viewOf(row: Record<string, unknown>) {
  const attendees = parseRoll(row.Roll);
  return {
    ...row,
    Sites_id: numericId(row.Sites_id),
    attendees,
    counts: preStartCounts(attendees),
  };
}

export async function listOnSiteAttendees(
  siteId: number
): Promise<PreStartAttendee[]> {
  const records = await attachVisitorDetails(
    await attachPersonDetails(
      await list<Record<string, unknown>>(TABLES.Attendance, {
        where: `((Status,eq,OnSite)~and(Sites_id,eq,${siteId}))`,
        fields:
          "Id,AttendanceType,SignInTime,Status,Person,People_id,Visitor,Visitors_id,Sites_id",
        limit: 200,
        sort: "-SignInTime",
      })
    )
  );
  return attendeesFromOnSite(records);
}

export async function loadPreStartDraft(siteId: number, now = Date.now()) {
  const attendees = await listOnSiteAttendees(siteId);
  const heldAt = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    Sites_id: siteId,
    Day: dayKey(heldAt),
    HeldAt: heldAt,
    Topic: "",
    Hazards: "",
    LedBy: "",
    attendees,
    counts: preStartCounts(attendees),
  };
}

export async function getPreStart(id: number) {
  const table = await ensurePreStartTable();
  const row = await getOne<Record<string, unknown>>(table, id);
  if (!row) return null;
  const [withSite] = await attachSiteDetails([withNumericSite(row)]);
  return viewOf(withSite);
}

export async function listPreStarts(query: PreStartQuery) {
  const table = await ensurePreStartTable();
  const result = await listPage<Record<string, unknown>>(table, {
    where: whereFrom(query),
    limit: 100,
    sort: "-HeldAt",
    fields: PRESTART_FIELDS,
  });
  const withSites = await attachSiteDetails(result.list.map(withNumericSite));
  return {
    ...result,
    list: withSites.map(viewOf),
  };
}

export async function savePreStart(
  input: Record<string, unknown>,
  options?: { now?: number; performedBy?: string }
): Promise<{ id: number; draft: PreStartDraft } | { error: string; status: number }> {
  const now = options?.now ?? Date.now();
  const performedBy = options?.performedBy?.trim() || "admin";
  const parsed = validatePreStart(input, now);
  if (!parsed.ok) {
    const message =
      parsed.reason === "noSite"
        ? "Pick a site."
        : parsed.reason === "badTime"
          ? "The time of the talk could not be read."
          : "The attendance list was not a list.";
    return { error: message, status: 400 };
  }

  const site = await getOne<Record<string, unknown>>(TABLES.Sites, parsed.draft.siteId);
  if (!site) return { error: "Site not found.", status: 404 };

  const table = await ensurePreStartTable();
  const nowStamp = nowISO();
  const fields = {
    Day: parsed.draft.day,
    HeldAt: parsed.draft.heldAt,
    Topic: parsed.draft.topic || null,
    Hazards: parsed.draft.hazards || null,
    LedBy: parsed.draft.ledBy || null,
    Sites_id: String(parsed.draft.siteId),
    Roll: serializeRoll(parsed.draft.attendees),
    UpdatedAt1: nowStamp,
  };

  const existingId = numericId(input.Id ?? input.id);
  if (existingId) {
    const existing = await getOne<Record<string, unknown>>(table, existingId);
    if (!existing) return { error: "Pre-start not found.", status: 404 };
    await update(table, { Id: existingId, ...fields });
    await create(TABLES.AuditLog, {
      AuditUUID: generateUUID(),
      EventType: "PreStartUpdated",
      Site: String(parsed.draft.siteId),
      PerformedBy: performedBy,
      Source: "AdminPanel",
      OldValue: String(existing.Roll ?? ""),
      NewValue: fields.Roll,
      CreatedAt1: nowStamp,
    });
    return { id: existingId, draft: parsed.draft };
  }

  const id = await create(table, {
    PreStartUUID: generateUUID(),
    CreatedAt1: nowStamp,
    ...fields,
  });
  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "PreStartHeld",
    Site: String(parsed.draft.siteId),
    PerformedBy: performedBy,
    Source: "AdminPanel",
    NewValue: fields.Roll,
    CreatedAt1: nowStamp,
  });
  return { id, draft: parsed.draft };
}

export async function refreshPreStartRoll(
  attendees: unknown,
  siteId: number
): Promise<PreStartAttendee[]> {
  const onSite = await listOnSiteAttendees(siteId);
  return mergeAttendees(parseRoll(attendees), onSite);
}
