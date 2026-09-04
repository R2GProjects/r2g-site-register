import { describe, expect, it } from "vitest";
import {
  DEFAULT_WARN_DAYS,
  blockedMessage,
  blockingCredentials,
  credentialWarnDays,
  evaluateCredentials,
  expiryInstant,
  isWhiteCardVerified,
  nextWhiteCardVerified,
  whiteCardNeedsReview,
} from "@/lib/credentials";

const DAY = 86_400_000;

/** Midday UTC on 15 June 2026, so no test sits on a day boundary by accident. */
const NOW = Date.parse("2026-06-15T12:00:00Z");

const days = (n: number) => NOW + n * DAY;
const asDate = (instant: number) =>
  new Date(instant).toISOString().slice(0, 10);

describe("credentialWarnDays", () => {
  it("defaults when unset", () => {
    expect(credentialWarnDays({})).toBe(DEFAULT_WARN_DAYS);
  });

  it("accepts a configured window", () => {
    expect(credentialWarnDays({ CREDENTIAL_WARN_DAYS: "60" })).toBe(60);
  });

  it.each(["0", "-5", "not a number", "", "400"])(
    "falls back to the default for %p rather than disabling the warning",
    (value) => {
      expect(credentialWarnDays({ CREDENTIAL_WARN_DAYS: value })).toBe(
        DEFAULT_WARN_DAYS
      );
    }
  );
});

describe("expiryInstant", () => {
  it("treats a bare date as the end of that day", () => {
    expect(expiryInstant("2026-08-31")).toBe(
      Date.parse("2026-08-31T23:59:59.999Z")
    );
  });

  it("keeps a full timestamp as given", () => {
    expect(expiryInstant("2026-08-31T04:00:00Z")).toBe(
      Date.parse("2026-08-31T04:00:00Z")
    );
  });

  it.each([null, undefined, "", "   "])("returns null for %p", (value) => {
    expect(expiryInstant(value)).toBeNull();
  });

  it.each(["not a date", "2026-13-45", "31/08/2026"])(
    "returns null for unparseable input %p",
    (value) => {
      expect(expiryInstant(value)).toBeNull();
    }
  );
});

describe("evaluateCredentials — white card", () => {
  const evaluate = (person: Record<string, unknown>) =>
    evaluateCredentials(person, { now: NOW, warnDays: 30 })[0];

  it("reports nothing on record as missing, which does not block", () => {
    const state = evaluate({});
    expect(state.status).toBe("missing");
    expect(blockingCredentials([state])).toEqual([]);
  });

  it("reports a number with no expiry as unverified, which does not block", () => {
    const state = evaluate({ WhiteCardNumber: "WC123" });
    expect(state.status).toBe("unverified");
    expect(state.daysRemaining).toBeNull();
    expect(blockingCredentials([state])).toEqual([]);
  });

  it("does not block on an expiry it cannot parse", () => {
    const state = evaluate({
      WhiteCardNumber: "WC123",
      WhiteCardExpiry: "sometime next year",
    });
    expect(state.status).toBe("unverified");
    expect(blockingCredentials([state])).toEqual([]);
  });

  it("is valid well before expiry", () => {
    const state = evaluate({ WhiteCardExpiry: asDate(days(90)) });
    expect(state.status).toBe("valid");
  });

  it("is expiring inside the warning window", () => {
    const state = evaluate({ WhiteCardExpiry: asDate(days(10)) });
    expect(state.status).toBe("expiring");
    expect(state.daysRemaining).toBe(10);
  });

  it("is expired once the date has passed", () => {
    const state = evaluate({ WhiteCardExpiry: asDate(days(-1)) });
    expect(state.status).toBe("expired");
    expect(blockingCredentials([state])).toEqual([state]);
  });

  it("still stands on the day it expires", () => {
    // A card printed "expires 15 June" is good for all of 15 June, not none
    // of it. Getting this wrong turns someone away a day early.
    const state = evaluate({ WhiteCardExpiry: asDate(NOW) });
    expect(state.status).not.toBe("expired");
    expect(blockingCredentials([state])).toEqual([]);
  });

  it("expires the day after, not weeks later", () => {
    const state = evaluate({ WhiteCardExpiry: asDate(days(-1)) });
    expect(state.status).toBe("expired");
  });

  it("is expired at the exact instant it lapses, not one tick later", () => {
    // Only reachable with a stored timestamp rather than a bare date, but it
    // is the comparison every other case rests on, so it is pinned directly.
    const state = evaluate({
      WhiteCardExpiry: new Date(NOW).toISOString(),
    });
    expect(state.status).toBe("expired");
  });

  it("is still valid one millisecond before it lapses", () => {
    const state = evaluate({
      WhiteCardExpiry: new Date(NOW + 1).toISOString(),
    });
    expect(state.status).not.toBe("expired");
  });

  it("moves from expiring to valid at the edge of the window", () => {
    const inside = evaluate({ WhiteCardExpiry: asDate(days(29)) });
    const outside = evaluate({ WhiteCardExpiry: asDate(days(45)) });
    expect(inside.status).toBe("expiring");
    expect(outside.status).toBe("valid");
  });
});

