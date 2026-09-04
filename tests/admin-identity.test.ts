import { describe, expect, it } from "vitest";
import {
  actorName,
  adminActiveFlag,
  adminLoginSource,
  isAdminActive,
  normalizeAdminUsername,
  validateAdminPassword,
  validateAdminUsername,
} from "@/lib/admin-identity";

const accounts = [
  { username: "sam", displayName: "Sam", active: true },
  { username: "pat", displayName: "Pat", active: false },
];

describe("normalizeAdminUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeAdminUsername("  Sam ")).toBe("sam");
  });

  it("is empty when nothing is typed", () => {
    expect(normalizeAdminUsername("  ")).toBe("");
  });
});

describe("validateAdminUsername", () => {
  it("accepts a plain login name", () => {
    expect(validateAdminUsername("Sam.site")).toEqual({
      ok: true,
      username: "sam.site",
    });
  });

  it("refuses an empty name", () => {
    expect(validateAdminUsername("  ")).toEqual({ ok: false, reason: "noUser" });
  });

  it.each(["a", "has space", "UPPER/slash", "x".repeat(40)])(
    "refuses %p",
    (value) => {
      expect(validateAdminUsername(value)).toEqual({
        ok: false,
        reason: "badUser",
      });
    }
  );
});

describe("validateAdminPassword", () => {
  it("accepts eight or more characters", () => {
    expect(validateAdminPassword("abcdefgh")).toEqual({
      ok: true,
      password: "abcdefgh",
    });
  });

  it("refuses a short password", () => {
    expect(validateAdminPassword("short")).toEqual({
      ok: false,
      reason: "short",
    });
  });
});

describe("isAdminActive", () => {
  it("treats only true or stored 1 as active", () => {
    expect(isAdminActive(true)).toBe(true);
    expect(isAdminActive("1")).toBe(true);
    expect(isAdminActive("true")).toBe(false);
    expect(isAdminActive("")).toBe(false);
    expect(adminActiveFlag(true)).toBe("1");
    expect(adminActiveFlag(false)).toBe("");
  });
});

describe("actorName", () => {
  it("prefers a display name so the audit log reads as a person", () => {
    expect(actorName("sam", "Sam Chen")).toBe("Sam Chen");
  });

  it("falls back to the login name rather than the word admin", () => {
    expect(actorName("sam", "  ")).toBe("sam");
  });
});

describe("adminLoginSource", () => {
  it("uses a live table account when one exists", () => {
    expect(adminLoginSource("SAM", accounts, "admin")).toBe("table");
  });

  it("does not fall through to the environment password when the row is off", () => {
    expect(adminLoginSource("pat", accounts, "pat")).toBe("disabled");
  });

  it("uses the environment account when no table row exists", () => {
    expect(adminLoginSource("admin", accounts, "admin")).toBe("env");
  });

  it("is none when neither the table nor the environment matches", () => {
    expect(adminLoginSource("other", accounts, "admin")).toBe("none");
  });
});
