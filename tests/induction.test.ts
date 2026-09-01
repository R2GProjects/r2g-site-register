import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALIDITY_DAYS,
  inductionExpiry,
  inductionState,
  inductionValidityDays,
} from "@/lib/induction";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-01T00:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

describe("inductionValidityDays", () => {
  it("defaults to a year", () => {
    expect(inductionValidityDays({})).toBe(DEFAULT_VALIDITY_DAYS);
  });

  it("reads a configured value", () => {
    expect(inductionValidityDays({ INDUCTION_VALIDITY_DAYS: "90" })).toBe(90);
  });

  it.each(["0", "-1", "abc", "", "99999"])(
    "falls back to the default for %p",
    (bad) => {
      expect(inductionValidityDays({ INDUCTION_VALIDITY_DAYS: bad })).toBe(
        DEFAULT_VALIDITY_DAYS
      );
    }
  );
});

describe("inductionExpiry", () => {
  it("adds the validity window to the completion date", () => {
    expect(inductionExpiry("2026-01-01T00:00:00Z", 365)).toBe(
      "2027-01-01T00:00:00Z"
    );
  });

  it("emits second-precision ISO instants", () => {
    expect(inductionExpiry("2026-01-01T00:00:00.123Z", 30)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
    );
  });

  it.each([null, undefined, "", "not-a-date"])("returns null for %p", (bad) => {
    expect(inductionExpiry(bad, 365)).toBeNull();
  });
});

describe("inductionState", () => {
  const options = { requiresInduction: true, validityDays: 365, now: NOW };

  it("requires an induction that was never done", () => {
    const state = inductionState({ SiteInductionComplete: false }, options);
    expect(state.complete).toBe(false);
    expect(state.required).toBe(true);
    expect(state.expired).toBe(false);
  });

  it("accepts a recent induction", () => {
    const state = inductionState(
      { SiteInductionComplete: true, SiteInductionDate: daysAgo(30) },
      options
    );
    expect(state.expired).toBe(false);
    expect(state.required).toBe(false);
  });

  it("requires a re-run once the induction has lapsed", () => {
    const state = inductionState(
      { SiteInductionComplete: true, SiteInductionDate: daysAgo(400) },
      options
    );
    expect(state.complete).toBe(true);
    expect(state.expired).toBe(true);
    expect(state.required).toBe(true);
  });

  it("treats the day before expiry as valid and the day after as lapsed", () => {
    const almost = inductionState(
      { SiteInductionComplete: true, SiteInductionDate: daysAgo(364) },
      options
    );
    const just = inductionState(
      { SiteInductionComplete: true, SiteInductionDate: daysAgo(366) },
      options
    );
    expect(almost.expired).toBe(false);
    expect(just.expired).toBe(true);
  });

  it("ages a legacy record from when access was granted, since it has no induction date", () => {
    const state = inductionState(
      { SiteInductionComplete: true, CreatedAt1: daysAgo(400) },
      options
    );
    expect(state.expired).toBe(true);
    expect(state.required).toBe(true);
  });

  it("prefers the induction date over the access creation date", () => {
    const state = inductionState(
      {
        SiteInductionComplete: true,
        SiteInductionDate: daysAgo(10),
        CreatedAt1: daysAgo(900),
      },
      options
    );
    expect(state.expired).toBe(false);
  });

  it("does not refuse entry when there is no usable date at all", () => {
    // Failing closed here would lock out workers over missing data rather than
    // over anything actually wrong with their induction.
    const state = inductionState({ SiteInductionComplete: true }, options);
    expect(state.expired).toBe(false);
    expect(state.required).toBe(false);
    expect(state.expiresAt).toBeNull();
  });

  it("never blocks a site that does not require an induction", () => {
    const state = inductionState(
      { SiteInductionComplete: false },
      { ...options, requiresInduction: false }
    );
    expect(state.required).toBe(false);
  });

  it("still reports a lapsed induction on a site that does not require one", () => {
    const state = inductionState(
      { SiteInductionComplete: true, SiteInductionDate: daysAgo(400) },
      { ...options, requiresInduction: false }
    );
    expect(state.expired).toBe(true);
    expect(state.required).toBe(false);
  });

  it("handles a missing access record", () => {
    const state = inductionState(null, options);
    expect(state.complete).toBe(false);
    expect(state.required).toBe(true);
  });

  it("reports when the induction lapses so it can be shown in advance", () => {
    const state = inductionState(
      { SiteInductionComplete: true, SiteInductionDate: "2026-01-01T00:00:00Z" },
      options
    );
    expect(state.expiresAt).toBe("2027-01-01T00:00:00Z");
  });
});
