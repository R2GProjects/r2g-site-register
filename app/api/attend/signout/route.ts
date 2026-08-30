import { NextResponse } from "next/server";
import { TABLES, list, update } from "@/lib/nocodb";
import { getClientIP, nowISO } from "@/lib/auth";
import { resolvePersonFromRequest } from "@/lib/person-auth";
import { readWorkerSession } from "@/lib/auth";
import { guard, MINUTE } from "@/lib/rate-limit";
import type { Attendance } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { accessToken, mobile, passcode } = await request.json();

    const usingSession = !accessToken && !passcode && readWorkerSession(request) !== null;
    if (!usingSession) {
      const limit = guard(request, "attend-signout", {
        limit: 40,
        windowMs: 10 * MINUTE,
        message: "Too many attempts. Wait a few minutes and try again.",
      });
      if (limit.blocked) return limit.blocked;
    }

    const resolved = await resolvePersonFromRequest(request, { accessToken, mobile, passcode });
    if (!resolved.person) {
      return NextResponse.json({ error: resolved.error || "Invalid access token" }, { status: resolved.status || 401 });
    }
    const person = resolved.person;

    const active = await list<Attendance>(TABLES.Attendance, {
      where: `(People_id,eq,${person.Id})~and(Status,eq,OnSite)`,
      limit: 1,
    });
    if (!active[0]) {
      return NextResponse.json({ error: "Not currently signed in" }, { status: 400 });
    }

    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";
    const now = nowISO();

    await update(TABLES.Attendance, {
      Id: active[0].Id,
      SignOutTime: now,
      SignOutIP: ip,
      SignOutUserAgent: ua,
      Status: "SignedOut",
      UpdatedAt1: now,
    });

    return NextResponse.json({ signedOut: true, attendanceId: active[0].Id, signedOutAt: now });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}