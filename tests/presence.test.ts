import { beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-for-unit-tests-only";

let presence: typeof import("@/lib/presence");

beforeAll(async () => {
  presence = await import("@/lib/presence");
});

const SITE = { Latitude: 0, Longitude: 0 };
const INSIDE = { lat: 0, lng: 0 };
const OUTSIDE = { lat: 0.05, lng: 0 };

describe("createGateToken / readGateToken", () => {
  it("round-trips a site code", () => {
    const token = presence.createGateToken("abc12");
    expect(presence.readGateToken(token)).toEqual({ siteCode: "ABC12" });
  });

  it("is URL-safe", () => {
    expect(presence.createGateToken("GATE1")).not.toMatch(/[+/=]/);
  });

  it("rejects a swapped payload under a valid signature", () => {
    const a = presence.createGateToken("SITEA");
    const b = presence.createGateToken("SITEB");
    const swapped = `${a.split(".")[0]}.${b.split(".")[1]}`;
    expect(presence.readGateToken(swapped)).toBeNull();
  });

  it("rejects an altered signature", () => {
    const [payload, signature] = presence.createGateToken("SITEA").split(".");
    const flipped = signature[0] === "a" ? "b" : "a";
    expect(
      presence.readGateToken(`${payload}.${flipped}${signature.slice(1)}`)
    ).toBeNull();
  });

  it("rejects an expired token against the current clock", () => {
    const token = presence.createGateToken("SITEA", Date.now() - 31 * 60 * 1000);
    expect(presence.readGateToken(token)).toBeNull();
  });

  it("still reads a token that was valid at the tap, so an offline flush hours later can prove the scan", () => {
    const tapped = Date.now() - 3 * 60 * 60 * 1000;
    const token = presence.createGateToken("SITEA", tapped);
    expect(presence.readGateToken(token, tapped + 5 * 60 * 1000)).toEqual({
      siteCode: "SITEA",
    });
    expect(presence.readGateToken(token, Date.now())).toBeNull();
  });

  it.each([null, undefined, "", "not.a.token"])("rejects %p", (value) => {
    expect(presence.readGateToken(value)).toBeNull();
  });
});

describe("evaluatePresence", () => {
  const radiusMetres = 300;

  it("accepts a GPS reading on the pin as a geofence sign-in", () => {
    expect(
      presence.evaluatePresence(
        { siteCode: "A", ...INSIDE, site: SITE },
        { radiusMetres }
      )
    ).toEqual({ ok: true, method: "Geofence" });
  });

  it("refuses a GPS reading outside the fence even when a gate cookie is present", () => {
    const gateToken = presence.createGateToken("A");
    const result = presence.evaluatePresence(
      { siteCode: "A", ...OUTSIDE, site: SITE, gateToken },
      { radiusMetres }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/do not appear to be at this site/i);
    }
  });

  it("accepts a matching gate cookie when there is no GPS fix", () => {
    const gateToken = presence.createGateToken("gate1");
    expect(
      presence.evaluatePresence({
        siteCode: "gate1",
        site: SITE,
        gateToken,
      })
    ).toEqual({ ok: true, method: "SiteQR" });
  });

  it("refuses a gate cookie for a different site", () => {
    const gateToken = presence.createGateToken("OTHER");
    const result = presence.evaluatePresence({
      siteCode: "GATE1",
      site: SITE,
      gateToken,
    });
    expect(result.ok).toBe(false);
  });

  it("tells a worker with neither GPS nor a scan to go to the gate", () => {
    const result = presence.evaluatePresence({ siteCode: "A", site: SITE });
    expect(result).toEqual({
      ok: false,
      status: 403,
      error:
        "Sign in at the site. Scan the site QR at the gate, or allow location so we can confirm you are there.",
    });
  });

  it("refuses GPS against a site with no pin, rather than inventing a location", () => {
    const result = presence.evaluatePresence({
      siteCode: "A",
      ...INSIDE,
      site: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no location on file/i);
    }
  });

  it("treats an unreadable GPS reading as missing and falls through to the gate cookie", () => {
    const gateToken = presence.createGateToken("A");
    expect(
      presence.evaluatePresence({
        siteCode: "A",
        lat: "not-a-number",
        lng: 0,
        site: SITE,
        gateToken,
      })
    ).toEqual({ ok: true, method: "SiteQR" });
  });

  it("judges a stored gate scan at the tap time, not at flush time", () => {
    const tapped = Date.now() - 3 * 60 * 60 * 1000;
    const gateToken = presence.createGateToken("A", tapped);
    expect(
      presence.evaluatePresence(
        { siteCode: "A", site: SITE, gateToken },
        { now: tapped + 60 * 1000 }
      )
    ).toEqual({ ok: true, method: "SiteQR" });
  });
});

describe("gateCookieFromRequest", () => {
  it("reads the cookie from the request header", () => {
    const token = presence.createGateToken("A");
    const request = new Request("http://localhost/api/attend/signin", {
      headers: { cookie: `${presence.GATE_COOKIE}=${token}` },
    });
    expect(presence.gateCookieFromRequest(request)).toBe(token);
  });

  it("returns null when the cookie is absent", () => {
    const request = new Request("http://localhost/api/attend/signin");
    expect(presence.gateCookieFromRequest(request)).toBeNull();
  });
});
