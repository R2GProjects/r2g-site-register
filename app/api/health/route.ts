import { NextResponse } from "next/server";
import { NOCODB_URL } from "@/lib/nocodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${NOCODB_URL}/api/v1/meta/nocodb/info`, { signal: AbortSignal.timeout(5000) });
    const nc = res.ok ? await res.json() : {};
    return NextResponse.json({
      status: "ok",
      nocodb: nc.version,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: "degraded", time: new Date().toISOString() });
  }
}