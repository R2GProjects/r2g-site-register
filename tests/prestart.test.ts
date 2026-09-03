import { describe, expect, it } from "vitest";
import { siteLocalInstant } from "@/lib/attendance";
import {
  applyPresent,
  asPresent,
  attendeeFromOnSite,
  attendeesFromOnSite,
  mergeAttendees,
  parseRoll,
  preStartCounts,
  serializeRoll,
  validatePreStart,
} from "@/lib/prestart";

function sydney(day: string, hours: number, minutes = 0): string {
  const instant = siteLocalInstant(day, hours, minutes);
  if (instant === null) throw new Error(`bad fixture: ${day}`);
  return new Date(instant).toISOString();
}

const onSite = [
  {
    Id: 100,
    SignInTime: sydney("2026-09-03", 6, 30),
    People_id: 1,
    Person: { Id: 1, FirstName: "Ann", LastName: "Lee" },
  },
  {
    Id: 101,
    SignInTime: sydney("2026-09-03", 6, 45),
    Visitors_id: 7,
    Visitor: { Id: 7, FirstName: "Pat", LastName: "Cole" },
    AttendanceType: "Visitor",
  },
  {
    Id: 102,
    SignInTime: sydney("2026-09-03", 7),
    People_id: 9,
    Person: { Id: 9 },
  },
];

describe("asPresent", () => {
  it("treats only the boolean true as a tick", () => {
    expect(asPresent(true)).toBe(true);
    expect(asPresent("true")).toBe(false);
    expect(asPresent(1)).toBe(false);
    expect(asPresent(null)).toBe(false);
  });
});

describe("attendeesFromOnSite", () => {
  it("starts everyone who is signed in as present", () => {
    const roll = attendeesFromOnSite(onSite);
    expect(roll.map((row) => row.key)).toEqual([
      "person:1",
      "visitor:7",
      "person:9",
    ]);
    expect(roll.every((row) => row.present)).toBe(true);
    expect(roll[0].name).toBe("Ann Lee");
    expect(roll[1].kind).toBe("visitor");
  });

  it("keeps a signed-in row with no name rather than dropping it", () => {
    const unknown = attendeesFromOnSite([onSite[2]])[0];
    expect(unknown.key).toBe("person:9");
    expect(unknown.name).toBe("Unknown");
  });

  it("does not list the same person twice", () => {
    const roll = attendeesFromOnSite([onSite[0], onSite[0]]);
    expect(roll).toHaveLength(1);
  });

  it("falls back to the attendance id when there is no person or visitor", () => {
    const row = attendeeFromOnSite({ Id: 55, SignInTime: sydney("2026-09-03", 7) });
    expect(row.key).toBe("attendance:55");
    expect(row.kind).toBe("unknown");
  });
});

describe("applyPresent", () => {
  it("unticks anyone not in the present list, including a string that looks true", () => {
    const roll = applyPresent(attendeesFromOnSite(onSite), ["person:1"]);
    expect(roll.find((row) => row.key === "person:1")?.present).toBe(true);
    expect(roll.find((row) => row.key === "visitor:7")?.present).toBe(false);
  });
});

describe("mergeAttendees", () => {
  it("adds a late arrival without clearing an existing untick", () => {
    const started = applyPresent(attendeesFromOnSite([onSite[0]]), []);
    const later = attendeesFromOnSite([onSite[0], onSite[1]]);
    const merged = mergeAttendees(started, later);
    expect(merged.find((row) => row.key === "person:1")?.present).toBe(false);
    expect(merged.find((row) => row.key === "visitor:7")?.present).toBe(true);
  });

  it("keeps someone who has signed out, because they may have been at the talk", () => {
    const started = attendeesFromOnSite(onSite);
    const stillThere = attendeesFromOnSite([onSite[0]]);
    expect(mergeAttendees(started, stillThere)).toHaveLength(3);
  });
});

describe("parseRoll", () => {
  it("round-trips a saved roll", () => {
    const original = attendeesFromOnSite(onSite);
    expect(parseRoll(serializeRoll(original))).toEqual(original);
  });

  it("returns empty rather than throwing on rubbish JSON", () => {
    expect(parseRoll("{not json")).toEqual([]);
    expect(parseRoll(null)).toEqual([]);
  });

  it("drops a row with no key instead of inventing an identity", () => {
    expect(parseRoll([{ name: "Ghost", present: true }])).toEqual([]);
  });
});

describe("preStartCounts", () => {
  it("counts present and absent separately", () => {
    const roll = applyPresent(attendeesFromOnSite(onSite), ["person:1", "visitor:7"]);
    expect(preStartCounts(roll)).toEqual({ onRoll: 3, present: 2, absent: 1 });
  });

  it("is empty for no one", () => {
    expect(preStartCounts([])).toEqual({ onRoll: 0, present: 0, absent: 0 });
  });
});

describe("validatePreStart", () => {
  const now = new Date(sydney("2026-09-03", 7)).getTime();

  it("stamps the site-local day from the time the talk was held", () => {
    const result = validatePreStart(
      { siteId: 4, heldAt: sydney("2026-09-03", 7), attendees: [] },
      now
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.day).toBe("2026-09-03");
      expect(result.draft.siteId).toBe(4);
    }
  });

  it("allows a talk with no topic and nobody on the roll", () => {
    const result = validatePreStart({ siteId: 4 }, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.topic).toBe("");
      expect(result.draft.attendees).toEqual([]);
    }
  });

  it("rejects a missing site rather than saving against nothing", () => {
    expect(validatePreStart({ siteId: "" }, now)).toEqual({
      ok: false,
      reason: "noSite",
    });
  });

  it("rejects a held-at that is not a time", () => {
    expect(validatePreStart({ siteId: 4, heldAt: "lunch" }, now)).toEqual({
      ok: false,
      reason: "badTime",
    });
  });

  it("rejects a roll that is not a list", () => {
    expect(validatePreStart({ siteId: 4, attendees: "everyone" }, now)).toEqual({
      ok: false,
      reason: "badRoll",
    });
  });

  it("trims free text and keeps only boolean ticks", () => {
    const result = validatePreStart(
      {
        siteId: 4,
        topic: "  crane  ",
        hazards: " wet decks ",
        ledBy: " Sam ",
        attendees: [
          { key: "person:1", name: "Ann Lee", present: true },
          { key: "person:2", name: "Bob Ng", present: "true" },
        ],
      },
      now
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.topic).toBe("crane");
      expect(result.draft.ledBy).toBe("Sam");
      expect(result.draft.attendees[0].present).toBe(true);
      expect(result.draft.attendees[1].present).toBe(false);
    }
  });
});
