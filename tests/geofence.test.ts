import { describe, expect, it } from "vitest";
import {
  DEFAULT_RADIUS_METRES,
  geofenceRadiusMetres,
  isInsideGeofence,
  metresBetween,
  parseLatitude,
  parseLongitude,
  siteCoordinates,
} from "@/lib/geofence";

const ORIGIN = { lat: 0, lng: 0 };

describe("metresBetween", () => {
  it("is zero at the same point", () => {
    expect(metresBetween(0, 0, 0, 0)).toBe(0);
  });

  it("grows as the points move apart", () => {
    const near = metresBetween(0, 0, 0.001, 0);
    const far = metresBetween(0, 0, 0.01, 0);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });
});

describe("isInsideGeofence", () => {
  it("counts standing on the pin as inside", () => {
    expect(isInsideGeofence(ORIGIN, ORIGIN, 300)).toBe(true);
  });

  it("includes the fence itself", () => {
    const dist = metresBetween(0, 0, 0.002, 0);
    expect(
      isInsideGeofence({ lat: 0.002, lng: 0 }, ORIGIN, dist)
    ).toBe(true);
  });

  it("excludes a point just outside the fence", () => {
    const dist = metresBetween(0, 0, 0.002, 0);
    expect(
      isInsideGeofence({ lat: 0.002, lng: 0 }, ORIGIN, dist - 1)
    ).toBe(false);
  });
});

describe("parseLatitude / parseLongitude", () => {
  it("accepts a number in range", () => {
    expect(parseLatitude(-33.86)).toBeCloseTo(-33.86);
    expect(parseLongitude("151.21")).toBeCloseTo(151.21);
  });

  it.each([91, -91, "lat", "", null, undefined])("rejects latitude %p", (value) => {
    expect(parseLatitude(value)).toBeNull();
  });

  it.each([181, -181, "lng", "", null, undefined])("rejects longitude %p", (value) => {
    expect(parseLongitude(value)).toBeNull();
  });
});

describe("siteCoordinates", () => {
  it("returns null when either value is missing", () => {
    expect(siteCoordinates({ Latitude: -33.8 })).toBeNull();
    expect(siteCoordinates({ Longitude: 151.2 })).toBeNull();
    expect(siteCoordinates({})).toBeNull();
  });

  it("returns both when they are usable", () => {
    expect(siteCoordinates({ Latitude: "-33.8", Longitude: "151.2" })).toEqual({
      lat: -33.8,
      lng: 151.2,
    });
  });
});

describe("geofenceRadiusMetres", () => {
  it("defaults when unset", () => {
    expect(geofenceRadiusMetres({})).toBe(DEFAULT_RADIUS_METRES);
  });

  it("accepts a configured radius", () => {
    expect(geofenceRadiusMetres({ GEOFENCE_RADIUS_METRES: "500" })).toBe(500);
  });

  it.each(["0", "49", "2001", "nope", ""])(
    "falls back to the default for %p rather than inventing a fence",
    (value) => {
      expect(geofenceRadiusMetres({ GEOFENCE_RADIUS_METRES: value })).toBe(
        DEFAULT_RADIUS_METRES
      );
    }
  );
});
