import { NextResponse } from "next/server";
import { TABLES, list, create, update, findSiteByCode } from "@/lib/nocodb";
import { hashToken, nowISO, generateUUID } from "@/lib/auth";
import type { Person } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { accessToken, siteCode, accepted } = await request.json();

    if (!accessToken || !siteCode) {
      return NextResponse.json({ error: "Missing accessToken or siteCode" }, { status: 400 });
    }

    const hash = hashToken(accessToken);
    const persons = await list<Person>(TABLES.People, {
      where: `(AccessTokenHash,eq,${hash})`,
      limit: 1,
      fields: "Id,PersonUUID,FirstName,LastName,InductionStatus",
    });
    if (!persons[0]) {
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }
    const person = persons[0];

    const site = await findSiteByCode(siteCode, "Id,SiteUUID,SiteName,SiteCode");
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const accessList = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${person.Id})~and(Sites_id,eq,${site.Id})`,
      limit: 1,
      fields: "Id,SiteAccessUUID,SiteInductionComplete,SiteInductionDate",
    });

    const now = nowISO();

    await create(TABLES.Inductions, {
      InductionUUID: generateUUID(),
      InductionType: "Site",
      InductionVersion: "v1",
      CompletedAt: now,
      Accepted: accepted ?? true,
      Status: "Complete",
      Person: person.Id,
      Site: site.Id,
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    if (accessList[0]) {
      const sa = accessList[0];
      await update(TABLES.SiteAccess, {
        Id: sa.Id as number,
        SiteInductionComplete: true,
        SiteInductionDate: now,
        UpdatedAt1: now,
      });
    }

    await update(TABLES.People, {
      Id: person.Id,
      InductionStatus: "Complete",
      InductionDate: now,
      UpdatedAt1: now,
    });

    return NextResponse.json({
      ok: true,
      inductionComplete: true,
      siteName: site.SiteName,
      completedAt: now,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}