import { safeEqual, validateAdminAuth } from "@/lib/auth";

function presentedSecret(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (bearer) return bearer[1].trim();
  return (request.headers.get("x-cron-key") || "").trim();
}

/**
 * The scheduler sends CRON_SECRET as a bearer token. A signed-in admin can
 * also run a job by hand, so a forgotten secret does not leave the work
 * unreachable.
 */
export async function authorizeCron(
  request: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const configured = (process.env.CRON_SECRET || "").trim();
  const presented = presentedSecret(request);

  if (configured && presented && safeEqual(presented, configured)) {
    return { ok: true };
  }

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
