import { describe, expect, it } from "vitest";
import {
  allowedValue,
  escapeLikeValue,
  escapeWhereValue,
  numericId,
} from "@/lib/nocodb";

describe("escapeWhereValue", () => {
  it("leaves an ordinary value alone", () => {
    expect(escapeWhereValue("Acme Pty Ltd")).toBe("Acme Pty Ltd");
  });

  it.each(["(", ")", ",", "~"])(
    "strips the filter metacharacter %p",
    (char) => {
      expect(escapeWhereValue(`a${char}b`)).not.toContain(char);
    }
  );

  it("neutralises an attempt to close the clause and add another", () => {
    const escaped = escapeWhereValue("x)~or(AccessEnabled,eq,true");
    expect(escaped).not.toMatch(/[(),~]/);
  });

  it.each([null, undefined])("renders %p as empty", (value) => {
    expect(escapeWhereValue(value)).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(escapeWhereValue("  padded  ")).toBe("padded");
  });
});

describe("escapeLikeValue", () => {
  it("removes wildcards so a search cannot match everything", () => {
    expect(escapeLikeValue("%")).toBe("");
    expect(escapeLikeValue("a_b%c")).toBe("abc");
  });

  it("also strips filter metacharacters", () => {
    expect(escapeLikeValue("a)b%")).not.toMatch(/[(),~%_]/);
  });
});

describe("numericId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    [7, 7],
    [" 8 ", 8],
  ])("accepts %p", (input, expected) => {
    expect(numericId(input)).toBe(expected);
  });

  it.each(["0", "-1", "abc", "", null, undefined, "1; DROP TABLE", "1.5.2", {}])(
    "rejects %p",
    (bad) => {
      const result = numericId(bad);
      expect(result === null || result > 0).toBe(true);
    }
  );

  it("never returns a value carrying injected text", () => {
    expect(numericId("1)~or(1,eq,1")).toBe(1);
    expect(typeof numericId("1)~or(1,eq,1")).toBe("number");
  });
});

describe("allowedValue", () => {
  const statuses = ["OnSite", "SignedOut", "AutoClosed"] as const;

  it("passes a permitted value through", () => {
    expect(allowedValue("OnSite", statuses)).toBe("OnSite");
  });

  it.each(["onsite", "Deleted", "", null, undefined, "OnSite)~or(1,eq,1"])(
    "rejects %p",
    (bad) => {
      expect(allowedValue(bad, statuses)).toBeNull();
    }
  );
});
