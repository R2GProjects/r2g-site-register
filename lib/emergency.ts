import { linkedSiteId } from "@/lib/nocodb";

type Row = Record<string, unknown>;

export function linkedPersonId(record: Row): number | null {
  const person = record.Person as { Id?: unknown } | null;
  if (person && typeof person === "object" && typeof person.Id === "number") {
    return person.Id;
  }
  return typeof record.People_id === "number" ? record.People_id : null;
}

export function linkedVisitorId(record: Row): number | null {
  const visitor = record.Visitor as { Id?: unknown } | null;
  if (visitor && typeof visitor === "object" && typeof visitor.Id === "number") {
    return visitor.Id;
  }
  return typeof record.Visitors_id === "number" ? record.Visitors_id : null;
}

export function isVisitorAttendance(record: Row): boolean {
  return record.AttendanceType === "Visitor";
}

export interface SiteRoll {
  site: Row;
  workerCount: number;
  visitorCount: number;
  workers: Array<{ attendance: Row; person: Row | null }>;
  visitors: Array<{ attendance: Row; visitor: Row | null }>;
}

/**
 * Builds the per-site evacuation roll from records already fetched in bulk.
 *
 * A row whose person or visitor cannot be resolved is kept with null details
 * rather than dropped. On an evacuation, knowing an unidentified record exists
 * is more useful than a roll that quietly omits someone — and it keeps the
 * headline count equal to the number of rows actually listed.
 */
export function buildEvacuationRoll(
  activeSites: Row[],
  onSite: Row[],
  peopleById: Map<number, Row>,
  visitorsById: Map<number, Row>
): SiteRoll[] {
  const siteIds = new Set(activeSites.map((s) => s.Id as number));
  const relevant = onSite.filter((a) => {
    const id = linkedSiteId(a);
    return id != null && siteIds.has(id);
  });

  return activeSites.map((site) => {
    const forSite = relevant.filter((a) => linkedSiteId(a) === site.Id);

    const workers = forSite
      .filter((a) => !isVisitorAttendance(a))
      .map((attendance) => {
        const id = linkedPersonId(attendance);
        return { attendance, person: (id && peopleById.get(id)) || null };
      });

    const visitors = forSite.filter(isVisitorAttendance).map((attendance) => {
      const id = linkedVisitorId(attendance);
      return { attendance, visitor: (id && visitorsById.get(id)) || null };
    });

    return {
      site,
      workerCount: workers.length,
      visitorCount: visitors.length,
      workers,
      visitors,
    };
  });
}
