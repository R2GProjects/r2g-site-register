/**
 * Roll attendance into the hours a person or a company actually worked.
 *
 * The daily register answers who was on site. A timesheet answers what to
 * pay or invoice: one row per person, one row per contractor, with the same
 * hoursLogged and site-local day the rest of the register already uses.
 */

import { dayKey, hoursLogged, personName } from "@/lib/attendance";

export const NO_COMPANY = "No company";

export type TimesheetKind = "person" | "visitor" | "unknown";

export interface TimesheetSubject {
  key: string;
  kind: TimesheetKind;
  name: string;
  personId: number | null;
  visitorId: number | null;
}

export interface TimesheetCompanyRef {
  key: string;
  name: string;
  companyId: number | null;
}

export interface TimesheetShift {
  day: string;
  siteName: string;
  siteCode: string;
  company: string;
  companyKey: string;
  inAt: string | null;
  outAt: string | null;
  hours: number;
  onSite: boolean;
  type: string;
  status: string;
}

export interface PersonTimesheet {
  key: string;
  kind: TimesheetKind;
  name: string;
  personId: number | null;
  visitorId: number | null;
  company: string;
  companyId: number | null;
  hours: number;
  days: number;
  openShifts: number;
  entries: number;
  shifts: TimesheetShift[];
}

export interface CompanyTimesheet {
  key: string;
  name: string;
  companyId: number | null;
  hours: number;
  people: number;
  days: number;
  openShifts: number;
  entries: number;
  persons: PersonTimesheet[];
}

export interface TimesheetReport {
  totalHours: number;
  openHours: number;
  openShifts: number;
  people: PersonTimesheet[];
  companies: CompanyTimesheet[];
}

function asId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    const id = (value as { Id?: unknown }).Id;
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

function companyNameOf(value: unknown): string {
  if (value && typeof value === "object") {
    const name = (value as { CompanyName?: unknown }).CompanyName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}

function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase();
}

export function timesheetSubject(
  record: Record<string, unknown>
): TimesheetSubject {
  const personId = asId(record.Person) ?? asId(record.People_id);
  if (personId) {
    return {
      key: `person:${personId}`,
      kind: "person",
      name: personName(record),
      personId,
      visitorId: null,
    };
  }
  const visitorId = asId(record.Visitor) ?? asId(record.Visitors_id);
  if (visitorId) {
    return {
      key: `visitor:${visitorId}`,
      kind: "visitor",
      name: personName(record),
      personId: null,
      visitorId,
    };
  }
  return {
    key: "unknown",
    kind: "unknown",
    name: personName(record),
    personId: null,
    visitorId: null,
  };
}

/**
 * Company on the attendance row first — that is who they were working for
 * that day. The person record is a fallback for older rows that never stored
 * one. A visitor's typed name is last, and stays a name until it matches a
 * known company.
 */
export function timesheetCompany(
  record: Record<string, unknown>
): TimesheetCompanyRef {
  const person = record.Person as Record<string, unknown> | undefined;
  const companyId =
    asId(record.Company) ??
    asId(record.Companies_id) ??
    asId(person?.Company) ??
    asId(person?.Companies_id);

  const objectName =
    companyNameOf(record.Company) || companyNameOf(person?.Company);

  const visitorName = String(
    (record.Visitor as { CompanyName?: unknown } | undefined)?.CompanyName ?? ""
  ).trim();

  if (companyId) {
    return {
      key: `company:${companyId}`,
      name: objectName || visitorName || `Company #${companyId}`,
      companyId,
    };
  }

  if (visitorName) {
    return {
      key: `name:${normalizeCompanyName(visitorName)}`,
      name: visitorName,
      companyId: null,
    };
  }

  return { key: "none", name: NO_COMPANY, companyId: null };
}

export function recordMatchesCompany(
  record: Record<string, unknown>,
  companyId: number,
  companyName?: string
): boolean {
  const ref = timesheetCompany(record);
  if (ref.companyId === companyId) return true;
  const want = String(companyName ?? "").trim().toLowerCase();
  return Boolean(want) && normalizeCompanyName(ref.name) === want;
}

function siteOf(record: Record<string, unknown>): {
  siteName: string;
  siteCode: string;
} {
  const site = record.Site as
    | { SiteName?: string; SiteCode?: string }
    | undefined;
  const siteName = String(site?.SiteName ?? "").trim();
  const siteCode = String(site?.SiteCode ?? "").trim();
  return {
    siteName: siteName || (record.Sites_id ? `Site #${record.Sites_id}` : ""),
    siteCode,
  };
}

