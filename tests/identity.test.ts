import { describe, expect, it } from "vitest";
import { normalizeMobile } from "@/lib/auth";
import { normalizeEmail } from "@/lib/person-auth";

/**
 * Duplicate detection is only as good as the normalising underneath it. A
 * worker who typed "0412 345 678" on one visit and "+61 412 345 678" on the
 * next must resolve to the same person, or they get a second identity and their
 * hours split across both.
 */
describe("normalizeMobile", () => {
  const forms = [
    "0412345678",
    "0412 345 678",
    "0412-345-678",
    "(04) 1234 5678",
    " 0412345678 ",
  ];

  it("reduces every way a number gets typed to the same digits", () => {
    const normalised = new Set(forms.map(normalizeMobile));
    expect(normalised.size).toBe(1);
  });

  it("keeps genuinely different numbers apart", () => {
    expect(normalizeMobile("0412345678")).not.toBe(normalizeMobile("0412345679"));
  });

  it.each([null, undefined, "", "   "])("returns empty for %p", (bad) => {
    expect(normalizeMobile(bad as string)).toBe("");
  });

  it("strips non-digits rather than rejecting the value", () => {
    expect(normalizeMobile("0412-345-678")).toMatch(/^\d+$/);
  });
});

describe("normalizeEmail", () => {
  it("matches regardless of case or padding", () => {
    expect(normalizeEmail("  Sam@R2G.com.au ")).toBe("sam@r2g.com.au");
  });

  it("keeps different addresses apart", () => {
    expect(normalizeEmail("a@b.com")).not.toBe(normalizeEmail("a@c.com"));
  });

  it.each([null, undefined, ""])("returns empty for %p", (bad) => {
    expect(normalizeEmail(bad)).toBe("");
  });
});
