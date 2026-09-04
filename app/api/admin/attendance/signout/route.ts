import { NextResponse } from "next/server";
import { TABLES, update, create, getOne, numericId } from "@/lib/nocodb";
import { adminActor, validateAdminAuth, nowISO, getClientIP, generateUUID } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const attendanceId = numericId(body.attendanceId);
    if (!attendanceId) {
      return NextResponse.json({ error: "attendanceId required" }, { status: 400 });
    }

    const existing = await getOne<Record<string, unknown>>(TABLES.Attendance, attendanceId);
    if (!existing) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }
    if (existing.Status === "SignedOut") {
      return NextResponse.json({ error: "Already signed out" }, { status: 400 });
    }

    const now = nowISO();
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";

    await update(TABLES.Attendance, {
      Id: attendanceId,
      SignOutTime: now,
      SignOutIP: ip,
      SignOutUserAgent: ua,
      Status: "SignedOut",
      UpdatedAt1: now,
    });

    await create(TABLES.AuditLog, {
      AuditUUID: generateUUID(),
      EventType: "ManualSignOut",
      Person: String(existing.People_id || ""),
      Attendance: String(attendanceId),
      Site: String(existing.Sites_id || ""),
      PerformedBy: adminActor(request),
      Source: "AdminPanel",
      OldValue: JSON.stringify({ Status: existing.Status }),
      NewValue: JSON.stringify({ Status: "SignedOut", SignOutTime: now }),
      IPAddress: ip,
      UserAgent: ua,
      CreatedAt1: now,
    });

    return NextResponse.json({ ok: true, signedOutAt: now });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}