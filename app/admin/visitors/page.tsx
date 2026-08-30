"use client";
import { useEffect, useState } from "react";

// Visitor admin page: fetches from the Visitors table directly via the admin people endpoint
// filtering for visitor records in the Attendance table with Visitor links.

export default function VisitorsPage() {
  const [items, setItems] = useState<Array<Record<string,unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = (p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "50" });
    fetch(`/api/admin/attendance?${params}&status=OnSite`)
      .then(r => r.json())
      .then(data => {
        const list = (data.list || []);
        const visitorOnly = list.filter((r: Record<string, unknown>) => r.AttendanceType === "Visitor");
        setItems(visitorOnly);
        setTotal(visitorOnly.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0); }, []);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Visitor Records ({total} on-site)</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Currently signed-in visitors. For full visitor history, check Attendance.
      </p>
      {items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No visitors currently on site.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Reason</th>
                <th>Visiting</th>
                <th>Signed In</th>
                <th>Site</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.Id as number}>
                  <td>
                    {v.Visitor
                      ? `${((v.Visitor as Record<string,unknown>)?.FirstName as string) || ""} ${((v.Visitor as Record<string,unknown>)?.LastName as string) || ""}`
                      : "-"}
                  </td>
                  <td>{((v.Visitor as Record<string,unknown>)?.ReasonForVisit as string) || "-"}</td>
                  <td>{((v.Visitor as Record<string,unknown>)?.PersonVisiting as string) || "-"}</td>
                  <td>{v.SignInTime ? new Date(v.SignInTime as string).toLocaleString() : "-"}</td>
                  <td>{((v.Site as Record<string,unknown>)?.SiteCode as string) || `Site #${v.Sites_id}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}