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

export function dayKey(iso: unknown, timeZone = "Australia/Sydney"): string {
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
