"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { dayKey, formatDay, formatHours, formatTime } from "@/lib/attendance";
import { hoursDecimal, type CompanyTimesheet, type PersonTimesheet } from "@/lib/timesheet";

interface Filters {
  siteId: string;
  companyId: string;
  personId: string;
  from: string;
  to: string;
}

function siteDay(offsetDays = 0): string {
  return dayKey(new Date(Date.now() + offsetDays * 86_400_000));
}

function thisMonth(): Filters {
  return {
    siteId: "",
    companyId: "",
    personId: "",
    from: `${siteDay().slice(0, 7)}-01`,
    to: siteDay(),
  };
}

interface SiteOption {
  Id: number;
  SiteName?: string;
  SiteCode?: string;
}

interface CompanyOption {
  Id: number;
  CompanyName?: string;
}

interface PersonOption {
  Id: number;
  FirstName?: string;
  LastName?: string;
}

interface TimesheetPayload {
  totalHours: number;
  openHours: number;
  openShifts: number;
  people: PersonTimesheet[];
  companies: CompanyTimesheet[];
  recordCount: number;
  capped: boolean;
}

type Group = "people" | "companies";

export default function TimesheetsPage() {
  const [filters, setFilters] = useState<Filters>(thisMonth);
  const [group, setGroup] = useState<Group>("people");
  const [report, setReport] = useState<TimesheetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filterParams = (f: Filters) => {
    const params = new URLSearchParams();
    if (f.siteId) params.set("siteId", f.siteId);
    if (f.companyId) params.set("companyId", f.companyId);
    if (f.personId) params.set("personId", f.personId);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    return params;
  };

  const load = useCallback((f: Filters) => {
    setLoading(true);
    fetch(`/api/admin/timesheets?${filterParams(f)}`)
      .then((r) => r.json())
      .then((data) => {
        setReport(data);
        setExpanded(new Set());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(thisMonth());
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/sites?limit=200")
      .then((r) => r.json())
      .then((data) => setSites(data.list || []))
      .catch(console.error);
    fetch("/api/admin/companies?limit=200")
      .then((r) => r.json())
      .then((data) => setCompanies(data.list || []))
      .catch(console.error);
    fetch("/api/admin/people?limit=200")
      .then((r) => r.json())
      .then((data) => setPeople(data.list || []))
      .catch(console.error);
  }, []);

  const applyFilters = (next: Partial<Filters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    load(merged);
  };

  const dateRangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasExtraFilters = Boolean(filters.siteId || filters.companyId || filters.personId);

  const rows = group === "people" ? report?.people || [] : report?.companies || [];
  const allExpanded = rows.length > 0 && expanded.size === rows.length;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setExpanded(allExpanded ? new Set() : new Set(rows.map((row) => row.key)));
  };

  const handleExport = (kind: "people" | "companies" | "shifts") => {
    window.open(
      `/api/admin/timesheets/export?${filterParams(filters)}&group=${kind}`,
      "_blank"
    );
  };

  const handlePrint = () => {
    setExpanded(new Set(rows.map((row) => row.key)));
    requestAnimationFrame(() => window.print());
  };

  const rangeLabel = [
    filters.from ? formatDay(filters.from) : "the start",
    filters.to ? formatDay(filters.to) : "now",
  ].join(" – ");

  const siteLabel = (site: SiteOption) =>
    site.SiteName || site.SiteCode || `Site #${site.Id}`;

  const personLabel = (person: PersonOption) =>
    `${person.FirstName || ""} ${person.LastName || ""}`.trim() || `Person #${person.Id}`;

  return (
    <div style={{ paddingTop: 24 }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>Timesheets</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => handleExport(group)}>
            Export {group === "people" ? "people" : "companies"}
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport("shifts")}>
            Export shifts
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            Print
          </button>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label htmlFor="ts-site">Site</label>
            <select
              id="ts-site"
              value={filters.siteId}
              onChange={(e) => applyFilters({ siteId: e.target.value })}
            >
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.Id} value={site.Id}>{siteLabel(site)}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label htmlFor="ts-company">Company</label>
            <select
              id="ts-company"
              value={filters.companyId}
              onChange={(e) => applyFilters({ companyId: e.target.value })}
            >
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.Id} value={company.Id}>
                  {company.CompanyName || `Company #${company.Id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label htmlFor="ts-person">Person</label>
            <select
              id="ts-person"
              value={filters.personId}
              onChange={(e) => applyFilters({ personId: e.target.value })}
            >
              <option value="">All people</option>
              {people.map((person) => (
                <option key={person.Id} value={person.Id}>{personLabel(person)}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="ts-from">From</label>
            <input
              id="ts-from"
              type="date"
              max={filters.to || undefined}
              value={filters.from}
              onChange={(e) => applyFilters({ from: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="ts-to">To</label>
            <input
              id="ts-to"
              type="date"
              min={filters.from || undefined}
              value={filters.to}
              onChange={(e) => applyFilters({ to: e.target.value })}
            />
          </div>

          {hasExtraFilters && (
            <button
              className="btn btn-secondary"
              onClick={() => applyFilters({ siteId: "", companyId: "", personId: "" })}
            >
              Clear people filters
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Quick range:</span>
          <button
            className="btn btn-secondary"
            style={{ minHeight: 30, padding: "3px 10px", fontSize: "0.8rem" }}
            onClick={() => applyFilters({ from: siteDay(), to: siteDay() })}
          >
            Today
          </button>
          <button
            className="btn btn-secondary"
            style={{ minHeight: 30, padding: "3px 10px", fontSize: "0.8rem" }}
            onClick={() => applyFilters({ from: siteDay(-6), to: siteDay() })}
          >
            Last 7 days
          </button>
          <button
            className="btn btn-secondary"
            style={{ minHeight: 30, padding: "3px 10px", fontSize: "0.8rem" }}
            onClick={() => applyFilters({ from: siteDay(-29), to: siteDay() })}
          >
            Last 30 days
          </button>
          <button
            className="btn btn-secondary"
            style={{ minHeight: 30, padding: "3px 10px", fontSize: "0.8rem" }}
            onClick={() => applyFilters({ from: `${siteDay().slice(0, 7)}-01`, to: siteDay() })}
          >
            This month
          </button>
          {(filters.from || filters.to) && (
            <button
              className="btn btn-secondary"
              style={{ minHeight: 30, padding: "3px 10px", fontSize: "0.8rem" }}
              onClick={() => applyFilters({ from: "", to: "" })}
            >
              All time
            </button>
          )}
        </div>

        {dateRangeInvalid && (
          <p style={{ color: "var(--danger, #c00)", fontSize: "0.8rem", marginTop: 8, marginBottom: 0 }}>
            The “From” date is after the “To” date, so nothing will match.
          </p>
        )}
      </div>

      <div className="print-only" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 4px" }}>Timesheets</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>{rangeLabel}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatHours(report?.totalHours || 0)}
          </p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            Total hours · {hoursDecimal(report?.totalHours || 0)}
          </p>
        </div>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{report?.people.length || 0}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>People</p>
        </div>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{report?.companies.length || 0}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Companies</p>
        </div>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {report?.openShifts || 0}
          </p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            Still on site
            {report?.openHours ? ` · ${formatHours(report.openHours)}` : ""}
          </p>
        </div>
      </div>

      {report?.openShifts ? (
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 0 }}>
          Totals include time still on site, counted up to now. Close those
          shifts before using the numbers for pay or invoice.
        </p>
      ) : null}

      {report?.capped ? (
        <p style={{ color: "var(--danger, #c00)", fontSize: "0.8rem" }}>
          This view is capped at 2,000 sign-ins. Narrow the dates so a long
          history is not truncated.
        </p>
      ) : null}

      <div className="card">
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={group === "people" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => { setGroup("people"); setExpanded(new Set()); }}
            >
              By person
            </button>
            <button
              className={group === "companies" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => { setGroup("companies"); setExpanded(new Set()); }}
            >
              By company
            </button>
          </div>
          {rows.length > 0 && (
            <button
              className="btn btn-secondary"
              style={{ minHeight: 32, padding: "4px 10px", fontSize: "0.8rem" }}
              onClick={toggleAll}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            No hours in this range.
          </p>
        ) : group === "people" ? (
          <PersonTable
            people={report!.people}
            expanded={expanded}
            onToggle={toggle}
          />
        ) : (
          <CompanyTable
            companies={report!.companies}
            expanded={expanded}
            onToggle={toggle}
          />
        )}
      </div>
    </div>
  );
}

function PersonTable({
  people,
  expanded,
  onToggle,
}: {
  people: PersonTimesheet[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }} aria-label="Expand" />
            <th>Name</th>
            <th>Company</th>
            <th>Days</th>
            <th>Shifts</th>
            <th>Hours</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const open = expanded.has(person.key);
            return (
              <Fragment key={person.key}>
                <tr onClick={() => onToggle(person.key)} style={{ cursor: "pointer", fontWeight: 600 }}>
                  <td>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`${open ? "Collapse" : "Expand"} ${person.name}`}
                      onClick={(e) => { e.stopPropagation(); onToggle(person.key); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "0.8rem", padding: 0 }}
                    >
                      {open ? "▼" : "▶"}
                    </button>
                  </td>
                  <td>
                    {person.name}
                    {person.kind === "visitor" ? (
                      <span className="badge badge-pending" style={{ marginLeft: 6 }}>Visitor</span>
                    ) : null}
                    {person.openShifts ? (
                      <span className="badge badge-onsite" style={{ marginLeft: 6 }}>In</span>
                    ) : null}
                  </td>
                  <td style={{ fontWeight: 400 }}>{person.company}</td>
                  <td style={{ fontWeight: 400 }}>{person.days}</td>
                  <td style={{ fontWeight: 400 }}>{person.entries}</td>
                  <td>{formatHours(person.hours)}</td>
                </tr>
                {open && person.shifts.map((shift, i) => (
                  <tr key={`${person.key}-${shift.day}-${i}`}>
                    <td />
                    <td colSpan={2} style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                      {formatDay(shift.day)}
                      {shift.siteName ? ` · ${shift.siteName}` : ""}
                      {shift.company !== person.company ? ` · ${shift.company}` : ""}
                    </td>
                    <td>{shift.inAt ? formatTime(shift.inAt) : "—"}</td>
                    <td>
                      {shift.onSite
                        ? <span className="badge badge-onsite">Still on site</span>
                        : shift.outAt
                          ? formatTime(shift.outAt)
                          : "—"}
                    </td>
                    <td>{formatHours(shift.hours)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompanyTable({
  companies,
  expanded,
  onToggle,
}: {
  companies: CompanyTimesheet[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }} aria-label="Expand" />
            <th>Company</th>
            <th>People</th>
            <th>Days</th>
            <th>Shifts</th>
            <th>Hours</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const open = expanded.has(company.key);
            return (
              <Fragment key={company.key}>
                <tr onClick={() => onToggle(company.key)} style={{ cursor: "pointer", fontWeight: 600 }}>
                  <td>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`${open ? "Collapse" : "Expand"} ${company.name}`}
                      onClick={(e) => { e.stopPropagation(); onToggle(company.key); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "0.8rem", padding: 0 }}
                    >
                      {open ? "▼" : "▶"}
                    </button>
                  </td>
                  <td>
                    {company.name}
                    {company.openShifts ? (
                      <span className="badge badge-onsite" style={{ marginLeft: 6 }}>In</span>
                    ) : null}
                  </td>
                  <td style={{ fontWeight: 400 }}>{company.people}</td>
                  <td style={{ fontWeight: 400 }}>{company.days}</td>
                  <td style={{ fontWeight: 400 }}>{company.entries}</td>
                  <td>{formatHours(company.hours)}</td>
                </tr>
                {open && company.persons.map((person) => (
                  <tr key={`${company.key}-${person.key}`}>
                    <td />
                    <td>
                      {person.name}
                      {person.kind === "visitor" ? (
                        <span className="badge badge-pending" style={{ marginLeft: 6 }}>Visitor</span>
                      ) : null}
                    </td>
                    <td colSpan={3} style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                      {person.days} {person.days === 1 ? "day" : "days"}
                      {" · "}
                      {person.entries} {person.entries === 1 ? "shift" : "shifts"}
                    </td>
                    <td>{formatHours(person.hours)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
