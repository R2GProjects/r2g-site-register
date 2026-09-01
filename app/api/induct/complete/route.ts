import { NextResponse } from "next/server";
import { TABLES, list, create, update, findSiteByCode, ensureInductionColumns } from "@/lib/nocodb";
import { nowISO, generateUUID } from "@/lib/auth";
import { resolvePersonFromRequest } from "@/lib/person-auth";
import { guard, MINUTE } from "@/lib/rate-limit";
import {
  inductionExpiry,
  inductionValidityDays,
  isSignatureImage,
  rulesVersion,
} from "@/lib/induction";

export async function POST(request: Request) {
  try {
    const limit = guard(request, "induct-complete", {
      limit: 30,
      windowMs: 10 * MINUTE,
      message: "Too many attempts. Wait a few minutes and try again.",
    });
    if (limit.blocked) return limit.blocked;

    const { accessToken, mobile, passcode, siteCode, accepted, signature } =
      await request.json();

    if (!siteCode) {
      return NextResponse.json({ error: "Missing siteCode" }, { status: 400 });
    }
    if (!isSignatureImage(signature)) {
      return NextResponse.json(
        {
          error:
            "A signature is required to complete the induction. Sign in the box and try again.",
        },
        { status: 400 }
      );
    }

    // Identity is resolved the same way as every other worker route, so a
    // worker signed in with a mobile and passcode can induct too.
    const resolved = await resolvePersonFromRequest(request, {
      accessToken,
      mobile,
      passcode,
    });
    if (!resolved.person) {
      return NextResponse.json(
        { error: resolved.error || "Invalid access token" },
        { status: resolved.status || 401 }
      );
    }
    const person = resolved.person;

    const site = await findSiteByCode(
      siteCode,
      "Id,SiteUUID,SiteName,SiteCode,InductionRules"
    );
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const now = nowISO();
    const expiresAt = inductionExpiry(now, inductionValidityDays());

    await ensureInductionColumns();
    // The rules are copied in, not just referenced. A version that points at
    // text the site manager can edit afterwards proves nothing about what this
    // worker was actually shown, which is the whole point of the record.
    await create(TABLES.Inductions, {
      InductionUUID: generateUUID(),
      InductionType: "Site",
      InductionVersion: rulesVersion(site.InductionRules),
      RulesSnapshot: (site.InductionRules as string) || null,
      SignatureImage: signature,
      CompletedAt: now,
      ExpiresAt: expiresAt,
      Accepted: accepted ?? true,
      Status: "Complete",
      Person: person.Id,
      Site: site.Id,
      CreatedAt1: now,
      UpdatedAt1: now,
    });

    const accessList = await list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${person.Id})~and(Sites_id,eq,${site.Id})`,
      limit: 1,
      fields: "Id,SiteAccessUUID,SiteInductionComplete,SiteInductionDate",
    });

    if (accessList[0]) {
      await update(TABLES.SiteAccess, {
        Id: accessList[0].Id as number,
        SiteInductionComplete: true,
        SiteInductionDate: now,
        UpdatedAt1: now,
      });
    } else {
      // Sign-in gates on this row, so inducting before a first sign-in would
      // otherwise record the induction and still leave the worker blocked.
      await create(TABLES.SiteAccess, {
        SiteAccessUUID: generateUUID(),
        Site: site.Id,
        Person: person.Id,
        AccessStatus: "Approved",
        StartDate: now,
        SiteInductionComplete: true,
        SiteInductionDate: now,
        CreatedAt1: now,
        UpdatedAt1: now,
      });
    }

    await update(TABLES.People, {
      Id: person.Id,
      InductionStatus: "Complete",
      InductionDate: now,
      InductionExpiry: expiresAt,
      UpdatedAt1: now,
    });

    return NextResponse.json({
      ok: true,
      inductionComplete: true,
      siteName: site.SiteName,
      completedAt: now,
      expiresAt,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
