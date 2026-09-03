"use client";
import { useCallback, useEffect, useState } from "react";
import { dayKey, formatDay, formatTime } from "@/lib/attendance";
import {
  INCIDENT_KIND_LABEL,
  INCIDENT_STATUSES,
  type IncidentKind,
  type IncidentStatus,
} from "@/lib/incident";

interface SiteOption {
  Id: number;
  SiteName?: string;
  SiteCode?: string;
}

interface Report {
  Id: number;
  Kind?: string;
  Status?: string;
  What?: string;
  WhereOnSite?: string;
  Action?: string;
  OccurredAt?: string;
  Day?: string;
  ReporterName?: string;
  AdminNotes?: string | null;
  Attendance_id?: number | null;
  Site?: { SiteName?: string; SiteCode?: string };
}

function siteDay(offsetDays = 0): string {
  return dayKey(new Date(Date.now() + offsetDays * 86_400_000));
}

function kindLabel(kind: unknown): string {
  const key = String(kind || "") as IncidentKind;
  return INCIDENT_KIND_LABEL[key] || String(kind || "Report");
}

export default function IncidentsPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState(() => siteDay(-29));
  const [to, setTo] = useState(() => siteDay());
  const [list, setList] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Report | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((sid: string, st: string, fromDay: string, toDay: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sid) params.set("siteId", sid);
    if (st) params.set("status", st);
    if (fromDay) params.set("from", fromDay);
    if (toDay) params.set("to", toDay);
    fetch(`/api/admin/incidents?${params}`)
      .then((r) => r.json())
      .then((data) => setList(data.list || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/admin/sites?limit=200")
      .then((r) => r.json())
      .then((data) => setSites(data.list || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    load(siteId, status, from, to);
  }, [siteId, status, from, to, load]);

  const save = async (nextStatus?: IncidentStatus) => {
    if (!open) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Id: open.Id,
          Status: nextStatus || open.Status,
          AdminNotes: notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setOpen({ ...open, Status: nextStatus || open.Status, AdminNotes: notes });
      load(siteId, status, from, to);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Incidents</h2>
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label htmlFor="inc-site">Site</label>
            <select id="inc-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.Id} value={site.Id}>
                  {site.SiteName || site.SiteCode || `Site #${site.Id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label htmlFor="inc-status">Status</label>
            <select id="inc-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="inc-from">From</label>
            <input id="inc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="inc-to">To</label>
            <input id="inc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {open && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <button className="btn btn-secondary" onClick={() => setOpen(null)}>Close</button>
            <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
          </div>
          <h3 style={{ fontSize: "1.1rem", marginBottom: 8 }}>
            {kindLabel(open.Kind)}
            {" · "}
            {open.Site?.SiteName || open.Site?.SiteCode || "Site"}
          </h3>
          <p style={{ color: "var(--muted)", marginBottom: 12 }}>
            {open.ReporterName || "Unknown"}
            {open.Day ? ` · ${formatDay(open.Day)}` : ""}
            {open.OccurredAt ? ` · ${formatTime(open.OccurredAt)}` : ""}
            {open.Attendance_id ? " · signed in" : " · not signed in"}
          </p>
          <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>{open.What}</p>
          {open.WhereOnSite ? (
            <p style={{ marginBottom: 8 }}><strong>Where:</strong> {open.WhereOnSite}</p>
          ) : null}
          {open.Action ? (
            <p style={{ marginBottom: 8 }}><strong>Action taken:</strong> {open.Action}</p>
          ) : null}
          <div className="form-group no-print">
            <label htmlFor="inc-notes">Admin notes</label>
            <textarea
              id="inc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {INCIDENT_STATUSES.map((s) => (
              <button
                key={s}
                className={open.Status === s ? "btn btn-primary" : "btn btn-secondary"}
                disabled={saving}
                onClick={() => save(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No reports in this range.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Site</th>
                <th>Kind</th>
                <th>Reporter</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.Id}>
                  <td>{row.Day ? formatDay(row.Day) : "—"}</td>
                  <td>{row.Site?.SiteName || row.Site?.SiteCode || "—"}</td>
                  <td>{kindLabel(row.Kind)}</td>
                  <td>{row.ReporterName || "—"}</td>
                  <td>
                    <span className={row.Status === "open" ? "badge badge-pending" : "badge badge-signedout"}>
                      {row.Status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                      onClick={() => {
                        setOpen(row);
                        setNotes(String(row.AdminNotes || ""));
                        setError("");
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
