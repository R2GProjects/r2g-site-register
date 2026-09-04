/**
 * Site access is an explicit admin decision. Registering, inducting, or
 * standing at the gate must not flip a row to Approved.
 */

export const SITE_ACCESS_STATUSES = [
  "Pending",
  "Approved",
  "Denied",
  "Revoked",
  "Expired",
] as const;

export type SiteAccessStatus = (typeof SITE_ACCESS_STATUSES)[number];

export type SignInBlockedReason =
  | "pending"
  | "denied"
  | "revoked"
  | "expired"
  | "missing";

export type SignInAccess =
  | { ok: true }
  | { ok: false; reason: SignInBlockedReason };

export function siteAccessStatus(value: unknown): SiteAccessStatus | null {
  const status = String(value ?? "").trim();
  return (SITE_ACCESS_STATUSES as readonly string[]).includes(status)
    ? (status as SiteAccessStatus)
    : null;
}

/** Only an Approved row lets someone sign in. Anything else is a refusal. */
export function signInAccess(status: unknown): SignInAccess {
  const resolved = siteAccessStatus(status);
  if (!resolved) return { ok: false, reason: "missing" };
  if (resolved === "Approved") return { ok: true };
  if (resolved === "Pending") return { ok: false, reason: "pending" };
  if (resolved === "Denied") return { ok: false, reason: "denied" };
  if (resolved === "Revoked") return { ok: false, reason: "revoked" };
  return { ok: false, reason: "expired" };
}

export function siteAccessBlockedMessage(reason: SignInBlockedReason): string {
  if (reason === "denied") {
    return "Site access has been denied. See the site supervisor.";
  }
  if (reason === "revoked") {
    return "Site access has been revoked. See the site supervisor.";
  }
  if (reason === "expired") {
    return "Site access has expired. See the site supervisor.";
  }
  return "Site access is waiting for admin approval. See the site supervisor.";
}

/** Pending and a missing row are the same queue — both still need an admin. */
export function isAccessQueueReason(reason: SignInBlockedReason): boolean {
  return reason === "pending" || reason === "missing";
}

export function siteAccessBlockedPayload(reason: SignInBlockedReason) {
  return {
    error: siteAccessBlockedMessage(reason),
    accessPending: isAccessQueueReason(reason),
    accessStatus: reason,
  };
}

export function pendingApprovalNote(): string {
  return "Registration complete. Site access is waiting for admin approval — you cannot sign in until a supervisor approves you.";
}
