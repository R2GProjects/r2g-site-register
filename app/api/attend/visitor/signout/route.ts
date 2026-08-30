import { NextResponse } from "next/server";
import { TABLES, list, update } from "@/lib/nocodb";
import { getClientIP, nowISO } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { visitorId } = await request.json();
    if (!visitorId) {
      return NextResponse.json({ error: "Missing visitorId" }, { status: 400 });
    }

    const active = await list<Record<string, unknown>>(TABLES.Attendance, {
      where: `(Visitors_id,eq,${visitorId})~and(Status,eq,OnSite)`,
      limit: 1,
    });
    if (!active[0]) {
      return NextResponse.json({ error: "No active visitor attendance found" }, { status: 400 });
    }

    const ip = getClientIP(request);
    const ua = request.headers.get("user-agent") || "";
    const now = nowISO();

    await update(TABLES.Attendance, {
      Id: active[0].Id as number,
      SignOutTime: now,
      SignOutIP: ip,
      SignOutUserAgent: ua,
      Status: "SignedOut",
      UpdatedAt1: now,
    });

    return NextResponse.json({ signedOut: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}