"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_MS = 30_000;

interface EmergencySite {
  site: { Id: number; SiteName: string; SiteCode: string; SiteManager: string; SiteManagerPhone: string; Address: string };
  workerCount: number; visitorCount: number;
  workers: Array<{
    attendance: Record<string,unknown>;
    person: { Id: number; FirstName: string; LastName: string; EmergencyContactName: string; EmergencyContactPhone: string; WorkerType: string } | null;
  }>;
  visitors: Array<{
    attendance: Record<string,unknown>;
    visitor: { Id: number; FirstName: string; LastName: string; EmergencyContactName: string; EmergencyContactPhone: string; CompanyName: string } | null;
  }>;
}

export default function EmergencyPage() {
  const [data, setData] = useState<EmergencySite[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkSigningOut, setBulkSigningOut] = useState<number | null>(null);
  const [bulkResult, setBulkResult] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    // Only the very first load blanks the screen. A refresh mid-evacuation must
    // not replace the roll with a spinner.
    if (firstLoad.current) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/admin/emergency");
      const d = await res.json();
      if (Array.isArray(d)) {
        setData(d);
        setUpdatedAt(new Date());
      }
    } catch (err) {
      console.error(err);
    } finally {
      firstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const handleBulkSignOut = async (siteId: number) => {
    if (!confirm("Sign out ALL workers and visitors currently on this site? This will create audit log entries for every person. This is for emergency evacuations only.")) return;
    setBulkSigningOut(siteId);
    setBulkResult("");
    try {
      const res = await fetch("/api/admin/emergency/bulk-signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const d = await res.json();
      if (!res.ok) {
        setBulkResult(`Error: ${d.error}`);
      } else {
        setBulkResult(`Signed out ${d.signedOut} people at ${new Date(d.time).toLocaleTimeString()}`);
        load();
      }
    } catch {
      setBulkResult("Network error");
    } finally {
      setBulkSigningOut(null);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 8, color: "var(--danger)" }}>🔴 Emergency / Evacuation List</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16, fontSize: "0.875rem" }}>
        All currently on-site workers and visitors. Updates every 30 seconds.
        {updatedAt && ` Last updated ${updatedAt.toLocaleTimeString()}.`}
        {refreshing && " Refreshing…"}
      </p>

      {bulkResult && (
        <div className="card" style={{ marginBottom: 16, background: bulkResult.includes("Error") ? "var(--accent-light)" : "#dcfce7" }}>
          <p style={{ fontWeight: 600 }}>{bulkResult}</p>
        </div>
      )}

      {data.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No active sites with people on site.</p>
      ) : (
        data.map(site => (
          <div key={site.site.Id} className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: "1.125rem" }}>{site.site.SiteName} ({site.site.SiteCode})</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                  {site.workerCount} workers + {site.visitorCount} visitors on site
                </p>
                {site.site.SiteManager && (
                  <p style={{ fontSize: "0.875rem" }}>
                    Manager: {site.site.SiteManager} {site.site.SiteManagerPhone ? `(${site.site.SiteManagerPhone})` : ""}
                  </p>
                )}
              </div>
              {(site.workerCount + site.visitorCount) > 0 && (
                <button
                  className="btn btn-primary"
                  style={{ background: "var(--danger)", minHeight: 40, padding: "8px 16px", fontSize: "0.875rem" }}
                  onClick={() => handleBulkSignOut(site.site.Id)}
                  disabled={bulkSigningOut === site.site.Id}
                >
                  {bulkSigningOut === site.site.Id ? <div className="spinner" /> : "🚨 Sign Out All"}
                </button>
              )}
            </div>

            {site.workers.length > 0 && (
              <>
                <h4 style={{ marginTop: 12, marginBottom: 4 }}>Workers ({site.workerCount})</h4>
                <table>
                  <thead><tr><th>Name</th><th>Type</th><th>Emergency Contact</th><th>Phone</th></tr></thead>
                  <tbody>
                    {site.workers.map((w, i) => (
                      <tr key={i}><td>{w.person?.FirstName} {w.person?.LastName}</td><td>{w.person?.WorkerType || "-"}</td><td>{w.person?.EmergencyContactName || "-"}</td><td>{w.person?.EmergencyContactPhone || "-"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {site.visitors.length > 0 && (
              <>
                <h4 style={{ marginTop: 12, marginBottom: 4 }}>Visitors ({site.visitorCount})</h4>
                <table>
                  <thead><tr><th>Name</th><th>Company</th><th>Emergency Contact</th><th>Phone</th></tr></thead>
                  <tbody>
                    {site.visitors.map((v, i) => (
                      <tr key={i}><td>{v.visitor?.FirstName} {v.visitor?.LastName}</td><td>{v.visitor?.CompanyName || "-"}</td><td>{v.visitor?.EmergencyContactName || "-"}</td><td>{v.visitor?.EmergencyContactPhone || "-"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div style={{ marginTop: 8 }}>
              <p><strong>Total On-Site:</strong> {site.workerCount + site.visitorCount}</p>
            </div>
          </div>
        ))
      )}

      <button
        className="btn btn-secondary"
        style={{ marginTop: 8 }}
        onClick={load}
        disabled={refreshing}
      >
        {refreshing ? "Refreshing…" : "🔄 Refresh"}
      </button>
    </div>
  );
}