"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { dayKey, formatDay, formatHours, formatTime, personName, thisMonthRange } from "@/lib/attendance";
import type { DayPerson } from "@/lib/attendance";

interface Filters {
  status: string;
  siteId: string;
  from: string;
  to: string;
}

function defaultFilters(): Filters {
  const { from, to } = thisMonthRange();
  return { status: "", siteId: "", from, to };
}

/** Calendar day in the site's timezone, offset by whole days. */
function siteDay(offsetDays = 0): string {
  return dayKey(new Date(Date.now() + offsetDays * 86_400_000));
}

interface DaySummary {
  date: string;
  hours: number;
  names: string[];
  count: number;
  people: DayPerson[];
}

interface AttendanceSummary {
  totalHours: number;
  onsiteNames: string[];
  byDay: DaySummary[];
}

interface SiteOption {
  Id: number;
  SiteName?: string;
  SiteCode?: string;
}

export default function AttendancePage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [capped, setCapped] = useState(false);
  const [summary, setSummary] = useState<AttendanceSummary>({
    totalHours: 0,
    onsiteNames: [],
    byDay: [],
  });

  const filterParams = (f: Filters) => {
    const params = new URLSearchParams();
    if (f.status) params.set("status", f.status);
    if (f.siteId) params.set("siteId", f.siteId);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    return params;
  };

  const load = useCallback((p: number, f: Filters) => {
    setLoading(true);
    const params = filterParams(f);
    params.set("page", String(p));
    params.set("limit", "50");
    if (p > 0) params.set("summary", "0");
    fetch(`/api/admin/attendance?${params}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.list || []);
        setTotal(data.totalRows || 0);
        if (data.summary) {
          setSummary(data.summary);
          setCapped(Boolean(data.capped));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0, defaultFilters()); }, [load]);

  useEffect(() => {
    fetch("/api/admin/sites?limit=200")
      .then(r => r.json())
      .then(data => setSites(data.list || []))
      .catch(console.error);
  }, []);

  const applyFilters = (next: Partial<Filters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    setPage(0);
    setExpandedDays(new Set());
    load(0, merged);
  };

  const dateRangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const defaults = defaultFilters();
  const hasFilters = Boolean(
    filters.status ||
    filters.siteId ||
    filters.from !== defaults.from ||
    filters.to !== defaults.to
  );

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const allExpanded = summary.byDay.length > 0 && expandedDays.size === summary.byDay.length;

  const toggleAllDays = () => {
    setExpandedDays(allExpanded ? new Set() : new Set(summary.byDay.map(d => d.date)));
  };

  const statusClass = (s: string) => {
    if (s === "OnSite") return "badge badge-onsite";
    if (s === "SignedOut") return "badge badge-signedout";
    if (s === "EmergencyEvacuated") return "badge badge-suspended";
    return "badge badge-pending";
  };

  const handleExport = () => {
    window.open(`/api/admin/attendance/export?${filterParams(filters)}`, "_blank");
  };

  const handleManualSignOut = async (attendanceId: number) => {
    if (!confirm("Manually sign out this attendance record?")) return;
    try {
      await fetch("/api/admin/attendance/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId }),
      });
      load(page, filters);
    } catch { alert("Failed to sign out"); }
  };

  const siteLabel = (site: SiteOption) =>
    site.SiteName || site.SiteCode || `Site #${site.Id}`;

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Attendance ({total})</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn btn-secondary" href="/admin/timesheets">Timesheets</a>
          <button className="btn btn-secondary" onClick={handleExport}>📥 Export CSV</button>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label htmlFor="filter-site">Site</label>
            <select
              id="filter-site"
              value={filters.siteId}
              onChange={e => applyFilters({ siteId: e.target.value })}
            >
              <option value="">All sites</option>
              {sites.map(site => (
                <option key={site.Id} value={site.Id}>{siteLabel(site)}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={e => applyFilters({ status: e.target.value })}
            >
              <option value="">All statuses</option>
              <option value="OnSite">OnSite</option>
              <option value="SignedOut">SignedOut</option>
              <option value="EmergencyEvacuated">EmergencyEvacuated</option>
              <option value="AutoClosed">AutoClosed</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filter-from">From</label>
            <input
              id="filter-from"
              type="date"
              max={filters.to || undefined}
              value={filters.from}
              onChange={e => applyFilters({ from: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="filter-to">To</label>
            <input
              id="filter-to"
              type="date"
              min={filters.from || undefined}
              value={filters.to}
              onChange={e => applyFilters({ to: e.target.value })}
            />
          </div>

          {hasFilters && (
            <button className="btn btn-secondary" onClick={() => applyFilters(defaultFilters())}>
              Clear filters
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
            onClick={() => {
              const { from, to } = thisMonthRange();
              applyFilters({ from, to });
            }}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{formatHours(summary.totalHours)}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Total hours logged</p>
          {capped && (
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
              Summary covers the 2,000 most recent matching records. Narrow the dates.
            </p>
          )}
        </div>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{summary.onsiteNames.length}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>People currently on site</p>
        </div>
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 8 }}>People logged in now</p>
        {summary.onsiteNames.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>No one is currently on site.</p>
        ) : (
          <p>{summary.onsiteNames.join(", ")}</p>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <p style={{ fontWeight: 600, margin: 0 }}>Hours logged per day</p>
          {summary.byDay.length > 0 && (
            <button
              className="btn btn-secondary"
              style={{ minHeight: 32, padding: "4px 10px", fontSize: "0.8rem" }}
              onClick={toggleAllDays}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
        {summary.byDay.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>No attendance yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }} aria-label="Expand" />
                  <th>Date</th>
                  <th>Name</th>
                  <th>Logged in</th>
                  <th>Logged out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {summary.byDay.map(day => {
                  const open = expandedDays.has(day.date);
                  return (
                    <Fragment key={day.date}>
                      <tr
                        onClick={() => toggleDay(day.date)}
                        style={{ cursor: "pointer", fontWeight: 600 }}
                      >
                        <td>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={`${open ? "Collapse" : "Expand"} ${formatDay(day.date)}`}
                            onClick={e => { e.stopPropagation(); toggleDay(day.date); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "0.8rem", padding: 0 }}
                          >
                            {open ? "▼" : "▶"}
                          </button>
                        </td>
                        <td>{formatDay(day.date)}</td>
                        <td colSpan={3} style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.875rem" }}>
                          {day.names.length} {day.names.length === 1 ? "person" : "people"}
                          {" · "}
                          {day.count} {day.count === 1 ? "entry" : "entries"}
                        </td>
                        <td>{formatHours(day.hours)}</td>
                      </tr>
                      {open && day.people?.map((person, i) => (
                        <tr key={`${day.date}-${person.name}-${i}`}>
                          <td />
                          <td />
                          <td>
                            <span className={`signin-dot ${person.onSite ? "in" : "out"}`} />
                            {person.name}
                            {" "}
                            {person.onSite
                              ? <span className="badge badge-onsite">In</span>
                              : <span className="badge badge-signedout">Out</span>}
                          </td>
                          <td>{person.inAt ? formatTime(person.inAt) : "—"}</td>
                          <td>
                            {person.onSite
                              ? <span className="badge badge-onsite">Still on site</span>
                              : person.outAt
                                ? formatTime(person.outAt)
                                : "Out on another day"}
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
        )}
      </div>

      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Site</th><th>Person</th><th>Type</th><th>Sign In</th><th>Sign Out</th><th>Hours</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map(a => (
                <tr key={a.Id as number}>
                  <td title={(a.Site as { Address?: string })?.Address || ""}>
                    <div>{(a.Site as { SiteName?: string })?.SiteName || "Unknown site"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      {(a.Site as { SiteCode?: string })?.SiteCode || (a.Sites_id ? `Site #${a.Sites_id}` : "")}
                    </div>
                  </td>
                  <td>
                    <span className={`signin-dot ${a.Status === "OnSite" ? "in" : "out"}`} />
                    {personName(a)}
                    {" "}
                    {a.Status === "OnSite"
                      ? <span className="badge badge-onsite">In</span>
                      : <span className="badge badge-signedout">Out</span>}
                  </td>
                  <td>{(a.AttendanceType as string) || "-"}</td>
                  <td>{a.SignInTime ? new Date(a.SignInTime as string).toLocaleString() : "-"}</td>
                  <td>{a.SignOutTime ? new Date(a.SignOutTime as string).toLocaleString() : "-"}</td>
                  <td>{formatHours(Number(a.Hours) || 0)}</td>
                  <td><span className={statusClass((a.Status as string) || "")}>{a.Status as string}</span></td>
                  <td>
                    {(a.Status as string) === "OnSite" && (
                      <button className="btn btn-secondary" style={{ minHeight: 28, padding: "2px 8px", fontSize: "0.7rem" }} onClick={() => handleManualSignOut(a.Id as number)}>
                        Sign Out
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 50 && (
            <div className="pagination">
              <button className="btn btn-secondary" disabled={page === 0} onClick={() => { setPage(page-1); load(page-1, filters); }}>Previous</button>
              <span style={{ padding: "8px 16px" }}>Page {page + 1} / {Math.ceil(total/50)}</span>
              <button className="btn btn-secondary" disabled={(page+1)*50 >= total} onClick={() => { setPage(page+1); load(page+1, filters); }}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
