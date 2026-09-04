import { describe, expect, it } from "vitest";
import {
  companyHasLapsedCover,
  evaluateCompanyCover,
  lapsedCover,
} from "@/lib/company-cover";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00Z");
const days = (n: number) => NOW + n * DAY;
const asDate = (instant: number) =>
  new Date(instant).toISOString().slice(0, 10);

const evaluate = (company: Record<string, unknown> | null) =>
  evaluateCompanyCover(company, { now: NOW, warnDays: 30 });

describe("evaluateCompanyCover", () => {
  it("always returns the three covers, even when nothing is on file", () => {
    const states = evaluate({});
    expect(states.map((s) => s.key)).toEqual([
      "publicLiability",
      "workersComp",
      "contractorLicence",
    ]);
    expect(states.every((s) => s.status === "missing")).toBe(true);
  });

  it("treats a null company the same as an empty one", () => {
    expect(evaluate(null).every((s) => s.status === "missing")).toBe(true);
  });

  it("reports a policy number with no expiry as unverified, not lapsed", () => {
    const [pl] = evaluate({ PublicLiabilityNumber: "PL-1" });
    expect(pl.status).toBe("unverified");
    expect(pl.daysRemaining).toBeNull();
    expect(lapsedCover([pl])).toEqual([]);
  });

  it("treats an unreadable date the same as none", () => {
    const [pl] = evaluate({
      PublicLiabilityNumber: "PL-1",
      PublicLiabilityExpiry: "sometime next year",
    });
    expect(pl.status).toBe("unverified");
    expect(lapsedCover([pl])).toEqual([]);
  });

  it("still stands on the day it expires", () => {
    const [pl] = evaluate({ PublicLiabilityExpiry: asDate(NOW) });
    expect(pl.status).not.toBe("expired");
    expect(lapsedCover([pl])).toEqual([]);
  });

  it("is expired the day after", () => {
    const [pl] = evaluate({ PublicLiabilityExpiry: asDate(days(-1)) });
    expect(pl.status).toBe("expired");
    expect(lapsedCover([pl])).toHaveLength(1);
  });

  it("flags a date inside the warning window as expiring", () => {
    const [pl] = evaluate({ PublicLiabilityExpiry: asDate(days(10)) });
    expect(pl.status).toBe("expiring");
    expect(pl.daysRemaining).toBe(10);
    expect(lapsedCover([pl])).toEqual([]);
  });

  it("is valid outside the warning window", () => {
    const [pl] = evaluate({ PublicLiabilityExpiry: asDate(days(90)) });
    expect(pl.status).toBe("valid");
  });

  it("judges each cover on its own date", () => {
    const states = evaluate({
      PublicLiabilityExpiry: asDate(days(-1)),
      WorkersCompExpiry: asDate(days(10)),
      ContractorLicenceExpiry: asDate(days(90)),
    });
    expect(states.map((s) => s.status)).toEqual([
      "expired",
      "expiring",
      "valid",
    ]);
    expect(lapsedCover(states).map((s) => s.key)).toEqual(["publicLiability"]);
  });
});

describe("companyHasLapsedCover", () => {
  it("is false when nothing is on file — missing is not lapsed", () => {
    expect(companyHasLapsedCover({}, { now: NOW })).toBe(false);
  });

  it("is true only once a recorded date has passed", () => {
    expect(
      companyHasLapsedCover(
        { WorkersCompExpiry: asDate(days(-1)) },
        { now: NOW }
      )
    ).toBe(true);
    expect(
      companyHasLapsedCover(
        { WorkersCompExpiry: asDate(days(1)) },
        { now: NOW }
      )
    ).toBe(false);
  });
});
