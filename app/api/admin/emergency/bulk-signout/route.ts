import { NextResponse } from "next/server";
import { TABLES, list, update, create, numericId } from "@/lib/nocodb";
import { adminActor, validateAdminAuth, nowISO, getClientIP, generateUUID } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const siteId = numericId(body.siteId);

    let where = "(Status,eq,OnSite)";
    if (siteId) {
      where = `(${where}~and(Sites_id,eq,${siteId}))`;
    }

    const records = await list<Record<string, unknown>>(TABLES.Attendance, {
      where,
      fields: "Id,People_id,Sites_id,Status",
      limit: 500,
    });

    const now = nowISO();
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";
    let count = 0;

    for (const att of records) {
      await update(TABLES.Attendance, {
        Id: att.Id as number,
        SignOutTime: now,
        SignOutIP: ip,
        SignOutUserAgent: ua,
        Status: "EmergencyEvacuated",
        UpdatedAt1: now,
      });

      await create(TABLES.AuditLog, {
        AuditUUID: generateUUID(),
        EventType: "BulkEmergencySignOut",
        Person: String(att.People_id || ""),
        Attendance: String(att.Id),
        Site: String(att.Sites_id || ""),
        PerformedBy: adminActor(request),
        Source: "EmergencyBulkSignOut",
        OldValue: JSON.stringify({ Status: "OnSite" }),
        NewValue: JSON.stringify({ Status: "EmergencyEvacuated", SignOutTime: now }),
        IPAddress: ip,
        UserAgent: ua,
        CreatedAt1: now,
      });
      count++;
    }

    return NextResponse.json({ signedOut: count, time: now });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}