import { NextResponse } from "next/server";
import {
  TABLES,
  listPage,
  getOne,
  attachSiteDetails,
  attachPersonDetails,
  ensureInductionColumns,
  numericId,
} from "@/lib/nocodb";
import { validateAdminAuth } from "@/lib/auth";
import { dayBoundaryISO } from "@/lib/attendance";

/**
 * The signed induction records, newest first.
 *
 * Signatures and rules snapshots are deliberately left out of the list — they
 * are large, and a page of fifty would be megabytes for a table that only shows
 * names and dates. One record is fetched in full by id when someone opens it.
 */
export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = numericId(searchParams.get("id"));

    await ensureInductionColumns();

    if (id) {
      const record = await getOne<Record<string, unknown>>(TABLES.Inductions, id);
      if (!record) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const [withSite] = await attachSiteDetails([record]);
      const [full] = await attachPersonDetails([withSite]);
      return NextResponse.json(full);
    }

    const siteId = numericId(searchParams.get("siteId"));
    const personId = numericId(searchParams.get("personId"));
    const from = dayBoundaryISO(searchParams.get("from"), "start");
    const to = dayBoundaryISO(searchParams.get("to"), "end");
    const page = Math.max(0, parseInt(searchParams.get("page") || "0") || 0);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50") || 50)
    );

    const conditions: string[] = [];
    if (siteId) conditions.push(`(Sites_id,eq,${siteId})`);
    if (personId) conditions.push(`(People_id,eq,${personId})`);
    if (from) conditions.push(`(CompletedAt,gte,${from})`);
    if (to) conditions.push(`(CompletedAt,lte,${to})`);

    const where =
      conditions.length === 0
        ? ""
        : conditions.length === 1
          ? conditions[0]
          : `(${conditions.join("~and")})`;

    const result = await listPage<Record<string, unknown>>(TABLES.Inductions, {
      where,
      limit,
      offset: page * limit,
      sort: "-CompletedAt",
      fields:
        "Id,InductionUUID,InductionType,InductionVersion,CompletedAt,ExpiresAt,Accepted,Status,Site,Person,Sites_id,People_id",
    });

    const withSites = await attachSiteDetails(result.list);
    const rows = await attachPersonDetails(withSites);

    return NextResponse.json({ ...result, list: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
