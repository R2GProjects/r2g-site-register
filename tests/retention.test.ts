import { describe, expect, it } from "vitest";
import {
  latestInstant,
  personAnonymiseFields,
  planRetention,
  retentionCutoffMs,
  visitorAnonymiseFields,
} from "@/lib/retention";

const DAY = 86_400_000;
/** Midday UTC so no test sits on a day boundary by accident. */
const NOW = Date.parse("2026-09-02T12:00:00Z");
const YEARS = 7;
const CUTOFF = retentionCutoffMs(YEARS, NOW);

const iso = (ms: number) => new Date(ms).toISOString();

describe("retentionCutoffMs", () => {
  it("is seven 365-day years before now", () => {
    expect(CUTOFF).toBe(NOW - 7 * 365 * DAY);
  });

  it("moves when the period changes", () => {
    expect(retentionCutoffMs(10, NOW)).toBeLessThan(retentionCutoffMs(7, NOW));
  });
});

describe("latestInstant", () => {
  it("returns the most recent usable date", () => {
    expect(
      latestInstant(["2020-01-01T00:00:00Z", "2024-06-01T00:00:00Z", null])
    ).toBe(Date.parse("2024-06-01T00:00:00Z"));
  });

  it.each([
    [[], null],
    [[null, "", "not a date"], null],
  ])("returns null when nothing is usable: %j", (values, expected) => {
    expect(latestInstant(values)).toBe(expected);
  });
});

describe("planRetention", () => {
  const plan = (
    subject: Parameters<typeof planRetention>[0]
  ) => planRetention(subject, CUTOFF);

  it("anonymises once the last activity is on or before the cutoff", () => {
    const decision = plan({
      onSite: false,
      activityDates: [iso(CUTOFF)],
    });
    expect(decision).toEqual({ action: "anonymise", lastActivity: CUTOFF });
  });

  it("anonymises a record whose only date is an old created-at", () => {
    const created = CUTOFF - 100 * DAY;
    expect(
      plan({ onSite: false, activityDates: [iso(created)] })
    ).toEqual({ action: "anonymise", lastActivity: created });
  });

  it("keeps someone who signed in after the cutoff", () => {
    expect(
      plan({
        onSite: false,
        activityDates: [iso(CUTOFF - 400 * DAY), iso(CUTOFF + DAY)],
      })
    ).toEqual({ action: "skip", reason: "recent" });
  });

  it("never strips someone who is currently on site", () => {
    expect(
      plan({
        onSite: true,
        activityDates: [iso(CUTOFF - 400 * DAY)],
      })
    ).toEqual({ action: "skip", reason: "onsite" });
  });

  it("does not strip a record that has already been anonymised", () => {
    expect(
      plan({
        anonymisedAt: iso(NOW - DAY),
        onSite: false,
        activityDates: [iso(CUTOFF - 400 * DAY)],
      })
    ).toEqual({ action: "skip", reason: "already" });
  });

  it("does not strip when every date is missing or unreadable", () => {
    expect(
      plan({
        onSite: false,
        activityDates: [null, "", "sometime"],
      })
    ).toEqual({ action: "skip", reason: "unknown" });
  });

  it("is still inside the window one millisecond after the cutoff", () => {
    expect(
      plan({
        onSite: false,
        activityDates: [iso(CUTOFF + 1)],
      })
    ).toEqual({ action: "skip", reason: "recent" });
  });
});

describe("anonymise field sets", () => {
  const now = "2026-09-02T12:00:00Z";

  it("leaves a worker identifiable only by a generic label and their id", () => {
    const fields = personAnonymiseFields(42, now);
    expect(fields.FirstName).toBe("Former");
    expect(fields.LastName).toBe("Worker 42");
    expect(fields.Mobile).toBeNull();
    expect(fields.Email).toBeNull();
    expect(fields.EmergencyContactPhone).toBeNull();
    expect(fields.PasscodeHash).toBeNull();
    expect(fields.AccessTokenHash).toBeNull();
    expect(fields.Photo).toBeNull();
    expect(fields.PersonPhoto).toBeNull();
    expect(fields.WhiteCardImage).toBeNull();
    expect(fields.WhiteCardVerified).toBe(false);
    expect(fields.LicenceImage).toBeNull();
    expect(fields.AccessEnabled).toBe(false);
    expect(fields.AnonymisedAt).toBe(now);
  });

  it("does not touch attendance-shaped fields on the person", () => {
    // Hours live on Attendance, keyed by People_id. This payload must not
    // include a new Id or any attendance column.
    const keys = Object.keys(personAnonymiseFields(1, now));
    expect(keys).not.toContain("Id");
    expect(keys).not.toContain("SignInTime");
    expect(keys).not.toContain("Status");
  });

  it("leaves a visitor identifiable only by a generic label and their id", () => {
    const fields = visitorAnonymiseFields(9, now);
    expect(fields.FirstName).toBe("Former");
    expect(fields.LastName).toBe("Visitor 9");
    expect(fields.Mobile).toBeNull();
    expect(fields.PersonVisiting).toBeNull();
    expect(fields.AnonymisedAt).toBe(now);
  });
});
