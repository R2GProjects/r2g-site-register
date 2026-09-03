"use client";
import { useEffect, useState } from "react";
import PersonThumb from "@/components/PersonThumb";

export default function AdminOnSite() {
  const [records, setRecords] = useState<Array<Record<string,unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/onsite?photos=1")
      .then(r => r.json())
      .then(setRecords)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>On-Site Now ({records.length})</h2>
        <a className="btn btn-secondary" href="/admin/prestart">Pre-start</a>
      </div>
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
                    {r.Person ? (() => {
                      const person = r.Person as { FirstName?: string; LastName?: string; PersonPhoto?: string | null };
                      const name = `${person.FirstName || ""} ${person.LastName || ""}`.trim();
                      return (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <PersonThumb src={person.PersonPhoto} name={name} />
                          {name || "-"}
                        </span>
                      );
                    })()
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