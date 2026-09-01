import { NextResponse } from "next/server";
import { TABLES, getOne, update } from "@/lib/nocodb";
import { getClientIP, nowISO, readVisitorPass } from "@/lib/auth";
import { guard, MINUTE } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limit = guard(request, "visitor-signout", {
      limit: 40,
      windowMs: 10 * MINUTE,
      message: "Too many attempts. Wait a few minutes and try again.",
    });
    if (limit.blocked) return limit.blocked;

    const { token } = await request.json();
    const pass = readVisitorPass(token);
    if (!pass) {
      return NextResponse.json(
        { error: "This sign-out link is not valid or has expired." },
        { status: 401 }
      );
    }

    const record = await getOne<Record<string, unknown>>(
      TABLES.Attendance,
      pass.attendanceId
    );
    if (!record || Number(record.Visitors_id) !== pass.visitorId) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }
    if (record.Status !== "OnSite") {
      return NextResponse.json(
        { error: "You are already signed out.", alreadySignedOut: true },
        { status: 409 }
      );
    }

    const now = nowISO();
    await update(TABLES.Attendance, {
      Id: pass.attendanceId,
      SignOutTime: now,
      SignOutIP: getClientIP(request),
      SignOutUserAgent: request.headers.get("user-agent") || "",
      Status: "SignedOut",
      UpdatedAt1: now,
    });

    return NextResponse.json({ signedOut: true, signedOutAt: now });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
