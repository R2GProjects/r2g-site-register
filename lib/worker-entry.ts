/**
 * Where a worker's browser is allowed to sit after they have authenticated.
 * The access token may appear in a QR or a saved link; it must not stay in
 * the address bar once the session cookie exists.
 */

export const WORKER_DASHBOARD_PATH = "/w";
export const WORKER_TOKEN_STORAGE_KEY = "sr_worker_token";

export function tokenFromParam(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

/** QR and bookmark entry only. The page at this path must exchange and leave. */
export function workerTokenEntryPath(token: unknown): string {
  const value = tokenFromParam(token);
  if (!value) return WORKER_DASHBOARD_PATH;
  return `${WORKER_DASHBOARD_PATH}/${encodeURIComponent(value)}`;
}

export function workerPersonalQrUrl(origin: string, token: unknown): string {
  const path = workerTokenEntryPath(token);
  if (path === WORKER_DASHBOARD_PATH) return "";
  const base = origin.replace(/\/+$/, "");
  return `${base}${path}`;
}

/** After the cookie is set, always here — never /w/<token>. */
export function workerSessionPath(): string {
  return WORKER_DASHBOARD_PATH;
}

/**
 * Induction and other returns may still carry an old /w/<token> query.
 * Anything other than the session path is ignored.
 */
export function safeWorkerReturnPath(value: unknown): string {
  const path = String(value ?? "").trim();
  return path === WORKER_DASHBOARD_PATH ? path : WORKER_DASHBOARD_PATH;
}

export function inductionReturnQuery(): string {
  return new URLSearchParams({ return: WORKER_DASHBOARD_PATH }).toString();
}

export function rememberWorkerToken(
  token: unknown,
  storage: { setItem(key: string, value: string): void }
): void {
  const value = tokenFromParam(token);
  if (!value) return;
  storage.setItem(WORKER_TOKEN_STORAGE_KEY, value);
}

export function recalledWorkerToken(storage: {
  getItem(key: string): string | null;
}): string {
  return tokenFromParam(storage.getItem(WORKER_TOKEN_STORAGE_KEY));
}

/** Stash a token for the personal QR, then send the browser to /w. */
export function stashWorkerTokenAndDashboard(
  token: unknown,
  storage: { setItem(key: string, value: string): void }
): string {
  rememberWorkerToken(token, storage);
  return WORKER_DASHBOARD_PATH;
}