function catalogCompanies(records: Array<Record<string, unknown>>): {
  byId: Map<number, string>;
  byName: Map<string, number>;
} {
  const byId = new Map<number, string>();
  const byName = new Map<string, number>();
  for (const record of records) {
    const ref = timesheetCompany(record);
    if (!ref.companyId) continue;
    const named = ref.name && !ref.name.startsWith("Company #") ? ref.name : "";
    const current = byId.get(ref.companyId);
    if (!current || (named && current.startsWith("Company #"))) {
      byId.set(ref.companyId, named || current || ref.name);
    }
    const label = byId.get(ref.companyId) || ref.name;
    byName.set(normalizeCompanyName(label), ref.companyId);
  }
  return { byId, byName };
}

/**
 * Fold a visitor-typed name into a known company row when the names match,
 * so one contractor invoice is not split across two buckets.
 */
function resolveCompany(
  ref: TimesheetCompanyRef,
  byId: Map<number, string>,
  byName: Map<string, number>
): TimesheetCompanyRef {
  if (ref.companyId) {
    return { ...ref, name: byId.get(ref.companyId) || ref.name };
  }
  if (ref.key.startsWith("name:")) {
    const id = byName.get(ref.key.slice(5));
    if (id) {
      return {
        key: `company:${id}`,
        name: byId.get(id) || ref.name,
        companyId: id,
      };
    }
  }
  return ref;
}

function majorityCompany(shifts: TimesheetShift[]): {
  company: string;
  companyId: number | null;
} {
  const totals = new Map<string, { hours: number; name: string }>();
  for (const shift of shifts) {
    const cur = totals.get(shift.companyKey) || {
      hours: 0,
      name: shift.company,
    };
    cur.hours += shift.hours;
    totals.set(shift.companyKey, cur);
  }
  const ranked = [...totals.entries()].sort((a, b) => {
    if (b[1].hours !== a[1].hours) return b[1].hours - a[1].hours;
    if (a[0] === "none") return 1;
    if (b[0] === "none") return -1;
    return a[1].name.localeCompare(b[1].name);
  });
  const [key, val] = ranked[0] || ["none", { name: NO_COMPANY, hours: 0 }];
  return {
    company: val.name,
    companyId: key.startsWith("company:") ? Number(key.slice(8)) : null,
  };
}

function finishPerson(
  person: Omit<PersonTimesheet, "days" | "company" | "companyId"> & {
    daySet: Set<string>;
  }
): PersonTimesheet {
  const { daySet, ...rest } = person;
  rest.shifts.sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      String(b.inAt ?? "").localeCompare(String(a.inAt ?? ""))
  );
  const majority = majorityCompany(rest.shifts);
  return { ...rest, days: daySet.size, ...majority };
}

