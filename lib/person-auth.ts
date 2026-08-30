import { TABLES, list, update, ensurePasscodeColumn } from "@/lib/nocodb";
import { hashPasscode, hashToken, nowISO, validatePasscode } from "@/lib/auth";
import type { Person } from "@/lib/types";

const PERSON_FIELDS =
  "Id,PersonUUID,FirstName,LastName,Email,Mobile,Company,JobRole,WorkerType,AccessEnabled,WhiteCardVerified,InductionStatus,InductionExpiry,Companies_id";

export async function findPersonByToken(accessToken: string): Promise<Person | null> {
  const hash = hashToken(accessToken);
  const persons = await list<Person>(TABLES.People, {
    where: `(AccessTokenHash,eq,${hash})`,
    limit: 1,
    fields: PERSON_FIELDS,
  });
  return persons[0] ?? null;
}

export async function findPersonByPasscode(passcode: string): Promise<Person | null> {
  await ensurePasscodeColumn();
  const hash = hashPasscode(passcode);
  const persons = await list<Person>(TABLES.People, {
    where: `(PasscodeHash,eq,${hash})`,
    limit: 1,
    fields: PERSON_FIELDS,
  });
  return persons[0] ?? null;
}

export async function resolvePerson(input: {
  accessToken?: string;
  passcode?: string;
}): Promise<{ person: Person | null; error?: string; status?: number }> {
  const token = input.accessToken?.trim() || "";
  const passcode = input.passcode?.trim() || "";

  if (!token && !passcode) {
    return { person: null, error: "Enter an access token or a passcode", status: 400 };
  }

  if (token && passcode) {
    const person = await findPersonByToken(token);
    if (!person) {
      return { person: null, error: "Invalid access token", status: 401 };
    }
    const invalid = validatePasscode(passcode);
    if (invalid) return { person: null, error: invalid, status: 400 };
    await savePersonPasscode(person.Id, passcode);
    return { person };
  }

  if (token) {
    const byToken = await findPersonByToken(token);
    if (byToken) return { person: byToken };
    const byPass = await findPersonByPasscode(token);
    if (byPass) return { person: byPass };
    return { person: null, error: "Invalid access token or passcode", status: 401 };
  }

  const person = await findPersonByPasscode(passcode);
  if (!person) {
    return { person: null, error: "Invalid passcode", status: 401 };
  }
  return { person };
}

export async function savePersonPasscode(personId: number, passcode: string): Promise<void> {
  await ensurePasscodeColumn();
  await update(TABLES.People, {
    Id: personId,
    PasscodeHash: hashPasscode(passcode),
    UpdatedAt1: nowISO(),
  });
}
