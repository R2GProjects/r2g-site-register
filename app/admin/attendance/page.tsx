"use client";
import { useEffect, useState } from "react";
import { formatDay, formatHours, formatTime, personName } from "@/lib/attendance";
import type { DayPerson } from "@/lib/attendance";

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

export default function AttendancePage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AttendanceSummary>({
    totalHours: 0,
    onsiteNames: [],
    byDay: [],
  });

  const load = (p: number, s: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "50" });
    if (s) params.set("status", s);
    fetch(`/api/admin/attendance?${params}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.list || []);
        setTotal(data.totalRows || 0);
        if (data.summary) setSummary(data.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0, ""); }, []);

  const statusClass = (s: string) => {
    if (s === "OnSite") return "badge badge-onsite";
    if (s === "SignedOut") return "badge badge-signedout";
    if (s === "EmergencyEvacuated") return "badge badge-suspended";
    return "badge badge-pending";
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    window.open(`/api/admin/attendance/export?${params}`, "_blank");
  };

  const handleManualSignOut = async (attendanceId: number) => {
    if (!confirm("Manually sign out this attendance record?")) return;
    try {
      await fetch("/api/admin/attendance/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId }),
      });
      load(page, status);
    } catch { alert("Failed to sign out"); }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Attendance ({total})</h2>
        <button className="btn btn-secondary" onClick={handleExport}>📥 Export CSV</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); load(0, e.target.value); }}>
          <option value="">All</option>
          <option value="OnSite">OnSite</option>
          <option value="SignedOut">SignedOut</option>
          <option value="EmergencyEvacuated">EmergencyEvacuated</option>
          <option value="AutoClosed">AutoClosed</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>{formatHours(summary.totalHours)}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Total hours logged</p>
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
        <p style={{ fontWeight: 600, marginBottom: 12 }}>Hours logged per day</p>
        {summary.byDay.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>No attendance yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Logged in</th>
                  <th>Logged out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {summary.byDay.map(day => (
                  day.people?.map((person, i) => (
                    <tr key={`${day.date}-${person.name}-${i}`}>
                      {i === 0 && (
                        <td rowSpan={day.people.length}>
                          <div>{formatDay(day.date)}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{formatHours(day.hours)} total</div>
                        </td>
                      )}
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
                  ))
                ))}
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
              <button className="btn btn-secondary" disabled={page === 0} onClick={() => { setPage(page-1); load(page-1, status); }}>Previous</button>
              <span style={{ padding: "8px 16px" }}>Page {page + 1} / {Math.ceil(total/50)}</span>
              <button className="btn btn-secondary" disabled={(page+1)*50 >= total} onClick={() => { setPage(page+1); load(page+1, status); }}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
