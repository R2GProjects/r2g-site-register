import { beforeAll, describe, expect, it } from "vitest";

// The module reads SESSION_SECRET at import time.
process.env.SESSION_SECRET = "test-secret-for-unit-tests-only";

let auth: typeof import("@/lib/auth");

beforeAll(async () => {
  auth = await import("@/lib/auth");
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(auth.safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings of the same length", () => {
    expect(auth.safeEqual("abc", "abd")).toBe(false);
  });

  it("returns false instead of throwing on a length mismatch", () => {
    // timingSafeEqual throws here, which used to turn a bad cookie into a 500.
    expect(() => auth.safeEqual("abc", "abcdef")).not.toThrow();
    expect(auth.safeEqual("abc", "abcdef")).toBe(false);
  });

  it.each([
    ["", ""],
    ["a", ""],
  ])("handles %p vs %p", (a, b) => {
    expect(typeof auth.safeEqual(a, b)).toBe("boolean");
  });
});

describe("passcode hashing", () => {
  it("verifies a correct passcode", () => {
    const hash = auth.hashPasscode("hunter2");
    expect(auth.verifyPasscode("hunter2", hash)).toBe(true);
  });

  it("rejects a wrong passcode", () => {
    expect(auth.verifyPasscode("wrong", auth.hashPasscode("hunter2"))).toBe(false);
  });

  it("salts, so the same passcode hashes differently each time", () => {
    expect(auth.hashPasscode("hunter2")).not.toBe(auth.hashPasscode("hunter2"));
  });

  it("normalises case and surrounding space", () => {
    const hash = auth.hashPasscode("Hunter2");
    expect(auth.verifyPasscode("  hunter2 ", hash)).toBe(true);
  });

  it("still accepts a legacy unsalted digest, so nobody needs a reset", () => {
    const legacy = auth.hashToken(auth.normalizePasscode("hunter2"));
    expect(auth.isLegacyPasscodeHash(legacy)).toBe(true);
    expect(auth.verifyPasscode("hunter2", legacy)).toBe(true);
  });

  it("does not mistake a salted digest for a legacy one", () => {
    expect(auth.isLegacyPasscodeHash(auth.hashPasscode("hunter2"))).toBe(false);
  });

  it.each([null, undefined, ""])("rejects verification against %p", (stored) => {
    expect(auth.verifyPasscode("hunter2", stored as string | null)).toBe(false);
  });
});

describe("admin session", () => {
  it("stores the person who signed in, not a shared admin label", () => {
    const token = auth.createSession("Sam Chen");
    expect(auth.verifyToken(token)?.u).toBe("Sam Chen");
  });
});

describe("admin password hashing", () => {
  it("is case-sensitive, unlike a worker passcode", () => {
    const hash = auth.hashAdminPassword("Secret99");
    expect(auth.verifyAdminPassword("Secret99", hash)).toBe(true);
    expect(auth.verifyAdminPassword("secret99", hash)).toBe(false);
  });
});

describe("visitor pass", () => {
  it("round-trips the visit it was issued for", () => {
    const token = auth.createVisitorPass(42, 987);
    expect(auth.readVisitorPass(token)).toEqual({
      visitorId: 42,
      attendanceId: 987,
    });
  });

  it("is safe to put in a URL path", () => {
    expect(auth.createVisitorPass(42, 987)).not.toMatch(/[+/=]/);
  });

  it("rejects a payload swapped under a valid signature", () => {
    const signature = auth.createVisitorPass(42, 987).split(".")[1];
    const forged = Buffer.from(
      JSON.stringify({ v: 43, a: 987, exp: Date.now() + 60_000 })
    ).toString("base64url");
    expect(auth.readVisitorPass(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects an altered signature", () => {
    const [payload, signature] = auth.createVisitorPass(42, 987).split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a");
    expect(auth.readVisitorPass(`${payload}.${flipped}`)).toBeNull();
  });

  it("rejects a truncated signature without throwing", () => {
    const [payload, signature] = auth.createVisitorPass(42, 987).split(".");
    expect(() => auth.readVisitorPass(`${payload}.${signature.slice(0, 8)}`)).not.toThrow();
    expect(auth.readVisitorPass(`${payload}.${signature.slice(0, 8)}`)).toBeNull();
  });

  it.each(["", "abc", "a.b", "!!!.###", null, undefined])(
    "rejects %p",
    (bad) => {
      expect(auth.readVisitorPass(bad as string)).toBeNull();
    }
  );
});
