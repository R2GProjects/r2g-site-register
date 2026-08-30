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

let passcodeColumnReady: Promise<void> | null = null;

export async function ensurePasscodeColumn(): Promise<void> {
  if (!passcodeColumnReady) {
    passcodeColumnReady = (async () => {
      const res = await fetch(`${NOCODB_URL}/api/v2/meta/tables/${TABLES.People}/columns`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          column_name: "PasscodeHash",
          title: "PasscodeHash",
          uidt: "SingleLineText",
        }),
      });
      if (!res.ok && res.status !== 400 && res.status !== 409) {
        await res.text();
      }
    })().catch(() => undefined);
  }
  await passcodeColumnReady;
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
  const needle = code.trim().toLowerCase();
  if (!needle) return null;
  const sites = await list<Record<string, unknown>>(TABLES.Sites, {
    fields,
    limit: 200,
  });
  return (
    sites.find(
      (s) => String(s.SiteCode || "").toLowerCase() === needle
    ) ?? null
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