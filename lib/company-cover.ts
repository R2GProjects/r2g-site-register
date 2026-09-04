/**
 * Public liability, workers compensation and contractor licence on a company.
 *
 * Dates are judged the same way as a white card: valid for the whole of the
 * expiry day, and an unreadable or missing date is not treated as lapsed.
 * Lapsed cover is flagged for admin; it does not block sign-in. Turning a
 * labourer away because their contractor's paperwork is incomplete is the
 * wrong way to fail.
 */

import {
  credentialWarnDays,
  expiryInstant,
  type CredentialStatus,
} from "@/lib/credentials";

const DAY_MS = 86_400_000;

export const COVER_KEYS = [
  "publicLiability",
  "workersComp",
  "contractorLicence",
] as const;

export type CoverKey = (typeof COVER_KEYS)[number];

export const COVER_LABEL: Record<CoverKey, string> = {
  publicLiability: "Public liability",
  workersComp: "Workers compensation",
  contractorLicence: "Contractor licence",
};

export interface CoverState {
  key: CoverKey;
  label: string;
  number: string | null;
  expiresAt: string | null;
  status: CredentialStatus;
  daysRemaining: number | null;
}

export interface CompanyCoverSource {
  PublicLiabilityNumber?: unknown;
  PublicLiabilityExpiry?: unknown;
  WorkersCompNumber?: unknown;
  WorkersCompExpiry?: unknown;
  ContractorLicenceNumber?: unknown;
  ContractorLicenceExpiry?: unknown;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function evaluate(
  key: CoverKey,
  number: unknown,
  expiry: unknown,
  now: number,
  warnDays: number
): CoverState {
  const num = stringOrNull(number);
  const expiresAtRaw = stringOrNull(expiry);
  const instant = expiryInstant(expiresAtRaw);
  const base = {
    key,
    label: COVER_LABEL[key],
    number: num,
    expiresAt: instant === null ? null : expiresAtRaw,
  };

  if (instant === null) {
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

export function evaluateCompanyCover(
  company: CompanyCoverSource | null,
  options?: { now?: number; warnDays?: number }
): CoverState[] {
  const now = options?.now ?? Date.now();
  const warnDays = options?.warnDays ?? credentialWarnDays();
  return [
    evaluate(
      "publicLiability",
      company?.PublicLiabilityNumber,
      company?.PublicLiabilityExpiry,
      now,
      warnDays
    ),
    evaluate(
      "workersComp",
      company?.WorkersCompNumber,
      company?.WorkersCompExpiry,
      now,
      warnDays
    ),
    evaluate(
      "contractorLicence",
      company?.ContractorLicenceNumber,
      company?.ContractorLicenceExpiry,
      now,
      warnDays
    ),
  ];
}

/** Recorded dates that have actually passed. Missing dates are not lapsed. */
export function lapsedCover(states: CoverState[]): CoverState[] {
  return states.filter((s) => s.status === "expired");
}

export function companyHasLapsedCover(
  company: CompanyCoverSource | null,
  options?: { now?: number; warnDays?: number }
): boolean {
  return lapsedCover(evaluateCompanyCover(company, options)).length > 0;
}
