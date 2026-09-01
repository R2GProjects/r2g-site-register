import { describe, expect, it } from "vitest";
import { buildEvacuationRoll } from "@/lib/emergency";

const sites = [
  { Id: 1, SiteName: "Building 5" },
  { Id: 2, SiteName: "Tower A" },
];

const people = new Map<number, Record<string, unknown>>([
  [10, { Id: 10, FirstName: "Ann" }],
  [11, { Id: 11, FirstName: "Bob" }],
]);

const visitors = new Map<number, Record<string, unknown>>([
  [90, { Id: 90, FirstName: "Vic" }],
]);

const onSite = [
  { Id: 100, AttendanceType: "Worker", Site: { Id: 1 }, Person: { Id: 10 } },
  { Id: 101, AttendanceType: "Worker", Sites_id: 1, People_id: 11 },
  { Id: 102, AttendanceType: "Visitor", Site: { Id: 1 }, Visitor: { Id: 90 } },
  { Id: 103, AttendanceType: "Worker", Site: { Id: 2 }, Person: { Id: 10 } },
  { Id: 104, AttendanceType: "Worker", Site: { Id: 99 }, Person: { Id: 11 } },
  { Id: 105, AttendanceType: "Worker", Site: { Id: 1 }, Person: { Id: 77 } },
];

const roll = buildEvacuationRoll(sites, onSite, people, visitors);
const building5 = roll.find((s) => s.site.Id === 1)!;
const towerA = roll.find((s) => s.site.Id === 2)!;

describe("buildEvacuationRoll", () => {
  it("groups people onto the site they are signed in at", () => {
    expect(building5.workerCount).toBe(3);
    expect(building5.visitorCount).toBe(1);
    expect(towerA.workerCount).toBe(1);
    expect(towerA.visitorCount).toBe(0);
  });

  it("excludes records for sites that are not active", () => {
    const ids = roll.flatMap((s) => s.workers.map((w) => w.attendance.Id));
    expect(ids).not.toContain(104);
  });

  it("resolves both link shapes the data uses", () => {
    const nested = building5.workers.find((w) => w.attendance.Id === 100)!;
    const flat = building5.workers.find((w) => w.attendance.Id === 101)!;
    expect(nested.person?.FirstName).toBe("Ann");
    expect(flat.person?.FirstName).toBe("Bob");
    expect(building5.visitors[0].visitor?.FirstName).toBe("Vic");
  });

  it("lists someone signed in at two sites on both rolls", () => {
    expect(building5.workers.some((w) => w.person?.Id === 10)).toBe(true);
    expect(towerA.workers.some((w) => w.person?.Id === 10)).toBe(true);
  });

  it("keeps an unidentifiable record rather than hiding it", () => {
    const orphan = building5.workers.find((w) => w.attendance.Id === 105);
    expect(orphan).toBeDefined();
    expect(orphan!.person).toBeNull();
  });

  it("reports a count equal to the rows actually listed", () => {
    for (const site of roll) {
      expect(site.workerCount).toBe(site.workers.length);
      expect(site.visitorCount).toBe(site.visitors.length);
    }
  });

  it("never mixes visitors into the worker list", () => {
    expect(
      building5.workers.some((w) => w.attendance.AttendanceType === "Visitor")
    ).toBe(false);
    expect(
      building5.visitors.some((v) => v.attendance.AttendanceType !== "Visitor")
    ).toBe(false);
  });

  it("returns nothing when there are no active sites", () => {
    expect(buildEvacuationRoll([], onSite, people, visitors)).toEqual([]);
  });

  it("still lists a site with nobody on it", () => {
    const empty = buildEvacuationRoll(sites, [], people, visitors);
    expect(empty).toHaveLength(2);
    expect(empty.every((s) => s.workerCount === 0 && s.visitorCount === 0)).toBe(
      true
    );
  });
});
