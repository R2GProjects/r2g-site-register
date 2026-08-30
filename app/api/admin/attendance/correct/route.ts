import { NextResponse } from "next/server";
import { TABLES, update, create, getOne } from "@/lib/nocodb";
import { validateAdminAuth, nowISO, getClientIP, generateUUID } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { attendanceId, changes, reason } = await request.json();
    if (!attendanceId || !changes) {
      return NextResponse.json({ error: "attendanceId and changes required" }, { status: 400 });
    }

    const existing = await getOne<Record<string, unknown>>(TABLES.Attendance, attendanceId);
    if (!existing) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    const oldValue = JSON.stringify(existing);
    const newValue = JSON.stringify({ ...existing, ...changes });
    const now = nowISO();
    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";

    await update(TABLES.Attendance, {
      Id: attendanceId,
      ...changes,
      UpdatedAt1: now,
    });

    await create(TABLES.AuditLog, {
      AuditUUID: generateUUID(),
      EventType: "AttendanceCorrection",
      Person: String(existing.People_id || existing.Person || ""),
      Attendance: String(attendanceId),
      Site: String(existing.Sites_id || existing.Site || ""),
      PerformedBy: "admin",
      Source: "AdminPanel",
      OldValue: oldValue,
      NewValue: newValue,
      IPAddress: ip,
      UserAgent: ua,
      CreatedAt1: now,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}