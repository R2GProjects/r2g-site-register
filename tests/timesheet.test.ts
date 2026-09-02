import { describe, expect, it } from "vitest";
import { siteLocalInstant } from "@/lib/attendance";
import {
  NO_COMPANY,
  buildTimesheets,
  csvCell,
  hoursDecimal,
  recordMatchesCompany,
  timesheetCompaniesCsv,
  timesheetCompany,
  timesheetPeopleCsv,
  timesheetShiftsCsv,
  timesheetSubject,
} from "@/lib/timesheet";

function sydney(day: string, hours: number, minutes = 0): string {
  const instant = siteLocalInstant(day, hours, minutes);
  if (instant === null) throw new Error(`bad fixture: ${day}`);
  return new Date(instant).toISOString();
}

const ann = { Id: 1, FirstName: "Ann", LastName: "Lee" };
const bob = { Id: 2, FirstName: "Bob", LastName: "Ng" };
const acme = { Id: 10, CompanyName: "Acme Pty Ltd" };
const beta = { Id: 11, CompanyName: "Beta Civil" };

describe("timesheetSubject", () => {
  it("keys a worker by person id, not by display name", () => {
    expect(
      timesheetSubject({ People_id: 1, Person: ann }).key
    ).toBe("person:1");
    expect(
      timesheetSubject({
        People_id: 9,
        Person: { Id: 9, FirstName: "Ann", LastName: "Lee" },
      }).key
    ).toBe("person:9");
  });

  it("keys a visitor separately from a worker", () => {
    const subject = timesheetSubject({
      Visitors_id: 7,
      Visitor: { Id: 7, FirstName: "Pat", LastName: "Cole" },
    });
    expect(subject).toMatchObject({
      key: "visitor:7",
      kind: "visitor",
      name: "Pat Cole",
    });
  });

  it("falls back to Unknown when there is no identity", () => {
    expect(timesheetSubject({}).kind).toBe("unknown");
  });
});

describe("timesheetCompany", () => {
  it("prefers the company stamped on the attendance row", () => {
    expect(
      timesheetCompany({
        Company: acme,
        Person: { ...ann, Company: beta },
      })
    ).toEqual({ key: "company:10", name: "Acme Pty Ltd", companyId: 10 });
  });

  it("falls back to the person record when the attendance row has none", () => {
    expect(
      timesheetCompany({ Person: { ...ann, Company: acme } })
    ).toEqual({ key: "company:10", name: "Acme Pty Ltd", companyId: 10 });
  });

  it("keeps a visitor's typed name when there is no company row", () => {
    expect(
      timesheetCompany({
        Visitor: { Id: 7, CompanyName: "Walk-in Electrical" },
      })
    ).toEqual({
      key: "name:walk-in electrical",
      name: "Walk-in Electrical",
      companyId: null,
    });
  });

  it("uses a bare company id when the name has not been attached", () => {
    expect(timesheetCompany({ Companies_id: 10, Company: 10 })).toEqual({
      key: "company:10",
      name: "Company #10",
      companyId: 10,
    });
  });

  it("does not invent a company", () => {
    expect(timesheetCompany({ Person: ann })).toEqual({
      key: "none",
      name: NO_COMPANY,
      companyId: null,
    });
  });
});

describe("recordMatchesCompany", () => {
  it("matches a visitor who typed the same name as the company row", () => {
    expect(
      recordMatchesCompany(
        { Visitor: { Id: 7, CompanyName: "acme pty ltd" } },
        10,
        "Acme Pty Ltd"
      )
    ).toBe(true);
  });

  it("does not match a different contractor", () => {
    expect(
      recordMatchesCompany({ Company: beta }, 10, "Acme Pty Ltd")
    ).toBe(false);
  });
});

