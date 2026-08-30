import { TABLES, list, create, escapeWhereValue } from "@/lib/nocodb";
import { generateUUID, nowISO } from "@/lib/auth";

/**
 * Finds a company by name, creating it when it does not exist. The name is
 * escaped before it reaches the query and the result is re-checked in memory,
 * so a name containing filter syntax can neither widen the match nor create a
 * duplicate row.
 */
export async function resolveOrCreateCompany(
  companyName: unknown,
  companyABN?: unknown
): Promise<number | null> {
  const name = String(companyName ?? "").trim();
  if (!name) return null;

  const existing = await list<Record<string, unknown>>(TABLES.Companies, {
    where: `(CompanyName,eq,${escapeWhereValue(name)})`,
    limit: 5,
    fields: "Id,CompanyName",
  });
  const match = existing.find(
    (c) => String(c.CompanyName ?? "").trim().toLowerCase() === name.toLowerCase()
  );
  if (match) return match.Id as number;

  const now = nowISO();
  return create(TABLES.Companies, {
    CompanyUUID: generateUUID(),
    CompanyName: name,
    ABN: companyABN ? String(companyABN).trim() : null,
    Status: "Active",
    CreatedAt1: now,
    UpdatedAt1: now,
  });
}
