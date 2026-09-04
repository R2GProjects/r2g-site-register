import { describe, expect, it } from "vitest";
import {
  buildAttendanceSummary,
  dayBoundaryISO,
  dayKey,
  formatHours,
  hoursLogged,
  includeAttendanceSummary,
  parseClockTime,
  siteLocalInstant,
  thisMonthRange,
} from "@/lib/attendance";

/** Sydney wall-clock time as a UTC ISO string, for readable fixtures. */
function sydney(day: string, hours: number, minutes = 0): string {
  const instant = siteLocalInstant(day, hours, minutes);
  if (instant === null) throw new Error(`bad fixture: ${day}`);
  return new Date(instant).toISOString();
}

describe("hoursLogged", () => {
  it("measures a closed shift", () => {
    expect(hoursLogged(sydney("2026-08-31", 7), sydney("2026-08-31", 15))).toBe(8);
  });

  it("measures an open shift against now", () => {
    const signIn = sydney("2026-08-31", 7);
    const now = new Date(signIn).getTime() + 3 * 3_600_000;
    expect(hoursLogged(signIn, null, now)).toBe(3);
  });

  it("returns zero rather than a negative when sign-out precedes sign-in", () => {
    expect(hoursLogged(sydney("2026-08-31", 15), sydney("2026-08-31", 7))).toBe(0);
  });

  it.each([null, undefined, "", "not-a-date"])("returns zero for %p", (bad) => {
    expect(hoursLogged(bad, null)).toBe(0);
  });
});

describe("formatHours", () => {
  it.each([
    [0, "0h"],
    [-1, "0h"],
    [0.5, "30m"],
    [1, "1h"],
    [1.5, "1h 30m"],
    [8.25, "8h 15m"],
  ])("formats %p as %p", (hours, expected) => {
    expect(formatHours(hours)).toBe(expected);
  });

  it("rounds to the nearest minute rather than truncating", () => {
    expect(formatHours(1 + 29.6 / 60)).toBe("1h 30m");
  });
});

describe("dayKey", () => {
  it("puts an early morning sign-in on the site-local day, not the UTC one", () => {
    // 7am Sydney is the previous date in UTC, which is most of a morning shift.
    const early = sydney("2026-08-31", 7);
    expect(new Date(early).toISOString().slice(0, 10)).toBe("2026-08-30");
    expect(dayKey(early)).toBe("2026-08-31");
  });

  it.each([null, "", "rubbish"])("returns empty for %p", (bad) => {
    expect(dayKey(bad)).toBe("");
  });
});

describe("siteLocalInstant", () => {
  it("resolves the same wall time either side of a daylight-saving change", () => {
    // Clocks go forward in Sydney on 4 October 2026.
    const before = siteLocalInstant("2026-10-03", 18)!;
    const after = siteLocalInstant("2026-10-05", 18)!;
    const hoursApart = (after - before) / 3_600_000;
    expect(hoursApart).toBe(47); // 48 wall-clock hours, one lost to the change
  });

  it("lands on an exact second, with no millisecond drift", () => {
    expect(siteLocalInstant("2026-08-31", 18)! % 1000).toBe(0);
  });

  it.each(["", "2026-8-31", "2026-13-01", "2026-08-32", "not-a-date", null])(
    "rejects %p",
    (bad) => {
      expect(siteLocalInstant(bad, 12)).toBeNull();
    }
  );
});

describe("dayBoundaryISO", () => {
  it("brackets exactly one site-local day", () => {
    const start = dayBoundaryISO("2026-08-31", "start")!;
    const end = dayBoundaryISO("2026-08-31", "end")!;
    expect(dayKey(start)).toBe("2026-08-31");
    expect(dayKey(end)).toBe("2026-08-31");
    expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
  });

  it("does not spill into the next day", () => {
    const end = dayBoundaryISO("2026-08-31", "end")!;
    const nextStart = dayBoundaryISO("2026-09-01", "start")!;
    expect(new Date(end).getTime()).toBeLessThan(new Date(nextStart).getTime());
  });

  it("emits second-precision ISO instants", () => {
    expect(dayBoundaryISO("2026-08-31", "start")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
    );
  });

  it("returns null for a non-date", () => {
    expect(dayBoundaryISO("last tuesday", "start")).toBeNull();
  });
});

describe("parseClockTime", () => {
  it.each([
    ["18:00", { hours: 18, minutes: 0 }],
    ["6:30", { hours: 6, minutes: 30 }],
    ["00:00", { hours: 0, minutes: 0 }],
    ["23:59", { hours: 23, minutes: 59 }],
  ])("parses %p", (input, expected) => {
    expect(parseClockTime(input)).toEqual(expected);
  });

  it.each(["24:00", "18:60", "18", "1800", "", null, "half six"])(
    "rejects %p",
    (bad) => {
      expect(parseClockTime(bad)).toBeNull();
    }
  );
});

