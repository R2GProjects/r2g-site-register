"use client";
import { useEffect, useState } from "react";

export default function AttendancePage() {
  const [items, setItems] = useState<Array<Record<string,unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = (p: number, s: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "50" });
    if (s) params.set("status", s);
    fetch(`/api/admin/attendance?${params}`)
      .then(r => r.json())
      .then(data => { setItems(data.list || []); setTotal(data.totalRows || 0); })
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
      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Site</th><th>Person/Visitor</th><th>Type</th><th>Sign In</th><th>Sign Out</th><th>Status</th><th></th></tr></thead>
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
                    {a.Person
                      ? `${(a.Person as { FirstName?: string; LastName?: string })?.FirstName || ""} ${(a.Person as { FirstName?: string; LastName?: string })?.LastName || ""}`
                      : a.Visitor ? `Visitor #${(a.Visitor as { Id: number })?.Id}` : "-"}
                  </td>
                  <td>{(a.AttendanceType as string) || "-"}</td>
                  <td>{a.SignInTime ? new Date(a.SignInTime as string).toLocaleString() : "-"}</td>
                  <td>{a.SignOutTime ? new Date(a.SignOutTime as string).toLocaleString() : "-"}</td>
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