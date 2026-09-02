export const NOCODB_URL = process.env.NOCODB_URL || "http://localhost:3000";
export const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN || "";
export const BASE_ID = "pg67d4doqxz11yo";

export const TABLES = {
  Companies: "moxuqvsthsi1ucf",
  Sites: "mvt0iquxrhn7t20",
  People: "mvl5mxff6q8i5mc",
  Visitors: "m3ofa3jf4us0ul4",
  SiteAccess: "mta9vyhhdry1csn",
  Attendance: "mzpr63wt83e07wz",
  Inductions: "m9pe27usn0otvli",
  AuditLog: "muwbahmg5rb2njg",
} as const;

const BASE_URL = `${NOCODB_URL}/api/v2`;

function headers(): Record<string, string> {
  return {
    "xc-token": NOCODB_API_TOKEN,
    "Content-Type": "application/json",
  };
}

export function nocodbUrl(tableId: string): string {
  return `${BASE_URL}/tables/${tableId}/records`;
}

const columnsReady = new Map<string, Promise<void>>();

/**
 * Add columns if the table does not already have them.
 *
 * NocoDB answers an existing column with a 400 or 409, which is the expected
 * outcome on every call after the first and is not an error. The result is
 * cached per key so this costs one request per process rather than one per
 * sign-in, and a failure is swallowed: a schema call that did not land must not
 * take down the request that triggered it.
 */
async function ensureColumns(
  key: string,
  tableId: string,
  specs: Array<{ title: string; uidt: string }>
): Promise<void> {
  let pending = columnsReady.get(key);
  if (!pending) {
    pending = (async () => {
      for (const spec of specs) {
        const res = await fetch(
          `${NOCODB_URL}/api/v2/meta/tables/${tableId}/columns`,
          {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              column_name: spec.title,
              title: spec.title,
              uidt: spec.uidt,
            }),
          }
        );
        if (!res.ok && res.status !== 400 && res.status !== 409) {
          await res.text();
        }
      }
    })().catch(() => undefined);
    columnsReady.set(key, pending);
  }
  await pending;
}

export async function ensurePasscodeColumn(): Promise<void> {
  await ensureColumns("passcode", TABLES.People, [
    { title: "PasscodeHash", uidt: "SingleLineText" },
  ]);
}

/** Expiry dates and photographs for the tickets a worker needs to be on site. */
export async function ensureCredentialColumns(): Promise<void> {
  await ensureColumns("credentials", TABLES.People, [
    { title: "WhiteCardExpiry", uidt: "Date" },
    { title: "LicenceExpiry", uidt: "Date" },
  ]);
  // A separate cache key so a process that already created the date columns
  // still adds the image columns without waiting for a restart.
  await ensureColumns("credential-images", TABLES.People, [
    { title: "WhiteCardImage", uidt: "LongText" },
    { title: "LicenceImage", uidt: "LongText" },
  ]);
}

/**
 * A photograph of the person, for the muster point.
 *
 * The table already carries a `Photo` column that nothing has ever written, of
 * a type this code cannot confirm. A phone photo is tens to hundreds of
 * kilobytes of data URL, so writing it to a single-line or attachment column
 * would silently drop the one artefact the evacuation list needs. A column
 * created here is known to be long text.
 */
export async function ensurePersonPhotoColumn(): Promise<void> {
  await ensureColumns("person-photo", TABLES.People, [
    { title: "PersonPhoto", uidt: "LongText" },
  ]);
}

/**
 * The signature image and a copy of the rules it was signed against.
 *
 * The table already carries a `Signature` column that nothing has ever written,
 * of a type this code cannot confirm. A signature is tens of kilobytes of data
 * URL, so writing it to a single-line column would silently truncate the one
 * artefact the record exists to hold. Writing to columns created here means the
 * type is known to be long text whatever the table already had.
 */
export async function ensureInductionColumns(): Promise<void> {
  await ensureColumns("induction", TABLES.Inductions, [
    { title: "SignatureImage", uidt: "LongText" },
    { title: "RulesSnapshot", uidt: "LongText" },
  ]);
}

/** Marks a person or visitor whose identifying fields have been stripped. */
export async function ensureRetentionColumns(): Promise<void> {
  const spec = [{ title: "AnonymisedAt", uidt: "DateTime" }];
  await ensureColumns("retention-people", TABLES.People, spec);
  await ensureColumns("retention-visitors", TABLES.Visitors, spec);
}

/** Email for the site manager, and stamps so a reminder is not sent twice. */
export async function ensureNotifyColumns(): Promise<void> {
  await ensureColumns("notify-sites", TABLES.Sites, [
    { title: "SiteManagerEmail", uidt: "SingleLineText" },
    { title: "LastSummaryDate", uidt: "SingleLineText" },
  ]);
  await ensureColumns("notify-attendance", TABLES.Attendance, [
    { title: "SignOutRemindedAt", uidt: "DateTime" },
  ]);
}

