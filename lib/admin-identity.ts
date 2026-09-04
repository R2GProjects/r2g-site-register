/**
 * Named admin logins, so an audit entry can name a person rather than the
 * shared word "admin".
 *
 * The environment username and password remain a bootstrap account and are
 * never disabled from the screen. Table accounts can be switched off; a
 * disabled row does not fall through to the environment password.
 */

export const MIN_ADMIN_PASSWORD = 8;
export const MAX_ADMIN_PASSWORD = 64;

export type AdminLoginSource = "table" | "env" | "disabled" | "none";

export interface AdminAccount {
  username: string;
  displayName: string;
  active: boolean;
}

export function normalizeAdminUsername(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function validateAdminUsername(
  value: unknown
): { ok: true; username: string } | { ok: false; reason: "noUser" | "badUser" } {
  const username = normalizeAdminUsername(value);
  if (!username) return { ok: false, reason: "noUser" };
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
    return { ok: false, reason: "badUser" };
  }
  return { ok: true, username };
}

export function validateAdminDisplayName(value: unknown): string {
  const name = String(value ?? "").trim();
  return name.slice(0, 80);
}

export function validateAdminPassword(
  value: unknown
): { ok: true; password: string } | { ok: false; reason: "noPassword" | "short" | "long" } {
  const password = String(value ?? "").trim();
  if (!password) return { ok: false, reason: "noPassword" };
  if (password.length < MIN_ADMIN_PASSWORD) return { ok: false, reason: "short" };
  if (password.length > MAX_ADMIN_PASSWORD) return { ok: false, reason: "long" };
  return { ok: true, password };
}

/** Required is the boolean true, or the stored flag "1". Nothing else. */
export function isAdminActive(value: unknown): boolean {
  return value === true || value === "1";
}

export function adminActiveFlag(value: unknown): string {
  return isAdminActive(value) ? "1" : "";
}

/**
 * What to write on an audit row. A display name is preferred; the login name
 * is the fallback so a record is never anonymous.
 */
export function actorName(username: string, displayName?: unknown): string {
  const shown = String(displayName ?? "").trim();
  if (shown) return shown;
  const login = normalizeAdminUsername(username);
  return login || "admin";
}

/**
 * Which account a login attempt should be checked against.
 *
 * A table row for that username wins, even when it matches the environment
 * account — otherwise switching someone off would be undone by the bootstrap
 * password. No table row means the environment account, if the names match.
 */
export function adminLoginSource(
  username: unknown,
  accounts: AdminAccount[],
  envUser: unknown
): AdminLoginSource {
  const login = normalizeAdminUsername(username);
  if (!login) return "none";
  const row = accounts.find((account) => account.username === login);
  if (row) return row.active ? "table" : "disabled";
  const env = String(envUser ?? "").trim();
  if (env && login === normalizeAdminUsername(env)) return "env";
  return "none";
}
