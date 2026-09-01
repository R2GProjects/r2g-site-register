import { NextResponse } from "next/server";
import { runAutoClose } from "@/lib/auto-close";
import { safeEqual, validateAdminAuth } from "@/lib/auth";
import { guard, MINUTE } from "@/lib/rate-limit";

/** The scheduler sends the secret as a bearer token; an admin session also works. */
function presentedSecret(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (bearer) return bearer[1].trim();
  return (request.headers.get("x-cron-key") || "").trim();
}

async function authorize(
  request: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const configured = (process.env.CRON_SECRET || "").trim();
  const presented = presentedSecret(request);

  if (configured && presented && safeEqual(presented, configured)) {
    return { ok: true };
  }

  // Lets an admin run it by hand from a logged-in browser without the secret.
  if (!presented && (await validateAdminAuth(request))) {
    return { ok: true };
  }

  if (!configured) {
    return {
      ok: false,
      status: 503,
      error:
        "CRON_SECRET is not set, so this endpoint cannot be called by the scheduler. Set it in the environment, or sign in as an admin to run it manually.",
    };
  }
  return { ok: false, status: 401, error: "Unauthorized" };
}

export async function POST(request: Request) {
  const limit = guard(request, "cron-auto-close", {
    limit: 20,
    windowMs: 10 * MINUTE,
    message: "Too many auto-close requests. Wait a few minutes and try again.",
  });
  if (limit.blocked) return limit.blocked;

  const auth = await authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await runAutoClose({ dryRun });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
