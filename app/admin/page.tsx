"use client";
import { useEffect, useState } from "react";

interface Stats {
  onsite: number; workerOnsite: number; visitorOnsite: number;
  totalPeople: number; totalSites: number; activeSites: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  const load = () => {
    fetch("/api/admin/dashboard")
      .then(r => r.json())
      .then(s => { setStats(s); setLastUpdated(new Date().toLocaleTimeString()); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!stats) return <p>No data</p>;

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdated && <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Updated: {lastUpdated}</span>}
          <button className="btn btn-secondary" style={{ minHeight: 36, padding: "4px 12px", fontSize: "0.875rem" }} onClick={load}>🔄 Refresh</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <div className="card">
          <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>{stats.onsite}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Currently On-Site</p>
        </div>
        <div className="card">
          <p style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.workerOnsite}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Workers On-Site</p>
        </div>
        <div className="card">
          <p style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.visitorOnsite}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Visitors On-Site</p>
        </div>
        <div className="card">
          <p style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.totalPeople}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Total People</p>
        </div>
        <div className="card">
          <p style={{ fontSize: "2rem", fontWeight: 700 }}>{stats.activeSites}</p>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Active Sites</p>
        </div>
      </div>
    </div>
  );
}