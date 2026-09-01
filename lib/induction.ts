const DAY_MS = 86_400_000;

export const DEFAULT_VALIDITY_DAYS = 365;

/**
 * How long a site induction stays valid. Site inductions are normally re-run
 * when site conditions change, and annually at minimum.
 */
export function inductionValidityDays(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = Number(env.INDUCTION_VALIDITY_DAYS);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 3650
    ? parsed
    : DEFAULT_VALIDITY_DAYS;
}

function toISO(instant: number): string {
  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** When an induction completed at this instant lapses. */
export function inductionExpiry(
  completedAt: unknown,
  validityDays: number
): string | null {
  if (!completedAt) return null;
  const completed = new Date(String(completedAt)).getTime();
  if (Number.isNaN(completed)) return null;
  return toISO(completed + validityDays * DAY_MS);
}

export interface InductionState {
  /** The worker has an induction on record for this site. */
  complete: boolean;
  /** It is on record but has lapsed. */
  expired: boolean;
  /** Null when there is no usable date to measure from. */
  expiresAt: string | null;
  /** Whether sign-in should be blocked and the induction re-run. */
  required: boolean;
}

/**
 * Whether a worker's induction for a site still stands.
 *
 * Records created before expiry tracking have no SiteInductionDate, so the
 * access row's creation date is used instead. Grandfathering those forever
 * would leave inductions that can never lapse; blocking them outright would
 * lock out every existing worker the day this ships. Falling back to when the
 * access was granted ages them honestly without a mass lockout. If neither date
 * is usable the induction is treated as standing, because refusing entry on the
 * strength of missing data is the wrong way to fail.
 */
export function inductionState(
  access: {
    SiteInductionComplete?: unknown;
    SiteInductionDate?: unknown;
    CreatedAt1?: unknown;
  } | null,
  options: { requiresInduction: boolean; validityDays: number; now?: number }
): InductionState {
  const { requiresInduction, validityDays } = options;
  const now = options.now ?? Date.now();

  const complete = Boolean(access?.SiteInductionComplete);
  if (!complete) {
    return {
      complete: false,
      expired: false,
      expiresAt: null,
      required: requiresInduction,
    };
  }

  const from = access?.SiteInductionDate || access?.CreatedAt1;
  const expiresAt = inductionExpiry(from, validityDays);
  const expired = expiresAt !== null && new Date(expiresAt).getTime() <= now;

  return {
    complete: true,
    expired,
    expiresAt,
    required: requiresInduction && expired,
  };
}
