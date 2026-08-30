export function personName(record: Record<string, unknown>): string {
  const person = record.Person as { FirstName?: string; LastName?: string } | undefined;
  if (person && (person.FirstName || person.LastName)) {
    return `${person.FirstName || ""} ${person.LastName || ""}`.trim();
  }
  const visitor = record.Visitor as { FirstName?: string; LastName?: string; Id?: number } | undefined;
  if (visitor && (visitor.FirstName || visitor.LastName)) {
    return `${visitor.FirstName || ""} ${visitor.LastName || ""}`.trim();
  }
  if (visitor?.Id) return `Visitor #${visitor.Id}`;
  return "Unknown";
}

export function hoursLogged(signIn: unknown, signOut: unknown, now = Date.now()): number {
  if (!signIn) return 0;
  const start = new Date(String(signIn)).getTime();
  if (Number.isNaN(start)) return 0;
  const end = signOut ? new Date(String(signOut)).getTime() : now;
  if (Number.isNaN(end) || end < start) return 0;
  return (end - start) / 3_600_000;
}

export function formatHours(hours: number): string {
  if (hours <= 0) return "0h";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const SITE_TIMEZONE = "Australia/Sydney";

export function dayKey(iso: unknown, timeZone = SITE_TIMEZONE): string {
  if (!iso) return "";
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * How far `timeZone` is ahead of UTC at a given instant, in milliseconds.
 * Rounded down to whole seconds on both sides, since the formatter has no
 * millisecond field and an uneven comparison would skew the result.
 */
function zoneOffsetMs(rawInstant: number, timeZone: string): number {
  const instant = Math.floor(rawInstant / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUTC - instant;
}

/**
 * The UTC instant matching the start or end of a `YYYY-MM-DD` day as it is lived
 * on site. Filtering on raw UTC midnight would drop the early morning sign-ins
 * that make up most of a shift, since 7am in Sydney is the previous day in UTC.
 * Returns null for anything that is not a plain calendar date.
 */
export function dayBoundaryISO(
  day: unknown,
  edge: "start" | "end",
  timeZone = SITE_TIMEZONE
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;

  const wall =
    edge === "end"
      ? Date.UTC(year, month - 1, date, 23, 59, 59, 0)
      : Date.UTC(year, month - 1, date, 0, 0, 0, 0);

  // Two passes so a boundary that falls on a daylight-saving change resolves
  // against the offset actually in force at that instant.
  const firstPass = wall - zoneOffsetMs(wall, timeZone);
  const instant = wall - zoneOffsetMs(firstPass, timeZone);
  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatDay(key: string): string {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

export function formatTime(iso: unknown): string {
  if (!iso) return "";
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export interface DayPerson {
  name: string;
  inAt: string | null;
  outAt: string | null;
  onSite: boolean;
  hours: number;
}

export function buildAttendanceSummary(records: Array<Record<string, unknown>>) {
  const now = Date.now();
  let totalHours = 0;
  const onsiteNames: string[] = [];
  const byDay = new Map<string, { hours: number; names: Set<string>; count: number; people: DayPerson[] }>();

  for (const record of records) {
    const hours = hoursLogged(record.SignInTime, record.SignOutTime, now);
    totalHours += hours;
    const name = personName(record);
    if (record.Status === "OnSite" && !onsiteNames.includes(name)) {
      onsiteNames.push(name);
    }
    const key = dayKey(record.SignInTime);
    if (!key) continue;
    const outKey = record.SignOutTime ? dayKey(record.SignOutTime) : "";
    const day = byDay.get(key) || { hours: 0, names: new Set<string>(), count: 0, people: [] };
    day.hours += hours;
    day.names.add(name);
    day.count += 1;
    day.people.push({
      name,
      inAt: record.SignInTime ? String(record.SignInTime) : null,
      outAt: outKey === key && record.SignOutTime ? String(record.SignOutTime) : null,
      onSite: record.Status === "OnSite",
      hours,
    });
    byDay.set(key, day);
  }

  return {
    totalHours,
    onsiteNames,
    byDay: [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, day]) => ({
        date,
        hours: day.hours,
        names: [...day.names],
        count: day.count,
        people: day.people,
      })),
  };
}
