import { describe, expect, it } from "vitest";
import { contentVersion } from "@/lib/content-version";
import {
  DEFAULT_RETENTION_YEARS,
  privacyAcceptance,
  privacySections,
  privacyText,
  privacyVersion,
  retentionYears,
} from "@/lib/privacy";

describe("contentVersion", () => {
  it("is stable for the same wording", () => {
    expect(contentVersion("privacy", "Hello.")).toBe(
      contentVersion("privacy", "Hello.")
    );
  });

  it("changes when the wording changes", () => {
    expect(contentVersion("privacy", "Hello.")).not.toBe(
      contentVersion("privacy", "Hello there.")
    );
  });

  it("uses the prefix so two documents cannot collide", () => {
    expect(contentVersion("privacy", "Hello.")).not.toBe(
      contentVersion("rules", "Hello.")
    );
    expect(contentVersion("privacy", "Hello.")).toMatch(/^privacy-/);
  });

  it("ignores line endings and surrounding whitespace", () => {
    expect(contentVersion("n", "A.\nB.")).toBe(
      contentVersion("n", "  A.\r\nB.\r\n  ")
    );
  });

  it.each([null, undefined, "", "   "])(
    "marks %p as having no text rather than hashing nothing",
    (value) => {
      expect(contentVersion("privacy", value)).toBe("privacy-none");
    }
  );
});

describe("retentionYears", () => {
  it("defaults when unset", () => {
    expect(retentionYears({})).toBe(DEFAULT_RETENTION_YEARS);
  });

  it("accepts a configured window", () => {
    expect(retentionYears({ DATA_RETENTION_YEARS: "10" })).toBe(10);
  });

  it.each(["0", "-1", "not a number", "", "31"])(
    "falls back to the default for %p rather than inventing a period",
    (value) => {
      expect(retentionYears({ DATA_RETENTION_YEARS: value })).toBe(
        DEFAULT_RETENTION_YEARS
      );
    }
  );
});

describe("privacy notice wording", () => {
  it("names what is collected, why, who sees it, how long, and how to ask", () => {
    const headings = privacySections({ years: 7, contact: "Sam" }).map(
      (s) => s.heading
    );
    expect(headings).toEqual([
      "What we collect",
      "Why we collect it",
      "Who can see it",
      "How long we keep it",
      "Your choices",
    ]);
  });

  it("puts the retention period in the notice itself", () => {
    expect(privacyText({ years: 10, contact: "the office" })).toContain(
      "10 years"
    );
    expect(privacyText({ years: 10, contact: "the office" })).not.toContain(
      "7 years"
    );
  });

  it("names a photograph among the things collected", () => {
    expect(privacyText({ years: 7, contact: "Sam" })).toMatch(/photograph/i);
  });

  it("names the contact in the choices section", () => {
    expect(privacyText({ years: 7, contact: "the office" })).toContain(
      "the office"
    );
  });
});

describe("privacyVersion", () => {
  it("is stable for the same wording", () => {
    expect(privacyVersion({ years: 7, contact: "Sam" })).toBe(
      privacyVersion({ years: 7, contact: "Sam" })
    );
  });

  it("changes when the retention period in the notice changes", () => {
    // Changing how long data is kept is a material change to what someone
    // agreed to, so acceptances against the old wording must stay distinct.
    expect(privacyVersion({ years: 7, contact: "Sam" })).not.toBe(
      privacyVersion({ years: 10, contact: "Sam" })
    );
  });

  it("changes when the contact in the notice changes", () => {
    expect(privacyVersion({ years: 7, contact: "Sam" })).not.toBe(
      privacyVersion({ years: 7, contact: "the office" })
    );
  });
});

describe("privacyAcceptance", () => {
  it("records the current version rather than a bare yes", () => {
    const at = "2026-09-02T00:00:00Z";
    const recorded = privacyAcceptance(at);
    expect(recorded.PrivacyAcceptedAt).toBe(at);
    expect(recorded.PrivacyVersion).toBe(privacyVersion());
    expect(recorded.PrivacyVersion).toMatch(/^privacy-/);
  });
});
