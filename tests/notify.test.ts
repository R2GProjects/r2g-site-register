import { describe, expect, it } from "vitest";
import { siteLocalInstant } from "@/lib/attendance";
import {
  isAfterHours,
  notifyAddress,
  planSignOutReminder,
  reminderEmail,
  summaryDedupeKey,
  summaryEmail,
  managerAddress,
  type NotifyClock,
} from "@/lib/notify";

const clock: NotifyClock = {
  cutoff: { hours: 18, minutes: 0 },
  maxHours: 12,
};

function sydney(day: string, hours: number, minutes = 0): string {
  const instant = siteLocalInstant(day, hours, minutes);
  if (instant === null) throw new Error(`bad fixture: ${day}`);
  return new Date(instant).toISOString();
}

function at(day: string, hours: number, minutes = 0): number {
  return new Date(sydney(day, hours, minutes)).getTime();
}

describe("planSignOutReminder", () => {
  it("does not nag during the working day", () => {
    const plan = planSignOutReminder(
      { signInTime: sydney("2026-09-02", 7) },
      clock,
      at("2026-09-02", 16)
    );
    expect(plan).toEqual({ remind: false, reason: "beforeCutoff" });
  });

  it("reminds a day-shift worker still on the register after knock-off", () => {
    const plan = planSignOutReminder(
      { signInTime: sydney("2026-09-02", 7) },
      clock,
      at("2026-09-02", 18, 15)
    );
    expect(plan).toEqual({ remind: true });
  });

  it("leaves a night-shift worker who signed in after cut-off", () => {
    const plan = planSignOutReminder(
      { signInTime: sydney("2026-09-02", 18, 10) },
      clock,
      at("2026-09-02", 18, 15)
    );
    expect(plan).toEqual({ remind: false, reason: "nightShift" });
  });

  it("does not remind once auto-close is due to stamp the record", () => {
    const plan = planSignOutReminder(
      { signInTime: sydney("2026-09-01", 7) },
      clock,
      at("2026-09-02", 18, 15)
    );
    expect(plan).toEqual({ remind: false, reason: "dueAutoClose" });
  });

  it("does not send a second reminder for the same attendance", () => {
    const plan = planSignOutReminder(
      {
        signInTime: sydney("2026-09-02", 7),
        remindedAt: sydney("2026-09-02", 18, 5),
      },
      clock,
      at("2026-09-02", 18, 15)
    );
    expect(plan).toEqual({ remind: false, reason: "already" });
  });

  it("fires at the cut-off, not a minute before", () => {
    expect(
      planSignOutReminder(
        { signInTime: sydney("2026-09-02", 7) },
        clock,
        at("2026-09-02", 18) - 1
      )
    ).toEqual({ remind: false, reason: "beforeCutoff" });
    expect(
      planSignOutReminder(
        { signInTime: sydney("2026-09-02", 7) },
        clock,
        at("2026-09-02", 18)
      )
    ).toEqual({ remind: true });
  });

  it.each([null, "", "nope"])("skips an unreadable sign-in of %p", (value) => {
    expect(
      planSignOutReminder({ signInTime: value }, clock, at("2026-09-02", 18, 15))
    ).toEqual({ remind: false, reason: "badTime" });
  });
});

describe("isAfterHours", () => {
  it("flags a tap at cut-off and later", () => {
    expect(isAfterHours(sydney("2026-09-02", 18), clock.cutoff)).toBe(true);
    expect(isAfterHours(sydney("2026-09-02", 19), clock.cutoff)).toBe(true);
  });

  it("does not flag a 7am start", () => {
    expect(isAfterHours(sydney("2026-09-02", 7), clock.cutoff)).toBe(false);
    expect(isAfterHours(sydney("2026-09-02", 17, 59), clock.cutoff)).toBe(false);
  });
});

describe("notifyAddress", () => {
  it("accepts a normal address", () => {
    expect(notifyAddress(" Sam@R2GProjects.com.au ")).toBe("sam@r2gprojects.com.au");
  });

  it.each(["", "not-an-email", "a@b", "@x.com", "a@b.c ".repeat(40)])(
    "rejects %p",
    (value) => {
      expect(notifyAddress(value)).toBeNull();
    }
  );
});

describe("reminderEmail / summaryEmail", () => {
  it("names the site and the sign-in time", () => {
    const mail = reminderEmail({
      firstName: "Sam",
      siteName: "Building 5",
      signedInAt: sydney("2026-09-02", 7),
    });
    expect(mail.subject).toMatch(/Building 5/);
    expect(mail.text).toMatch(/Hi Sam/);
    expect(mail.text).toMatch(/Building 5/);
  });

  it("lists who is still on site and who came in after knock-off", () => {
    const mail = summaryEmail({
      siteName: "Building 5",
      date: "2026-09-02",
      stillOnSite: [
        { name: "Sam Lee", signedInAt: sydney("2026-09-02", 7), onSite: true, afterHours: false },
      ],
      signedInToday: 8,
      signedOutToday: 6,
      afterHours: [
        { name: "Jane Doe", signedInAt: sydney("2026-09-02", 19), onSite: true, afterHours: true },
      ],
    });
    expect(mail.subject).toMatch(/Building 5/);
    expect(mail.text).toMatch(/Sam Lee/);
    expect(mail.text).toMatch(/Jane Doe/);
    expect(mail.text).toMatch(/Signed in today: 8/);
  });

  it("says so when the site is empty", () => {
    const mail = summaryEmail({
      siteName: "Building 5",
      date: "2026-09-02",
      stillOnSite: [],
      signedInToday: 0,
      signedOutToday: 0,
      afterHours: [],
    });
    expect(mail.text).toMatch(/Nobody is still signed in/);
  });
});

describe("managerAddress", () => {
  it("prefers the site manager, then the company-wide fallback", () => {
    expect(
      managerAddress({ SiteManagerEmail: "sinan@site.test" }, { NOTIFY_DEFAULT_TO: "ops@r2g.test" })
    ).toBe("sinan@site.test");
    expect(
      managerAddress({ SiteManagerEmail: "" }, { NOTIFY_DEFAULT_TO: "ops@r2g.test" })
    ).toBe("ops@r2g.test");
    expect(managerAddress({}, {})).toBeNull();
  });
});

describe("summaryDedupeKey", () => {
  it("is one send per site per local day", () => {
    expect(summaryDedupeKey(11, "2026-09-02")).toBe("11:2026-09-02");
  });
});
