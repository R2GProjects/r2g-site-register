"use client";
import { useEffect, useState } from "react";

export default function AdminOnSite() {
  const [records, setRecords] = useState<Array<Record<string,unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/onsite")
      .then(r => r.json())
      .then(setRecords)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>On-Site Now ({records.length})</h2>
      {records.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No one currently on site.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Person/Visitor</th>
                <th>Site</th>
                <th>Signed In</th>
                <th>Activity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.Id as number}>
                  <td><span className="badge badge-active">{r.AttendanceType as string}</span></td>
                  <td>
                    {r.Person
                      ? `${(r.Person as { FirstName?: string; LastName?: string })?.FirstName || ""} ${(r.Person as { FirstName?: string; LastName?: string })?.LastName || ""}`
                      : r.Visitor ? `Visitor #${(r.Visitor as { Id: number })?.Id}` : "-"}
                  </td>
                  <td title={(r.Site as { Address?: string })?.Address || ""}>
                    <div>{(r.Site as { SiteName?: string })?.SiteName || "Unknown site"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      {(r.Site as { SiteCode?: string })?.SiteCode || ""}
                    </div>
                  </td>
                  <td>{r.SignInTime ? new Date(r.SignInTime as string).toLocaleTimeString() : "-"}</td>
                  <td>{(r.WorkActivity || r.SignInMethod || "-") as string}</td>
                  <td><span className="badge badge-onsite">OnSite</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}