export function buildTimesheets(
  records: Array<Record<string, unknown>>,
  now = Date.now()
): TimesheetReport {
  const { byId, byName } = catalogCompanies(records);

  const people = new Map<
    string,
    Omit<PersonTimesheet, "days" | "company" | "companyId"> & {
      daySet: Set<string>;
    }
  >();
  let totalHours = 0;
  let openHours = 0;
  let openShifts = 0;

  for (const record of records) {
    const day = dayKey(record.SignInTime);
    if (!day) continue;

    const hours = hoursLogged(record.SignInTime, record.SignOutTime, now);
    const subject = timesheetSubject(record);
    const company = resolveCompany(timesheetCompany(record), byId, byName);
    const onSite = record.Status === "OnSite";
    const site = siteOf(record);

    totalHours += hours;
    if (onSite) {
      openHours += hours;
      openShifts += 1;
    }

    const existing = people.get(subject.key) || {
      key: subject.key,
      kind: subject.kind,
      name: subject.name,
      personId: subject.personId,
      visitorId: subject.visitorId,
      hours: 0,
      openShifts: 0,
      entries: 0,
      shifts: [],
      daySet: new Set<string>(),
    };

    existing.hours += hours;
    existing.entries += 1;
    if (onSite) existing.openShifts += 1;
    existing.daySet.add(day);
    existing.shifts.push({
      day,
      siteName: site.siteName,
      siteCode: site.siteCode,
      company: company.name,
      companyKey: company.key,
      inAt: record.SignInTime ? String(record.SignInTime) : null,
      outAt: record.SignOutTime ? String(record.SignOutTime) : null,
      hours,
      onSite,
      type: String(record.AttendanceType || ""),
      status: String(record.Status || ""),
    });
    people.set(subject.key, existing);
  }

  const personList = [...people.values()]
    .map(finishPerson)
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));

  const companies = new Map<
    string,
    Omit<CompanyTimesheet, "days" | "people" | "persons"> & {
      daySet: Set<string>;
      personKeys: Set<string>;
    }
  >();

  for (const person of personList) {
    const byCompany = new Map<string, TimesheetShift[]>();
    for (const shift of person.shifts) {
      const list = byCompany.get(shift.companyKey) || [];
      list.push(shift);
      byCompany.set(shift.companyKey, list);
    }
    for (const [companyKey, shifts] of byCompany) {
      const first = shifts[0];
      const existing = companies.get(companyKey) || {
        key: companyKey,
        name: first.company,
        companyId: companyKey.startsWith("company:")
          ? Number(companyKey.slice(8))
          : null,
        hours: 0,
        openShifts: 0,
        entries: 0,
        daySet: new Set<string>(),
        personKeys: new Set<string>(),
      };
      for (const shift of shifts) {
        existing.hours += shift.hours;
        existing.entries += 1;
        if (shift.onSite) existing.openShifts += 1;
        existing.daySet.add(shift.day);
      }
      existing.personKeys.add(person.key);
      companies.set(companyKey, existing);
    }
  }

  const companyList: CompanyTimesheet[] = [...companies.values()]
    .map((company) => {
      const { daySet, personKeys, ...rest } = company;
      const persons = personList
        .map((person) => {
          const shifts = person.shifts.filter(
            (shift) => shift.companyKey === company.key
          );
          if (shifts.length === 0) return null;
          const hours = shifts.reduce((sum, shift) => sum + shift.hours, 0);
          const days = new Set(shifts.map((shift) => shift.day)).size;
          const open = shifts.filter((shift) => shift.onSite).length;
          return {
            ...person,
            company: company.name,
            companyId: company.companyId,
            hours,
            days,
            openShifts: open,
            entries: shifts.length,
            shifts,
          };
        })
        .filter((row): row is PersonTimesheet => row !== null);
      return {
        ...rest,
        days: daySet.size,
        people: personKeys.size,
        persons,
      };
    })
    .sort((a, b) => {
      if (a.key === "none") return 1;
      if (b.key === "none") return -1;
      return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
    });

  return {
    totalHours,
    openHours,
    openShifts,
    people: personList,
    companies: companyList,
  };
}

export function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export function hoursDecimal(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0.00";
  return (Math.round(hours * 100) / 100).toFixed(2);
}

export function timesheetPeopleCsv(people: PersonTimesheet[]): string {
  const header = csvRow([
    "Name",
    "Kind",
    "Company",
    "Days",
    "Shifts",
    "OpenShifts",
    "Hours",
  ]);
  const rows = people.map((person) =>
    csvRow([
      person.name,
      person.kind,
      person.company,
      person.days,
      person.entries,
      person.openShifts,
      hoursDecimal(person.hours),
    ])
  );
  return [header, ...rows].join("\n") + "\n";
}

export function timesheetCompaniesCsv(companies: CompanyTimesheet[]): string {
  const header = csvRow([
    "Company",
    "People",
    "Days",
    "Shifts",
    "OpenShifts",
    "Hours",
  ]);
  const rows = companies.map((company) =>
    csvRow([
      company.name,
      company.people,
      company.days,
      company.entries,
      company.openShifts,
      hoursDecimal(company.hours),
    ])
  );
  return [header, ...rows].join("\n") + "\n";
}

export function timesheetShiftsCsv(people: PersonTimesheet[]): string {
  const header = csvRow([
    "Name",
    "Kind",
    "Company",
    "Date",
    "SiteCode",
    "SiteName",
    "Type",
    "SignIn",
    "SignOut",
    "Hours",
    "Status",
  ]);
  const rows = people.flatMap((person) =>
    person.shifts.map((shift) =>
      csvRow([
        person.name,
        person.kind,
        shift.company,
        shift.day,
        shift.siteCode,
        shift.siteName,
        shift.type,
        shift.inAt || "",
        shift.outAt || "",
        hoursDecimal(shift.hours),
        shift.onSite ? "OnSite" : shift.status,
      ])
    )
  );
  return [header, ...rows].join("\n") + "\n";
}
