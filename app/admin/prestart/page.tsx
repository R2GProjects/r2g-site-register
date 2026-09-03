"use client";
import { useCallback, useEffect, useState } from "react";
import { dayKey, formatDay, formatTime } from "@/lib/attendance";
import { preStartCounts, type PreStartAttendee } from "@/lib/prestart";

interface SiteOption {
  Id: number;
  SiteName?: string;
  SiteCode?: string;
}

interface Talk {
  Id?: number;
  Day?: string;
  HeldAt?: string;
  Topic?: string | null;
  Hazards?: string | null;
  LedBy?: string | null;
  Sites_id?: number | null;
  Site?: { SiteName?: string; SiteCode?: string };
  attendees?: PreStartAttendee[];
  counts?: { onRoll: number; present: number; absent: number };
}

function siteDay(offsetDays = 0): string {
  return dayKey(new Date(Date.now() + offsetDays * 86_400_000));
}

function siteLabel(site: SiteOption) {
  return site.SiteName || site.SiteCode || `Site #${site.Id}`;
}

export default function PreStartPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState(() => siteDay(-13));
  const [to, setTo] = useState(() => siteDay());
  const [list, setList] = useState<Talk[]>([]);
  const [loading, setLoading] = useState(false);
  const [talk, setTalk] = useState<Talk | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("siteId") || "";
    fetch("/api/admin/sites?limit=200")
      .then((r) => r.json())
      .then((data) => {
        const rows: SiteOption[] = data.list || [];
        setSites(rows);
        if (initial) setSiteId(initial);
        else if (rows[0]?.Id) setSiteId(String(rows[0].Id));
      })
      .catch(console.error);
  }, []);

  const loadList = useCallback((sid: string, fromDay: string, toDay: string) => {
    if (!sid) return;
    setLoading(true);
    const params = new URLSearchParams({ siteId: sid });
    if (fromDay) params.set("from", fromDay);
    if (toDay) params.set("to", toDay);
    fetch(`/api/admin/prestart?${params}`)
      .then((r) => r.json())
      .then((data) => setList(data.list || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (siteId) loadList(siteId, from, to);
  }, [siteId, from, to, loadList]);

  const startTalk = async () => {
    if (!siteId) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/prestart?siteId=${siteId}&draft=1`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load who is on site");
        return;
      }
      setTalk({ ...data, Sites_id: Number(siteId) });
    } finally {
      setLoading(false);
    }
  };

  const openTalk = (row: Talk) => {
    setError("");
    setTalk({
      ...row,
      attendees: row.attendees || [],
    });
  };

  const refreshRoll = async () => {
    if (!talk || !siteId) return;
    setError("");
    const res = await fetch("/api/admin/prestart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "refresh",
        siteId,
        attendees: talk.attendees || [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not refresh");
      return;
    }
    setTalk({ ...talk, attendees: data.attendees });
  };

  const togglePresent = (key: string) => {
    if (!talk?.attendees) return;
    setTalk({
      ...talk,
      attendees: talk.attendees.map((row) =>
        row.key === key ? { ...row, present: !row.present } : row
      ),
    });
  };

  const saveTalk = async () => {
    if (!talk || !siteId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/prestart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Id: talk.Id,
          siteId,
          topic: talk.Topic,
          hazards: talk.Hazards,
          ledBy: talk.LedBy,
          heldAt: talk.HeldAt,
          attendees: talk.attendees,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setTalk({ ...talk, Id: data.Id });
      loadList(siteId, from, to);
    } finally {
      setSaving(false);
    }
  };

  const attendees = talk?.attendees || [];
  const counts = preStartCounts(attendees);
  const siteName =
    sites.find((s) => String(s.Id) === siteId)?.SiteName ||
    talk?.Site?.SiteName ||
    "";

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
        <h2 style={{ margin: 0 }}>Pre-start</h2>
        {talk && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={() => setTalk(null)}>
              Close
            </button>
            <button className="btn btn-secondary" onClick={refreshRoll}>
              Add people who signed in since
            </button>
            <button className="btn btn-secondary" onClick={() => window.print()}>
              Print
            </button>
            <button className="btn btn-primary" onClick={saveTalk} disabled={saving}>
              {saving ? "Saving…" : talk.Id ? "Save" : "Record talk"}
            </button>
          </div>
        )}
      </div>

      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
            <label htmlFor="ps-site">Site</label>
            <select
              id="ps-site"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setTalk(null);
              }}
            >
              {sites.map((site) => (
                <option key={site.Id} value={site.Id}>{siteLabel(site)}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="ps-from">From</label>
            <input id="ps-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="ps-to">To</label>
            <input id="ps-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={startTalk} disabled={!siteId || loading}>
            Start today’s pre-start
          </button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "12px 0 0" }}>
          The roll is who is signed in now. Untick anyone who was not at the huddle.
          Someone who has not signed in yet is not blocked — add them after they tap in.
        </p>
      </div>

      {error && <p className="error no-print">{error}</p>}

      {talk ? (
        <div className="card">
          <div className="print-only" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 4px" }}>Pre-start · {siteName}</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              {talk.Day ? formatDay(talk.Day) : ""}
              {talk.HeldAt ? ` · ${formatTime(talk.HeldAt)}` : ""}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div className="card">
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{counts.present}</p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Present</p>
            </div>
            <div className="card">
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{counts.absent}</p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Signed in, not at talk</p>
            </div>
            <div className="card">
              <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>{counts.onRoll}</p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>On the roll</p>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="ps-led">Led by</label>
            <input
              id="ps-led"
              value={talk.LedBy || ""}
              onChange={(e) => setTalk({ ...talk, LedBy: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="ps-topic">What was covered</label>
            <textarea
              id="ps-topic"
              rows={3}
              value={talk.Topic || ""}
              onChange={(e) => setTalk({ ...talk, Topic: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="ps-hazards">Hazards raised</label>
            <textarea
              id="ps-hazards"
              rows={3}
              value={talk.Hazards || ""}
              onChange={(e) => setTalk({ ...talk, Hazards: e.target.value })}
            />
          </div>

          {attendees.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              Nobody is signed in at this site. Record the talk anyway, then add
              people as they tap in.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Present</th>
                  <th>Name</th>
                  <th>Signed in</th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.present}
                        onChange={() => togglePresent(row.key)}
                        aria-label={`${row.present ? "Mark absent" : "Mark present"} ${row.name}`}
                      />
                    </td>
                    <td>
                      {row.name}
                      {row.kind === "visitor" ? (
                        <span className="badge badge-pending" style={{ marginLeft: 6 }}>Visitor</span>
                      ) : null}
                    </td>
                    <td>{row.signedInAt ? formatTime(row.signedInAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Recorded talks</p>
          {list.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              No pre-start recorded in this range.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Led by</th>
                  <th>Covered</th>
                  <th>Present</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.Id}>
                    <td>{row.Day ? formatDay(row.Day) : "—"}</td>
                    <td>{row.LedBy || "—"}</td>
                    <td>{row.Topic || "—"}</td>
                    <td>
                      {row.counts
                        ? `${row.counts.present} / ${row.counts.onRoll}`
                        : "—"}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                        onClick={() => openTalk(row)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