describe("buildAttendanceSummary", () => {
  const records = [
    {
      SignInTime: sydney("2026-08-31", 7),
      SignOutTime: sydney("2026-08-31", 15),
      Status: "SignedOut",
      Person: { FirstName: "Ann", LastName: "Lee" },
    },
    {
      SignInTime: sydney("2026-08-31", 8),
      SignOutTime: sydney("2026-08-31", 12),
      Status: "SignedOut",
      Person: { FirstName: "Bob", LastName: "Ng" },
    },
    {
      SignInTime: sydney("2026-09-01", 7),
      SignOutTime: null,
      Status: "OnSite",
      Person: { FirstName: "Ann", LastName: "Lee" },
    },
  ];

  it("totals hours across every record", () => {
    const summary = buildAttendanceSummary(records.slice(0, 2));
    expect(summary.totalHours).toBe(12);
  });

  it("groups by site-local day, most recent first", () => {
    const summary = buildAttendanceSummary(records);
    expect(summary.byDay.map((d) => d.date)).toEqual(["2026-09-01", "2026-08-31"]);
  });

  it("counts each day's records and distinct people", () => {
    const day = buildAttendanceSummary(records).byDay.find(
      (d) => d.date === "2026-08-31"
    )!;
    expect(day.count).toBe(2);
    expect(day.names.sort()).toEqual(["Ann Lee", "Bob Ng"]);
    expect(day.hours).toBe(12);
  });

  it("lists who is still on site, without duplicates", () => {
    const summary = buildAttendanceSummary([...records, records[2]]);
    expect(summary.onsiteNames).toEqual(["Ann Lee"]);
  });

  it("does not attribute a sign-out to a day it did not happen on", () => {
    const overnight = buildAttendanceSummary([
      {
        SignInTime: sydney("2026-08-31", 22),
        SignOutTime: sydney("2026-09-01", 6),
        Status: "SignedOut",
        Person: { FirstName: "Night", LastName: "Shift" },
      },
    ]);
    const day = overnight.byDay.find((d) => d.date === "2026-08-31")!;
    expect(day.people[0].outAt).toBeNull();
    expect(day.hours).toBe(8);
  });

  it("falls back to a visitor label when there is no person", () => {
    const summary = buildAttendanceSummary([
      {
        SignInTime: sydney("2026-08-31", 9),
        SignOutTime: sydney("2026-08-31", 10),
        Status: "SignedOut",
        Visitor: { Id: 7 },
      },
    ]);
    expect(summary.byDay[0].names).toEqual(["Visitor #7"]);
  });

  it("skips records with no usable sign-in time", () => {
    const summary = buildAttendanceSummary([
      { SignInTime: null, SignOutTime: null, Status: "OnSite" },
    ]);
    expect(summary.byDay).toEqual([]);
  });

  it("returns empty totals for no records", () => {
    const summary = buildAttendanceSummary([]);
    expect(summary.totalHours).toBe(0);
    expect(summary.byDay).toEqual([]);
    expect(summary.onsiteNames).toEqual([]);
  });
});

describe("thisMonthRange", () => {
  it("starts on the first of the site-local month", () => {
    const now = Date.parse("2026-09-04T02:00:00Z");
    expect(thisMonthRange(now)).toEqual({ from: "2026-09-01", to: "2026-09-04" });
  });

  it("uses the site-local date when UTC is still yesterday", () => {
    const now = Date.parse("2026-09-03T21:00:00Z");
    expect(thisMonthRange(now)).toEqual({ from: "2026-09-01", to: "2026-09-04" });
  });

  it("rolls to the new month at local midnight", () => {
    const now = Date.parse("2026-08-31T14:00:00Z");
    expect(thisMonthRange(now)).toEqual({ from: "2026-09-01", to: "2026-09-01" });
  });
});

describe("includeAttendanceSummary", () => {
  it("rebuilds on the first page of a filter", () => {
    expect(includeAttendanceSummary(0, undefined)).toBe(true);
  });

  it("does not rebuild when only the page changes", () => {
    expect(includeAttendanceSummary(1, undefined)).toBe(false);
    expect(includeAttendanceSummary(2, null)).toBe(false);
  });

  it("can be forced on or off", () => {
    expect(includeAttendanceSummary(3, "1")).toBe(true);
    expect(includeAttendanceSummary(3, true)).toBe(true);
    expect(includeAttendanceSummary(0, "0")).toBe(false);
  });

  it("does not treat the string true as a force", () => {
    expect(includeAttendanceSummary(1, "true")).toBe(false);
  });
});