describe("evaluateCredentials — licence", () => {
  const evaluate = (person: Record<string, unknown>) =>
    evaluateCredentials(person, { now: NOW, warnDays: 30 });

  it("is left out entirely for a worker who holds none", () => {
    // Most trades need no ticket beyond a white card. Inventing a missing
    // licence for them would put a warning on every record.
    const states = evaluate({ WhiteCardNumber: "WC1" });
    expect(states).toHaveLength(1);
    expect(states[0].key).toBe("whiteCard");
  });

  it("is assessed once a number is on record", () => {
    const states = evaluate({ LicenceNumber: "L1" });
    expect(states.map((s) => s.key)).toContain("licence");
  });

  it("is assessed when only an expiry is on record", () => {
    const states = evaluate({ LicenceExpiry: asDate(days(5)) });
    const licence = states.find((s) => s.key === "licence");
    expect(licence?.status).toBe("expiring");
  });

  it("is named by its type so the worker knows which ticket lapsed", () => {
    const states = evaluate({ LicenceNumber: "L1", LicenceType: "EWP" });
    const licence = states.find((s) => s.key === "licence");
    expect(licence?.label).toBe("EWP licence");
  });

  it("falls back to a generic name when the type is blank", () => {
    const states = evaluate({ LicenceNumber: "L1", LicenceType: "  " });
    const licence = states.find((s) => s.key === "licence");
    expect(licence?.label).toBe("Licence");
  });

  it("blocks independently of the white card", () => {
    const states = evaluate({
      WhiteCardExpiry: asDate(days(200)),
      LicenceNumber: "L1",
      LicenceExpiry: asDate(days(-3)),
    });
    const blocking = blockingCredentials(states);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].key).toBe("licence");
  });
});

describe("evaluateCredentials — a null person", () => {
  it("does not block, because unknown is not the same as expired", () => {
    const states = evaluateCredentials(null, { now: NOW, warnDays: 30 });
    expect(blockingCredentials(states)).toEqual([]);
  });
});

describe("blockedMessage", () => {
  const evaluate = (person: Record<string, unknown>) =>
    blockingCredentials(evaluateCredentials(person, { now: NOW, warnDays: 30 }));

  it("is empty when nothing blocks", () => {
    expect(blockedMessage([])).toBe("");
  });

  it("names the one credential that lapsed and its date", () => {
    const message = blockedMessage(
      evaluate({ WhiteCardExpiry: "2026-01-31" })
    );
    expect(message).toContain("white card");
    expect(message).toContain("2026-01-31");
    expect(message).toContain("site supervisor");
  });

  it("lists both when both have lapsed", () => {
    const message = blockedMessage(
      evaluate({
        WhiteCardExpiry: "2026-01-31",
        LicenceNumber: "L1",
        LicenceType: "EWP",
        LicenceExpiry: "2026-02-28",
      })
    );
    expect(message).toContain("white card");
    expect(message).toContain("ewp licence");
    expect(message).toContain(" and ");
  });
});

describe("isWhiteCardVerified", () => {
  it("accepts only boolean true or the stored flag 1", () => {
    expect(isWhiteCardVerified(true)).toBe(true);
    expect(isWhiteCardVerified("1")).toBe(true);
  });

  it.each([false, "true", "TRUE", "yes", 1, "0", "", null, undefined])(
    "does not treat %p as a supervisor check",
    (value) => {
      expect(isWhiteCardVerified(value)).toBe(false);
    }
  );
});

describe("whiteCardNeedsReview", () => {
  it("flags a number that nobody has looked at", () => {
    expect(whiteCardNeedsReview({ WhiteCardNumber: "WC123" })).toBe(true);
  });

  it("flags a photograph with no number, because there is still something to look at", () => {
    expect(
      whiteCardNeedsReview({ WhiteCardImage: "data:image/jpeg;base64,abc" })
    ).toBe(true);
  });

  it("is clear once a supervisor has ticked", () => {
    expect(
      whiteCardNeedsReview({ WhiteCardNumber: "WC123", WhiteCardVerified: true })
    ).toBe(false);
    expect(
      whiteCardNeedsReview({ WhiteCardNumber: "WC123", WhiteCardVerified: "1" })
    ).toBe(false);
  });

  it("still needs review when the stored tick is the string true", () => {
    expect(
      whiteCardNeedsReview({
        WhiteCardNumber: "WC123",
        WhiteCardVerified: "true",
      })
    ).toBe(true);
  });

  it("is not an issuer problem when there is no card on file", () => {
    expect(whiteCardNeedsReview({})).toBe(false);
    expect(whiteCardNeedsReview(null)).toBe(false);
  });

  it("never turns an unchecked card into a sign-in block", () => {
    const states = evaluateCredentials(
      { WhiteCardNumber: "WC123", WhiteCardExpiry: asDate(days(90)) },
      { now: NOW, warnDays: 30 }
    );
    expect(whiteCardNeedsReview({ WhiteCardNumber: "WC123" })).toBe(true);
    expect(blockingCredentials(states)).toEqual([]);
  });
});

describe("nextWhiteCardVerified", () => {
  it("keeps a tick when the card did not change", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "WC123",
        previousVerified: true,
        ticked: true,
      })
    ).toBe(true);
  });

  it("clears the tick when the number changes and nobody re-ticks", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "WC999",
        previousVerified: true,
      })
    ).toBe(false);
  });

  it("keeps a tick in the same save as a new number, because they looked at the new card", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "WC999",
        previousVerified: true,
        ticked: true,
      })
    ).toBe(true);
  });

  it("treats a trimmed number as the same card", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "  WC123  ",
        previousVerified: true,
      })
    ).toBe(true);
  });

  it("clears the tick when the photograph changes and nobody re-ticks", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "WC123",
        previousVerified: true,
        imageChanged: true,
      })
    ).toBe(false);
  });

  it("keeps a tick in the same save as a new photograph", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "WC123",
        previousVerified: false,
        imageChanged: true,
        ticked: true,
      })
    ).toBe(true);
  });

  it("clears an omitted tick when the number is blanked", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "",
        previousVerified: "1",
      })
    ).toBe(false);
  });

  it("does not honour the string true as a tick", () => {
    expect(
      nextWhiteCardVerified({
        previousNumber: "WC123",
        nextNumber: "WC123",
        ticked: "true",
      })
    ).toBe(false);
  });
});