describe("buildTimesheets", () => {
  const now = new Date(sydney("2026-09-02", 16)).getTime();

  const records = [
    {
      SignInTime: sydney("2026-09-01", 7),
      SignOutTime: sydney("2026-09-01", 15),
      Status: "SignedOut",
      AttendanceType: "Contractor",
      People_id: 1,
      Person: ann,
      Company: acme,
      Site: { SiteName: "Gatehouse", SiteCode: "GH1" },
    },
    {
      SignInTime: sydney("2026-09-02", 7),
      SignOutTime: sydney("2026-09-02", 11),
      Status: "SignedOut",
      AttendanceType: "Contractor",
      People_id: 1,
      Person: ann,
      Company: acme,
      Site: { SiteName: "Gatehouse", SiteCode: "GH1" },
    },
    {
      SignInTime: sydney("2026-09-01", 8),
      SignOutTime: sydney("2026-09-01", 12),
      Status: "SignedOut",
      AttendanceType: "Contractor",
      People_id: 2,
      Person: bob,
      Company: beta,
      Site: { SiteName: "Yard", SiteCode: "YD1" },
    },
  ];

  it("totals hours across every usable record", () => {
    const report = buildTimesheets(records, now);
    expect(report.totalHours).toBe(16);
    expect(report.openShifts).toBe(0);
  });

  it("rolls two days for the same person into one row", () => {
    const annRow = buildTimesheets(records, now).people.find(
      (p) => p.key === "person:1"
    )!;
    expect(annRow.hours).toBe(12);
    expect(annRow.days).toBe(2);
    expect(annRow.entries).toBe(2);
    expect(annRow.company).toBe("Acme Pty Ltd");
  });

  it("keeps two people with the same name as two rows", () => {
    const report = buildTimesheets(
      [
        {
          SignInTime: sydney("2026-09-01", 7),
          SignOutTime: sydney("2026-09-01", 8),
          Status: "SignedOut",
          People_id: 1,
          Person: ann,
          Company: acme,
        },
        {
          SignInTime: sydney("2026-09-01", 9),
          SignOutTime: sydney("2026-09-01", 10),
          Status: "SignedOut",
          People_id: 9,
          Person: { Id: 9, FirstName: "Ann", LastName: "Lee" },
          Company: acme,
        },
      ],
      now
    );
    expect(report.people).toHaveLength(2);
    expect(report.companies[0].people).toBe(2);
  });

  it("sorts people by name", () => {
    expect(buildTimesheets(records, now).people.map((p) => p.name)).toEqual([
      "Ann Lee",
      "Bob Ng",
    ]);
  });

  it("lists each contractor, with No company last", () => {
    const report = buildTimesheets(
      [
        ...records,
        {
          SignInTime: sydney("2026-09-01", 9),
          SignOutTime: sydney("2026-09-01", 10),
          Status: "SignedOut",
          People_id: 3,
          Person: { Id: 3, FirstName: "Kim", LastName: "Orr" },
        },
      ],
      now
    );
    expect(report.companies.map((c) => c.name)).toEqual([
      "Acme Pty Ltd",
      "Beta Civil",
      NO_COMPANY,
    ]);
  });

  it("folds a visitor who typed the company name into that company", () => {
    const report = buildTimesheets(
      [
        records[0],
        {
          SignInTime: sydney("2026-09-01", 10),
          SignOutTime: sydney("2026-09-01", 11),
          Status: "SignedOut",
          AttendanceType: "Visitor",
          Visitors_id: 7,
          Visitor: {
            Id: 7,
            FirstName: "Pat",
            LastName: "Cole",
            CompanyName: "acme pty ltd",
          },
        },
      ],
      now
    );
    expect(report.companies).toHaveLength(1);
    expect(report.companies[0].people).toBe(2);
    expect(report.companies[0].hours).toBe(9);
  });

  it("splits one person across two companies on the company report", () => {
    const report = buildTimesheets(
      [
        records[0],
        {
          SignInTime: sydney("2026-09-02", 7),
          SignOutTime: sydney("2026-09-02", 9),
          Status: "SignedOut",
          People_id: 1,
          Person: ann,
          Company: beta,
        },
      ],
      now
    );
    const annRow = report.people.find((p) => p.key === "person:1")!;
    expect(annRow.hours).toBe(10);
    expect(annRow.company).toBe("Acme Pty Ltd");
    const acmeRow = report.companies.find((c) => c.companyId === 10)!;
    const betaRow = report.companies.find((c) => c.companyId === 11)!;
    expect(acmeRow.persons[0].hours).toBe(8);
    expect(betaRow.persons[0].hours).toBe(2);
  });

  it("counts an open shift against now and flags it", () => {
    const report = buildTimesheets(
      [
        {
          SignInTime: sydney("2026-09-02", 7),
          SignOutTime: null,
          Status: "OnSite",
          People_id: 1,
          Person: ann,
          Company: acme,
        },
      ],
      now
    );
    expect(report.openShifts).toBe(1);
    expect(report.openHours).toBe(9);
    expect(report.people[0].openShifts).toBe(1);
    expect(report.people[0].hours).toBe(9);
    expect(report.people[0].shifts[0].onSite).toBe(true);
  });

  it("keeps overnight hours on the sign-in day and still shows the sign-out", () => {
    const out = sydney("2026-09-02", 6);
    const report = buildTimesheets(
      [
        {
          SignInTime: sydney("2026-09-01", 22),
          SignOutTime: out,
          Status: "SignedOut",
          People_id: 1,
          Person: ann,
          Company: acme,
        },
      ],
      now
    );
    expect(report.people[0].days).toBe(1);
    expect(report.people[0].shifts[0].day).toBe("2026-09-01");
    expect(report.people[0].shifts[0].outAt).toBe(out);
    expect(report.people[0].hours).toBe(8);
  });

  it("skips a record with no usable sign-in", () => {
    const report = buildTimesheets(
      [{ SignInTime: null, Status: "OnSite", Person: ann }],
      now
    );
    expect(report.people).toEqual([]);
    expect(report.companies).toEqual([]);
    expect(report.totalHours).toBe(0);
  });

  it("returns empty totals for no records", () => {
    const report = buildTimesheets([]);
    expect(report.totalHours).toBe(0);
    expect(report.openHours).toBe(0);
    expect(report.people).toEqual([]);
    expect(report.companies).toEqual([]);
  });
});

