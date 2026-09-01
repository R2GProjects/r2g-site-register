import { NextResponse } from "next/server";
import { runRetention } from "@/lib/retention";
import { authorizeCron } from "@/lib/cron-auth";
import { guard, MINUTE } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = guard(request, "cron-retention", {
    limit: 20,
    windowMs: 10 * MINUTE,
    message: "Too many retention requests. Wait a few minutes and try again.",
  });
  if (limit.blocked) return limit.blocked;

  const auth = await authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await runRetention({ dryRun });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
