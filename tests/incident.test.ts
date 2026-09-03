import { describe, expect, it } from "vitest";
import { siteLocalInstant } from "@/lib/attendance";
import {
  incidentEmail,
  incidentKind,
  incidentStatus,
  reporterName,
  validateIncident,
} from "@/lib/incident";

function sydney(day: string, hours: number, minutes = 0): string {
  const instant = siteLocalInstant(day, hours, minutes);
  if (instant === null) throw new Error(`bad fixture: ${day}`);
  return new Date(instant).toISOString();
}

describe("incidentKind", () => {
  it.each([
    ["hazard", "hazard"],
    ["Hazard", "hazard"],
    ["near miss", "nearmiss"],
    ["near-miss", "nearmiss"],
    ["incident", "incident"],
  ])("reads %p as %p", (input, expected) => {
    expect(incidentKind(input)).toBe(expected);
  });

  it.each(["", "injury", "urgent", null])("rejects %p", (bad) => {
    expect(incidentKind(bad)).toBeNull();
  });
});

describe("incidentStatus", () => {
  it("only accepts the three admin statuses", () => {
    expect(incidentStatus("open")).toBe("open");
    expect(incidentStatus("Noted")).toBe("noted");
    expect(incidentStatus("closed")).toBe("closed");
    expect(incidentStatus("resolved")).toBeNull();
  });
});

describe("validateIncident", () => {
  const now = new Date(sydney("2026-09-03", 10)).getTime();
  const base = { kind: "hazard", what: "loose scaffold", siteId: 4 };

  it("stamps the site-local day from when it happened", () => {
    const result = validateIncident(
      { ...base, occurredAt: sydney("2026-09-03", 7) },
      now
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.day).toBe("2026-09-03");
      expect(result.draft.status).toBe("open");
      expect(result.draft.kind).toBe("hazard");
    }
  });

  it("defaults occurred-at to now when the worker does not send a time", () => {
    const result = validateIncident(base, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.day).toBe("2026-09-03");
  });

  it("refuses an empty description rather than storing a blank report", () => {
    expect(validateIncident({ ...base, what: "   " }, now)).toEqual({
      ok: false,
      reason: "noWhat",
    });
  });

  it("refuses a missing site rather than saving against nothing", () => {
    expect(validateIncident({ ...base, siteId: "" }, now)).toEqual({
      ok: false,
      reason: "noSite",
    });
  });

  it("refuses a kind that is not one of the three", () => {
    expect(validateIncident({ ...base, kind: "injury" }, now)).toEqual({
      ok: false,
      reason: "noKind",
    });
  });

  it("refuses a description that would blow the row", () => {
    expect(
      validateIncident({ ...base, what: "x".repeat(4001) }, now)
    ).toEqual({ ok: false, reason: "tooLong" });
  });

  it("allows a report with no where or action", () => {
    const result = validateIncident(base, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.whereOnSite).toBe("");
      expect(result.draft.action).toBe("");
    }
  });

  it("does not require an attendance id — walking off does not block a report", () => {
    const result = validateIncident(base, now);
    expect(result.ok).toBe(true);
  });

  it("rejects a status an admin did not mean", () => {
    expect(validateIncident({ ...base, status: "resolved" }, now)).toEqual({
      ok: false,
      reason: "badStatus",
    });
  });
});

describe("reporterName", () => {
  it("uses the person on the register, or Unknown", () => {
    expect(reporterName({ FirstName: "Ann", LastName: "Lee" })).toBe("Ann Lee");
    expect(reporterName({})).toBe("Unknown");
  });
});

describe("incidentEmail", () => {
  it("names the kind and the site so a manager can act without opening the app", () => {
    const mail = incidentEmail({
      kind: "nearmiss",
      siteName: "Building 5",
      reporter: "Ann Lee",
      what: "Load swung over the walkway",
      whereOnSite: "south hoist",
    });
    expect(mail.subject).toBe("Building 5 — Near miss");
    expect(mail.text).toContain("Ann Lee");
    expect(mail.text).toContain("south hoist");
    expect(mail.text).toContain("Load swung over the walkway");
  });
});