describe("csv", () => {
  it("doubles quotes inside a field so a company name cannot break the row", () => {
    expect(csvCell('Acme "Gate" Pty')).toBe('"Acme ""Gate"" Pty"');
  });

  it("writes hours to two decimal places, never a negative", () => {
    expect(hoursDecimal(8.255)).toBe("8.26");
    expect(hoursDecimal(-1)).toBe("0.00");
    expect(hoursDecimal(Number.NaN)).toBe("0.00");
  });

  it("writes a people summary that payroll can total", () => {
    const csv = timesheetPeopleCsv([
      {
        key: "person:1",
        kind: "person",
        name: "Ann Lee",
        personId: 1,
        visitorId: null,
        company: "Acme Pty Ltd",
        companyId: 10,
        hours: 8,
        days: 1,
        openShifts: 0,
        entries: 1,
        shifts: [],
      },
    ]);
    expect(csv).toContain('"Ann Lee"');
    expect(csv).toContain('"8.00"');
    expect(csv.split("\n")[0]).toContain("Hours");
  });

  it("writes one row per shift so a spreadsheet can pivot", () => {
    const csv = timesheetShiftsCsv([
      {
        key: "person:1",
        kind: "person",
        name: "Ann Lee",
        personId: 1,
        visitorId: null,
        company: "Acme Pty Ltd",
        companyId: 10,
        hours: 8,
        days: 1,
        openShifts: 0,
        entries: 1,
        shifts: [
          {
            day: "2026-09-01",
            siteName: "Gatehouse",
            siteCode: "GH1",
            company: "Acme Pty Ltd",
            companyKey: "company:10",
            inAt: sydney("2026-09-01", 7),
            outAt: sydney("2026-09-01", 15),
            hours: 8,
            onSite: false,
            type: "Contractor",
            status: "SignedOut",
          },
        ],
      },
    ]);
    expect(csv).toContain('"GH1"');
    expect(csv).toContain('"2026-09-01"');
  });

  it("writes a company summary", () => {
    const csv = timesheetCompaniesCsv([
      {
        key: "company:10",
        name: "Acme Pty Ltd",
        companyId: 10,
        hours: 12,
        people: 2,
        days: 1,
        openShifts: 0,
        entries: 2,
        persons: [],
      },
    ]);
    expect(csv).toContain('"Acme Pty Ltd"');
    expect(csv).toContain('"12.00"');
  });
});
