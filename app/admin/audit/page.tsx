"use client";
import { useEffect, useState } from "react";

export default function AuditPage() {
  const [items, setItems] = useState<Array<Record<string,unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit?limit=100")
      .then(r => r.json())
      .then(data => { setItems(data.list || []); setTotal(data.totalRows || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Audit Log ({total})</h2>
      {items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No audit entries yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Event</th><th>Attendance</th><th>Person</th><th>Source</th><th>Date</th></tr></thead>
            <tbody>
              {items.map(a => (
                <tr key={a.Id as number}>
                  <td><span className="badge badge-active">{a.EventType as string}</span></td>
                  <td>{(a.Attendance as string) || "-"}</td>
                  <td>{(a.Person as string) || "-"}</td>
                  <td>{(a.Source as string) || "-"}</td>
                  <td>{a.CreatedAt1 ? new Date(a.CreatedAt1 as string).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}