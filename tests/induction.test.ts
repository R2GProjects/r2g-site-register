import { describe, expect, it } from "vitest";
import {
  MAX_SIGNATURE_BYTES,
  isSignatureImage,
  rulesVersion,
} from "@/lib/induction";

/** A PNG data URL of a given decoded size, for the size-bound checks. */
const signatureOf = (bytes: number) =>
  `data:image/png;base64,${"A".repeat(Math.ceil(bytes / 3) * 4)}`;

describe("rulesVersion", () => {
  it("is stable for the same wording", () => {
    expect(rulesVersion("Hard hats at all times.")).toBe(
      rulesVersion("Hard hats at all times.")
    );
  });

  it("changes when the wording changes", () => {
    // The whole point: an induction signed against the old rules must be
    // distinguishable from one signed against the new.
    expect(rulesVersion("Hard hats at all times.")).not.toBe(
      rulesVersion("Hard hats and hi-vis at all times.")
    );
  });

  it("ignores line endings and surrounding whitespace", () => {
    const unix = rulesVersion("Rule one.\nRule two.");
    const windows = rulesVersion("  Rule one.\r\nRule two.\r\n  ");
    expect(unix).toBe(windows);
  });

  it("does not ignore whitespace inside the wording", () => {
    expect(rulesVersion("Rule one.\nRule two.")).not.toBe(
      rulesVersion("Rule one. Rule two.")
    );
  });

  it.each([null, undefined, "", "   "])(
    "marks %p as having no rules rather than hashing nothing",
    (value) => {
      expect(rulesVersion(value)).toBe("rules-none");
    }
  );

  it("is short enough to read in a table", () => {
    expect(rulesVersion("anything").length).toBeLessThanOrEqual(20);
  });

  it("keeps a hundred different rule sets apart", () => {
    // A version short enough to collide would quietly merge two different sets
    // of rules into one identifier, which is the failure that matters here.
    const versions = new Set(
      Array.from({ length: 100 }, (_, i) => rulesVersion(`Site rule set ${i}`))
    );
    expect(versions.size).toBe(100);
  });
});

describe("isSignatureImage", () => {
  it("accepts a plausible PNG data URL", () => {
    expect(isSignatureImage(signatureOf(2000))).toBe(true);
  });

  // These carry a payload of a plausible size, so they can only be rejected on
  // the media type itself rather than incidentally failing the size bound.
  const body = signatureOf(2000).split(",")[1];

  it.each([
    ["a JPEG", `data:image/jpeg;base64,${body}`],
    ["an SVG, which can carry script", `data:image/svg+xml;base64,${body}`],
    ["a GIF", `data:image/gif;base64,${body}`],
    ["text/html wearing a data URL", `data:text/html;base64,${body}`],
    ["a media type that merely ends in png", `data:image/x-png;base64,${body}`],
    ["a bare URL", "https://example.com/signature.png"],
    ["raw base64 with no prefix", body],
    ["an empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(isSignatureImage(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, []])("rejects the non-string %p", (value) => {
    expect(isSignatureImage(value)).toBe(false);
  });

  it("rejects something too small to be a drawing", () => {
    expect(isSignatureImage(signatureOf(20))).toBe(false);
  });

  it("rejects an image large enough to be an upload in disguise", () => {
    expect(isSignatureImage(signatureOf(MAX_SIGNATURE_BYTES + 5000))).toBe(false);
  });

  it("rejects base64 containing characters that are not base64", () => {
    expect(isSignatureImage(`data:image/png;base64,${"<".repeat(400)}`)).toBe(false);
  });
});
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
