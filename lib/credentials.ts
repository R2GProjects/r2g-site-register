const DAY_MS = 86_400_000;

export const DEFAULT_WARN_DAYS = 30;

/**
 * How far ahead a credential is flagged as expiring. Long enough that a worker
 * can book a renewal before it bites, short enough that the warning still means
 * something when they see it.
 */
export function credentialWarnDays(
  env: Record<string, string | undefined> = process.env
): number {
  const parsed = Number(env.CREDENTIAL_WARN_DAYS);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 365
    ? parsed
    : DEFAULT_WARN_DAYS;
}

export type CredentialKey = "whiteCard" | "licence";

export type CredentialStatus =
  /** Nothing on record at all. */
  | "missing"
  /** A number is recorded but no usable expiry, so it cannot be judged. */
  | "unverified"
  | "valid"
  | "expiring"
  | "expired";

export interface CredentialState {
  key: CredentialKey;
  /** What to call it when telling a person why they are being turned away. */
  label: string;
  number: string | null;
  expiresAt: string | null;
  status: CredentialStatus;
  /** Whole days until expiry; negative once past, null when not datable. */
  daysRemaining: number | null;
}

/**
 * The instant a credential stops being valid.
 *
 * A card printed with an expiry of 31 August is valid for the whole of that
 * day, so a date with no time is taken as the end of it. Dates are stored
 * without a timezone and a licence is not tied to any one site, so end of day
 * is resolved in UTC. In Australian time that leaves a card valid into the
 * morning after it lapses — the error runs in the worker's favour, which is the
 * right direction for a rule that stops someone earning.
 */
export function expiryInstant(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const endOfDay = new Date(`${raw}T23:59:59.999Z`).getTime();
    return Number.isNaN(endOfDay) ? null : endOfDay;
  }

  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * A named supervisor looked at the card photograph. Only the boolean true, or
 * the stored flag "1", counts. The string "true" does not — same rule as every
 * other tick in this app.
 *
 * This is not a check against SafeWork or any other issuer. There is no public
 * register this app can call.
 */
export function isWhiteCardVerified(value: unknown): boolean {
  return value === true || value === "1";
}

export function hasWhiteCardEvidence(source: {
  WhiteCardNumber?: unknown;
  WhiteCardImage?: unknown;
} | null): boolean {
  if (!source) return false;
  return (
    stringOrNull(source.WhiteCardNumber) !== null ||
    stringOrNull(source.WhiteCardImage) !== null
  );
}

/**
 * A number or photo is on file, and nobody has ticked that they looked at it.
 * Missing a card is not this problem — that is already the missing-ticket flag.
 * Unverified never blocks sign-in.
 */
export function whiteCardNeedsReview(
  source: {
    WhiteCardNumber?: unknown;
    WhiteCardImage?: unknown;
    WhiteCardVerified?: unknown;
  } | null
): boolean {
  if (!source) return false;
  return (
    hasWhiteCardEvidence(source) && !isWhiteCardVerified(source.WhiteCardVerified)
  );
}

/**
 * If the number or photograph changed, the previous tick was about a different
 * card. A tick in the same save is kept — the supervisor looked at the new one.
 * Omitting the tick keeps the previous value unless the evidence changed.
 */
export function nextWhiteCardVerified(input: {
  previousNumber?: unknown;
  nextNumber?: unknown;
  previousVerified?: unknown;
  imageChanged?: boolean;
  ticked?: unknown;
}): boolean {
  const evidenceChanged =
    stringOrNull(input.previousNumber) !== stringOrNull(input.nextNumber) ||
    input.imageChanged === true;
  if (input.ticked !== undefined) {
    return isWhiteCardVerified(input.ticked);
  }
  if (evidenceChanged) return false;
  return isWhiteCardVerified(input.previousVerified);
}

function evaluate(
  key: CredentialKey,
  label: string,
  number: unknown,
  expiry: unknown,
  now: number,
  warnDays: number
): CredentialState {
  const num = stringOrNull(number);
  const expiresAtRaw = stringOrNull(expiry);
  const instant = expiryInstant(expiresAtRaw);

  const base = {
    key,
    label,
    number: num,
    expiresAt: instant === null ? null : expiresAtRaw,
  };

  if (instant === null) {
    // An unreadable date is treated the same as none. Refusing entry on the
    // strength of data the app cannot parse is the wrong way to fail.
    return {
      ...base,
      status: num ? "unverified" : "missing",
      daysRemaining: null,
    };
  }

  const daysRemaining = Math.floor((instant - now) / DAY_MS);
  const status: CredentialStatus =
    instant <= now
      ? "expired"
      : instant - now <= warnDays * DAY_MS
        ? "expiring"
        : "valid";

  return { ...base, status, daysRemaining };
}

export interface CredentialSource {
  WhiteCardNumber?: unknown;
  WhiteCardExpiry?: unknown;
  WhiteCardImage?: unknown;
  WhiteCardVerified?: unknown;
  LicenceNumber?: unknown;
  LicenceType?: unknown;
  LicenceExpiry?: unknown;
}

/**
 * The state of every credential held against a person.
 *
 * A licence is only assessed when the worker actually holds one — plenty of
 * trades need no ticket beyond a white card, and inventing an expired licence
 * for them would block the wrong people.
 */
export function evaluateCredentials(
  person: CredentialSource | null,
  options?: { now?: number; warnDays?: number }
): CredentialState[] {
  const now = options?.now ?? Date.now();
  const warnDays = options?.warnDays ?? credentialWarnDays();

  const states: CredentialState[] = [
    evaluate(
      "whiteCard",
      "White card",
      person?.WhiteCardNumber,
      person?.WhiteCardExpiry,
      now,
      warnDays
    ),
  ];

  const licenceType = stringOrNull(person?.LicenceType);
  const hasLicence =
    stringOrNull(person?.LicenceNumber) !== null ||
    stringOrNull(person?.LicenceExpiry) !== null;

  if (hasLicence) {
    states.push(
      evaluate(
        "licence",
        licenceType ? `${licenceType} licence` : "Licence",
        person?.LicenceNumber,
        person?.LicenceExpiry,
        now,
        warnDays
      )
    );
  }

  return states;
}

/**
 * Credentials that should stop a sign-in.
 *
 * Only a recorded date that has actually passed blocks. Missing and unreadable
 * data are surfaced to an administrator instead, because nearly every existing
 * worker has no expiry on record and turning them all away would be a fault of
 * the rollout rather than of their tickets.
 */
export function blockingCredentials(
  states: CredentialState[]
): CredentialState[] {
  return states.filter((s) => s.status === "expired");
}

/** One sentence naming what lapsed and when, for the person being refused. */
export function blockedMessage(blocking: CredentialState[]): string {
  if (blocking.length === 0) return "";
  const names = blocking.map((c) => {
    const on = c.expiresAt ? ` (expired ${c.expiresAt})` : "";
    return `${c.label.toLowerCase()}${on}`;
  });
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Your ${list} has expired. See the site supervisor to update it before signing in.`;
}