/** When a person accepted the collection notice, and which wording. */
export async function ensurePrivacyColumns(table: "people" | "visitors"): Promise<void> {
  const spec = [
    { title: "PrivacyAcceptedAt", uidt: "DateTime" },
    { title: "PrivacyVersion", uidt: "SingleLineText" },
  ];
  await ensureColumns(
    `privacy-${table}`,
    table === "people" ? TABLES.People : TABLES.Visitors,
    spec
  );
}

export async function list<T>(
  tableId: string,
  params?: {
    where?: string;
    limit?: number;
    offset?: number;
    fields?: string;
    sort?: string;
  }
): Promise<T[]> {
  const url = new URL(nocodbUrl(tableId));
  if (params?.where) url.searchParams.set("where", params.where);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  if (params?.fields) url.searchParams.set("fields", params.fields);
  if (params?.sort) url.searchParams.set("sort", params.sort);

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    throw new Error(`NocoDB list failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.list as T[];
}

export async function listPage<T>(
  tableId: string,
  params?: { where?: string; limit?: number; offset?: number; fields?: string; sort?: string }
): Promise<{ list: T[]; totalRows: number }> {
  const url = new URL(nocodbUrl(tableId));
  if (params?.where) url.searchParams.set("where", params.where);
  if (params?.limit) url.searchParams.set("limit", String(params.limit ?? 25));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  if (params?.fields) url.searchParams.set("fields", params.fields);
  if (params?.sort) url.searchParams.set("sort", params.sort);

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    throw new Error(`NocoDB list failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { list: data.list as T[], totalRows: data.pageInfo.totalRows };
}

export async function getOne<T>(
  tableId: string,
  id: number
): Promise<T | null> {
  const results = await list<T>(tableId, {
    where: `(Id,eq,${id})`,
    limit: 1,
  });
  return results[0] ?? null;
}

export async function getOneWhere<T>(
  tableId: string,
  where: string
): Promise<T | null> {
  const results = await list<T>(tableId, { where, limit: 1 });
  return results[0] ?? null;
}

export async function findSiteByCode(
  code: string,
  fields = "Id,SiteUUID,SiteCode,SiteName,Status"
): Promise<Record<string, unknown> | null> {
  const needle = code.trim();
  if (!needle) return null;

  // Filtered in the query rather than scanning the table, which used to cap the
  // register at 200 sites and then fail with an unexplained "Site not found".
  // The comparison is case-sensitive in the database, so the case variants a
  // worker might type or paste are matched explicitly.
  const variants = [...new Set([needle.toUpperCase(), needle.toLowerCase(), needle])];
  const where = variants
    .map((v) => `(SiteCode,eq,${escapeWhereValue(v)})`)
    .join("~or");

  const matches = await list<Record<string, unknown>>(TABLES.Sites, {
    where,
    fields,
    limit: variants.length,
  });

  const lower = needle.toLowerCase();
  return (
    matches.find((s) => String(s.SiteCode || "").toLowerCase() === lower) ?? null
  );
}

export function linkedSiteId(record: Record<string, unknown>): number | null {
  const site = record.Site;
  if (site && typeof site === "object" && typeof (site as { Id?: unknown }).Id === "number") {
    return (site as { Id: number }).Id;
  }
  if (typeof record.Sites_id === "number") return record.Sites_id;
  return null;
}

export async function attachSiteDetails<T extends Record<string, unknown>>(
  records: T[]
): Promise<T[]> {
  const ids = [...new Set(records.map(linkedSiteId).filter((id): id is number => id != null))];
  if (ids.length === 0) return records;
  const sites = await list<Record<string, unknown>>(TABLES.Sites, {
    where: `(Id,in,${ids.join(",")})`,
    fields: "Id,SiteCode,SiteName,Address",
    limit: ids.length,
  });
  const map = new Map(sites.map(s => [s.Id as number, s]));
  return records.map(r => {
    const id = linkedSiteId(r);
    return { ...r, Site: (id && map.get(id)) || r.Site };
  });
}

function linkedId(record: Record<string, unknown>, objectKey: string, idKey: string): number | null {
  const obj = record[objectKey];
  if (obj && typeof obj === "object" && typeof (obj as { Id?: unknown }).Id === "number") {
    return (obj as { Id: number }).Id;
  }
  if (typeof record[idKey] === "number") return record[idKey] as number;
  return null;
}

export async function attachPersonDetails<T extends Record<string, unknown>>(
  records: T[],
  fields: string = "Id,FirstName,LastName"
): Promise<T[]> {
  const ids = [...new Set(records.map(r => linkedId(r, "Person", "People_id")).filter((id): id is number => id != null))];
  if (ids.length === 0) return records;
  const people = await list<Record<string, unknown>>(TABLES.People, {
    where: `(Id,in,${ids.join(",")})`,
    fields,
    limit: ids.length,
  });
  const map = new Map(people.map(p => [p.Id as number, p]));
  return records.map(r => {
    const id = linkedId(r, "Person", "People_id");
    return { ...r, Person: (id && map.get(id)) || r.Person };
  });
}

export async function attachVisitorDetails<T extends Record<string, unknown>>(
  records: T[]
): Promise<T[]> {
  const ids = [...new Set(records.map(r => linkedId(r, "Visitor", "Visitors_id")).filter((id): id is number => id != null))];
  if (ids.length === 0) return records;
  const visitors = await list<Record<string, unknown>>(TABLES.Visitors, {
    where: `(Id,in,${ids.join(",")})`,
    fields: "Id,FirstName,LastName,ReasonForVisit,PersonVisiting,Mobile,CompanyName,Email",
    limit: ids.length,
  });
  const map = new Map(visitors.map(v => [v.Id as number, v]));
  return records.map(r => {
    const id = linkedId(r, "Visitor", "Visitors_id");
    return { ...r, Visitor: (id && map.get(id)) || r.Visitor };
  });
}

function linkedCompanyId(record: Record<string, unknown>): number | null {
  return (
    linkedId(record, "Company", "Companies_id") ??
    (typeof record.Company === "number" ? numericId(record.Company) : null)
  );
}

export async function attachCompanyDetails<T extends Record<string, unknown>>(
  records: T[]
): Promise<T[]> {
  const ids = new Set<number>();
  for (const record of records) {
    const id = linkedCompanyId(record);
    if (id) ids.add(id);
    const person = record.Person;
    if (person && typeof person === "object") {
      const nested = linkedCompanyId(person as Record<string, unknown>);
      if (nested) ids.add(nested);
    }
  }
  if (ids.size === 0) return records;
  const companies = await list<Record<string, unknown>>(TABLES.Companies, {
    where: `(Id,in,${[...ids].join(",")})`,
    fields: "Id,CompanyName",
    limit: ids.size,
  });
  const map = new Map(companies.map((c) => [c.Id as number, c]));
  return records.map((record) => {
    const id = linkedCompanyId(record);
    let person = record.Person;
    if (person && typeof person === "object") {
      const nested = linkedCompanyId(person as Record<string, unknown>);
      if (nested && map.get(nested)) {
        person = { ...(person as Record<string, unknown>), Company: map.get(nested) };
      }
    }
    return { ...record, Person: person, Company: (id && map.get(id)) || record.Company };
  });
}

export async function create(
  tableId: string,
  record: Record<string, unknown>
): Promise<number> {
  const res = await fetch(nocodbUrl(tableId), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    throw new Error(`NocoDB create failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.Id as number;
}

export async function update(
  tableId: string,
  record: { Id: number } & Record<string, unknown>
): Promise<void> {
  const res = await fetch(nocodbUrl(tableId), {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    throw new Error(`NocoDB update failed: ${res.status} ${await res.text()}`);
  }
}

export async function remove(tableId: string, id: number): Promise<void> {
  const res = await fetch(nocodbUrl(tableId), {
    method: "DELETE",
    headers: headers(),
    body: JSON.stringify({ Id: id }),
  });
  if (!res.ok) {
    throw new Error(`NocoDB delete failed: ${res.status} ${await res.text()}`);
  }
}

// The NocoDB filter syntax is a flat string, so any value spliced into it can
// restructure the query. Everything below strips or rejects the characters that
// carry meaning in that grammar before a value reaches a `where` clause.
const WHERE_METACHARS = /[(),~]/g;

export function escapeWhereValue(value: unknown): string {
  return String(value ?? "").replace(WHERE_METACHARS, " ").trim();
}

export function escapeLikeValue(value: unknown): string {
  return escapeWhereValue(value).replace(/[%_]/g, "");
}

/** Positive integer or null — for row ids arriving as query params or JSON. */
export function numericId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function allowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  const candidate = String(value ?? "").trim();
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : null;
}

export function where(
  conditions: [string, string, string | number][]
): string {
  if (conditions.length === 0) return "";
  if (conditions.length === 1) {
    const [col, op, val] = conditions[0];
    return typeof val === "string"
      ? `(${col},${op},${val})`
      : `(${col},${op},${val})`;
  }
  return `(${conditions
    .map(([col, op, val]) =>
      typeof val === "string"
        ? `(${col},${op},${val})`
        : `(${col},${op},${val})`
    )
    .join("~and")})`;
}
