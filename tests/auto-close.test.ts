import { describe, expect, it } from "vitest";
import {
  autoCloseConfig,
  DEFAULT_MAX_HOURS,
  planAutoClose,
  type AutoCloseConfig,
} from "@/lib/auto-close";
import { siteLocalInstant } from "@/lib/attendance";

const config: AutoCloseConfig = {
  cutoff: { hours: 18, minutes: 0 },
  maxHours: 12,
  batchLimit: 500,
};

const HOUR = 3_600_000;

function sydney(day: string, hours: number, minutes = 0): string {
  const instant = siteLocalInstant(day, hours, minutes);
  if (instant === null) throw new Error(`bad fixture: ${day}`);
  return new Date(instant).toISOString();
}

function at(day: string, hours: number): number {
  return new Date(sydney(day, hours)).getTime();
}

describe("planAutoClose", () => {
  it("stamps a forgotten day shift at that day's cut-off, not at job time", () => {
    const plan = planAutoClose(sydney("2026-08-31", 7), config, at("2026-09-01", 2))!;
    expect(plan.reason).toBe("cutoff");
    expect(plan.hours).toBe(11); // 7am to 6pm
  });

  it("leaves a night-shift worker who is genuinely still on site", () => {
    // Signed in 11pm, job runs at 2am — only three hours open.
    expect(
      planAutoClose(sydney("2026-08-31", 23), config, at("2026-09-01", 2))
    ).toBeNull();
  });

  it("caps a forgotten night shift at the maximum, since the cut-off precedes it", () => {
    const plan = planAutoClose(sydney("2026-08-31", 20), config, at("2026-09-02", 2))!;
    expect(plan.reason).toBe("maxShift");
    expect(plan.hours).toBe(12);
  });

  it("leaves anyone still inside the shift window", () => {
    expect(
      planAutoClose(sydney("2026-08-31", 7), config, at("2026-08-31", 15))
    ).toBeNull();
  });

  it("does not close at exactly the maximum, but does one second later", () => {
    const signIn = sydney("2026-08-31", 7);
    const boundary = new Date(signIn).getTime() + config.maxHours * HOUR;
    expect(planAutoClose(signIn, config, boundary)).toBeNull();
    expect(planAutoClose(signIn, config, boundary + 1000)).not.toBeNull();
  });

  it("never stamps a sign-out in the future or before the sign-in", () => {
    for (const hour of [0, 3, 5, 7, 9, 12, 15, 18, 20, 22]) {
      for (const openFor of [12.5, 13, 20, 40, 100]) {
        const signIn = sydney("2026-08-31", hour);
        const signInMs = new Date(signIn).getTime();
        const now = signInMs + openFor * HOUR;
        const plan = planAutoClose(signIn, config, now);
        expect(plan, `h=${hour} open=${openFor}`).not.toBeNull();
        const out = new Date(plan!.signOutAt).getTime();
        expect(out).toBeLessThanOrEqual(now);
        expect(out).toBeGreaterThan(signInMs);
      }
    }
  });

  it("resolves the cut-off in local time across a daylight-saving change", () => {
    // Clocks go forward in Sydney on 4 October 2026.
    const plan = planAutoClose(sydney("2026-10-03", 7), config, at("2026-10-05", 2))!;
    expect(plan.reason).toBe("cutoff");
    expect(plan.hours).toBe(11);
  });

  it("emits second-precision ISO instants", () => {
    const plan = planAutoClose(sydney("2026-08-31", 7), config, at("2026-09-01", 2))!;
    expect(plan.signOutAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it.each([null, undefined, "", "not-a-date"])("ignores %p", (bad) => {
    expect(planAutoClose(bad, config, Date.now())).toBeNull();
  });

  it("ignores a sign-in dated in the future", () => {
    const now = Date.now();
    expect(
      planAutoClose(new Date(now + HOUR).toISOString(), config, now)
    ).toBeNull();
  });
});

describe("autoCloseConfig", () => {
  it("falls back to sane defaults when nothing is configured", () => {
    const config = autoCloseConfig({});
    expect(config.cutoff).toEqual({ hours: 18, minutes: 0 });
    expect(config.maxHours).toBe(DEFAULT_MAX_HOURS);
  });

  it("reads a configured cut-off and shift length", () => {
    const config = autoCloseConfig({
      AUTO_CLOSE_CUTOFF: "16:30",
      AUTO_CLOSE_MAX_HOURS: "10",
    });
    expect(config.cutoff).toEqual({ hours: 16, minutes: 30 });
    expect(config.maxHours).toBe(10);
  });

  it.each(["25:00", "notatime", "", "18"])(
    "falls back to the default cut-off for %p",
    (bad) => {
      expect(autoCloseConfig({ AUTO_CLOSE_CUTOFF: bad }).cutoff).toEqual({
        hours: 18,
        minutes: 0,
      });
    }
  );

  it.each(["0", "-4", "999", "abc"])(
    "falls back to the default shift length for %p",
    (bad) => {
      expect(autoCloseConfig({ AUTO_CLOSE_MAX_HOURS: bad }).maxHours).toBe(
        DEFAULT_MAX_HOURS
      );
    }
  );

  it("bounds the batch limit", () => {
    expect(autoCloseConfig({ AUTO_CLOSE_LIMIT: "9999" }).batchLimit).toBe(500);
    expect(autoCloseConfig({ AUTO_CLOSE_LIMIT: "50" }).batchLimit).toBe(50);
  });
});
