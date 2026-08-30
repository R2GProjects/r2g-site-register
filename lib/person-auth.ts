import { TABLES, list, update, ensurePasscodeColumn, escapeWhereValue } from "@/lib/nocodb";
import {
  hashPasscode,
  hashToken,
  isLegacyPasscodeHash,
  normalizeMobile,
  nowISO,
  readWorkerSession,
  validatePasscode,
  verifyPasscode,
} from "@/lib/auth";
import type { Person } from "@/lib/types";

const PERSON_FIELDS =
  "Id,PersonUUID,FirstName,LastName,Email,Mobile,Company,JobRole,WorkerType,AccessEnabled,WhiteCardVerified,InductionStatus,InductionExpiry,Companies_id";
const PERSON_AUTH_FIELDS = `${PERSON_FIELDS},PasscodeHash`;

// Upper bound on the fallback scan below. Passcode sign-in is rate limited, so
// this runs at most a handful of times per minute per address.
const MOBILE_SCAN_LIMIT = 1000;

export async function findPersonByToken(accessToken: string): Promise<Person | null> {
  const hash = hashToken(accessToken);
  const persons = await list<Person>(TABLES.People, {
    where: `(AccessTokenHash,eq,${hash})`,
    limit: 1,
    fields: PERSON_FIELDS,
  });
  return persons[0] ?? null;
}

async function getPersonForAuth(id: number): Promise<Person | null> {
  const persons = await list<Person>(TABLES.People, {
    where: `(Id,eq,${id})`,
    limit: 1,
    fields: PERSON_AUTH_FIELDS,
  });
  return persons[0] ?? null;
}

/**
 * People whose mobile matches once both numbers are reduced to digits.
 * NocoDB stores whatever formatting the person typed and cannot normalise
 * inside a query, so an exact match is tried first and a bounded scan covers
 * the rest.
 */
async function findPeopleByMobile(mobile: string): Promise<Person[]> {
  const digits = normalizeMobile(mobile);
  if (digits.length < 6) return [];

  const exact = await list<Person>(TABLES.People, {
    where: `(Mobile,eq,${escapeWhereValue(mobile)})`,
    limit: 5,
    fields: PERSON_AUTH_FIELDS,
  });
  const exactMatches = exact.filter((p) => normalizeMobile(p.Mobile) === digits);
  // Only trust the fast path when it found someone who can actually sign in;
  // otherwise a duplicate record stored in another format would be missed.
  if (exactMatches.some((p) => p.PasscodeHash)) return exactMatches;

  const candidates = await list<Person>(TABLES.People, {
    limit: MOBILE_SCAN_LIMIT,
    fields: "Id,Mobile",
  });
  const ids = candidates
    .filter((p) => normalizeMobile(p.Mobile) === digits)
    .map((p) => p.Id);
  if (ids.length === 0) return [];

  const full = await Promise.all(ids.slice(0, 5).map(getPersonForAuth));
  return full.filter((p): p is Person => p !== null);
}

export interface ResolveInput {
  accessToken?: string;
  mobile?: string;
  passcode?: string;
}

export interface ResolveResult {
  person: Person | null;
  error?: string;
  status?: number;
}

export async function resolvePerson(input: ResolveInput): Promise<ResolveResult> {
  const token = input.accessToken?.trim() || "";
  const mobile = input.mobile?.trim() || "";
  const passcode = input.passcode?.trim() || "";

  if (token) {
    const person = await findPersonByToken(token);
    if (!person) {
      return { person: null, error: "Invalid access token", status: 401 };
    }
    // A passcode supplied alongside a valid token means "set this as my passcode".
    if (passcode) {
      const invalid = validatePasscode(passcode);
      if (invalid) return { person: null, error: invalid, status: 400 };
      if (!normalizeMobile(person.Mobile)) {
        return {
          person: null,
          error:
            "Add a mobile number to your profile before setting a passcode — the passcode is checked against your mobile.",
          status: 400,
        };
      }
      await savePersonPasscode(person.Id, passcode);
    }
    return { person };
  }

  if (!passcode || !mobile) {
    return {
      person: null,
      error: "Enter your mobile number and passcode, or your access token",
      status: 400,
    };
  }

  const candidates = await findPeopleByMobile(mobile);
  const withPasscode = candidates.filter((p) => p.PasscodeHash);
  if (withPasscode.length === 0) {
    return {
      person: null,
      error: "No passcode is set for that mobile number. Use your access token instead.",
      status: 401,
    };
  }

  const verified = withPasscode.filter((p) => verifyPasscode(passcode, p.PasscodeHash));
  if (verified.length !== 1) {
    return { person: null, error: "Invalid mobile number or passcode", status: 401 };
  }

  const person = verified[0];
  if (isLegacyPasscodeHash(person.PasscodeHash)) {
    await savePersonPasscode(person.Id, passcode);
  }
  return { person };
}

/**
 * Same as `resolvePerson`, but falls back to the worker session cookie when the
 * caller supplied no credentials — used by pages the worker reaches after
 * signing in, so the access token does not have to travel with every request.
 */
export async function resolvePersonFromRequest(
  request: Request,
  input: ResolveInput
): Promise<ResolveResult> {
  const hasCredentials = Boolean(
    input.accessToken?.trim() || (input.mobile?.trim() && input.passcode?.trim())
  );
  if (hasCredentials) return resolvePerson(input);

  const personId = readWorkerSession(request);
  if (personId) {
    const person = await getPersonForAuth(personId);
    if (person) return { person };
  }
  return resolvePerson(input);
}

export async function savePersonPasscode(personId: number, passcode: string): Promise<void> {
  await ensurePasscodeColumn();
  await update(TABLES.People, {
    Id: personId,
    PasscodeHash: hashPasscode(passcode),
    UpdatedAt1: nowISO(),
  });
}
