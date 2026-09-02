import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_MS,
  DEFAULT_SUCCESS_MS,
  DEFAULT_VISITOR_PASS_MS,
  KIOSK_COOKIE,
  isKioskRequest,
  isKioskSiteCode,
  kioskIdleExpired,
  kioskPath,
  kioskSiteCodeFromCookie,
  visitorPassUrl,
} from "@/lib/kiosk";

describe("isKioskSiteCode", () => {
  it.each(["AB", "WGSB5", "GATE01", "A1B2C3"])("accepts %p", (code) => {
    expect(isKioskSiteCode(code)).toBe(true);
  });

  it.each([
    "",
    "A",
    "not a code",
    "../admin",
    "AB CD",
    "site/kiosk",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    null,
    undefined,
    12,
  ])("rejects %p", (code) => {
    expect(isKioskSiteCode(code as string)).toBe(false);
  });
});

describe("kioskPath", () => {
  it("uppercases and prefixes /kiosk", () => {
    expect(kioskPath("wgsb5")).toBe("/kiosk/WGSB5");
  });

  it("trims surrounding space", () => {
    expect(kioskPath("  gate1 ")).toBe("/kiosk/GATE1");
  });
});

describe("isKioskRequest", () => {
  it("is only the boolean true, so a string in a JSON body cannot opt in", () => {
    expect(isKioskRequest(true)).toBe(true);
    expect(isKioskRequest("true")).toBe(false);
    expect(isKioskRequest(1)).toBe(false);
    expect(isKioskRequest({ kiosk: true })).toBe(false);
    expect(isKioskRequest(undefined)).toBe(false);
  });
});

describe("kioskSiteCodeFromCookie", () => {
  it("reads the site code", () => {
    expect(kioskSiteCodeFromCookie(`${KIOSK_COOKIE}=WGSB5`)).toBe("WGSB5");
  });

  it("finds it among other cookies", () => {
    expect(
      kioskSiteCodeFromCookie(`sr_gate=abc; ${KIOSK_COOKIE}=gate1; theme=light`)
    ).toBe("GATE1");
  });

  it("decodes a percent-encoded value", () => {
    expect(kioskSiteCodeFromCookie(`${KIOSK_COOKIE}=gate%31`)).toBe("GATE1");
  });

  it.each(["", "sr_worker=1", `${KIOSK_COOKIE}=`, `${KIOSK_COOKIE}=../x`])(
    "returns null for %p",
    (header) => {
      expect(kioskSiteCodeFromCookie(header)).toBeNull();
    }
  );

  it("rejects a truncated name that is not our cookie", () => {
    expect(kioskSiteCodeFromCookie(`not_${KIOSK_COOKIE}=WGSB5`)).toBeNull();
  });
});

describe("kioskIdleExpired", () => {
  const start = 1_000_000;

  it("does not fire before the idle window", () => {
    expect(kioskIdleExpired(start, start + DEFAULT_IDLE_MS - 1)).toBe(false);
  });

  it("fires at the idle window, so a half-filled form cannot sit", () => {
    expect(kioskIdleExpired(start, start + DEFAULT_IDLE_MS)).toBe(true);
  });

  it("accepts an override window", () => {
    expect(kioskIdleExpired(start, start + DEFAULT_SUCCESS_MS, DEFAULT_SUCCESS_MS)).toBe(
      true
    );
    expect(
      kioskIdleExpired(start, start + DEFAULT_VISITOR_PASS_MS - 1, DEFAULT_VISITOR_PASS_MS)
    ).toBe(false);
  });

  it.each([NaN, Infinity, -1, 0])("never fires for a broken window of %p", (idle) => {
    expect(kioskIdleExpired(start, start + 60_000, idle)).toBe(false);
  });

  it("never fires when the clocks are not numbers", () => {
    expect(kioskIdleExpired(Number.NaN, start)).toBe(false);
    expect(kioskIdleExpired(start, Number.NaN)).toBe(false);
  });
});

describe("visitorPassUrl", () => {
  it("puts the token in the pass path", () => {
    expect(visitorPassUrl("https://register.example", "abc.def")).toBe(
      "https://register.example/v/abc.def"
    );
  });

  it("encodes a token that would break a path", () => {
    expect(visitorPassUrl("https://register.example/", "a/b")).toBe(
      "https://register.example/v/a%2Fb"
    );
  });
});
