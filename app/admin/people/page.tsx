"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

export default function PeoplePage() {
  const [people, setPeople] = useState<Array<Record<string,unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Record<string,unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessData, setAccessData] = useState<Array<Record<string,unknown>>>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Record<string,unknown> | null>(null);
  const [tokenModal, setTokenModal] = useState<{ name: string; token: string; note: string } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenBusyId, setTokenBusyId] = useState<number | null>(null);

  const defaultForm: Record<string,unknown> = {
    FirstName: "", LastName: "", Mobile: "", Email: "",
    JobRole: "", WorkerType: "Contractor", WhiteCardNumber: "",
    LicenceNumber: "", LicenceType: "",
    EmergencyContactName: "", EmergencyContactPhone: "",
    AccessEnabled: true, Notes: "", passcode: "",
  };
  const [form, setForm] = useState<Record<string,unknown>>({ ...defaultForm });

  const load = (p: number, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "25" });
    if (q) params.set("q", q);
    fetch(`/api/admin/people?${params}`)
      .then(r => r.json())
      .then(data => { setPeople(data.list || []); setTotal(data.totalRows || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0, ""); }, []);
  const onSearch = () => { setPage(0); load(0, search); };

  const openCreate = () => {
    setEditItem(null);
    setForm({ ...defaultForm, WorkerType: "Contractor" });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (item: Record<string,unknown>) => {
    setEditItem(item);
    setForm({ ...item, passcode: "" });
    setFormError("");
    setModalOpen(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const t = e.target;
    if (t.type === "checkbox") {
      setForm({ ...form, [t.name]: (t as HTMLInputElement).checked });
    } else {
      setForm({ ...form, [t.name]: t.value });
    }
  };

  const handleSave = async () => {
    if (!form.FirstName || !form.LastName) { setFormError("First and last name are required."); return; }
    setSaving(true); setFormError("");
    try {
      const url = "/api/admin/people";
      const method = editItem ? "PATCH" : "POST";
      const body = editItem ? { ...form, Id: editItem.Id } : form;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error || "Save failed"); }
      else {
        setModalOpen(false);
        load(page, search);
        if (!editItem && d.accessToken) {
          setTokenCopied(false);
          setTokenModal({
            name: `${form.FirstName} ${form.LastName}`,
            token: d.accessToken,
            note: "Copy this token now. It is stored as a hash and cannot be viewed again.",
          });
        }
      }
    } catch { setFormError("Network error"); }
    finally { setSaving(false); }
  };

  const openAccess = (person: Record<string,unknown>) => {
    setSelectedPerson(person);
    setAccessLoading(true);
    setAccessData([]);
    setAccessModalOpen(true);
    fetch(`/api/admin/siteaccess?personId=${person.Id}`)
      .then(r => r.json())
      .then(data => setAccessData(data.list || []))
      .catch(console.error)
      .finally(() => setAccessLoading(false));
  };

  const handleAccessAction = async (sa: Record<string,unknown>, newStatus: string) => {
    try {
      const res = await fetch("/api/admin/siteaccess", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: sa.Id, AccessStatus: newStatus }),
      });
      if (res.ok && selectedPerson) openAccess(selectedPerson);
    } catch { /* ignore */ }
  };

  const handleRegenToken = async (person: Record<string, unknown>) => {
    const personId = person.Id as number;
    setTokenBusyId(personId);
    try {
      const res = await fetch(`/api/admin/workers/${personId}/regenerate-token`, { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.accessToken) {
        setTokenModal({
          name: `${person.FirstName} ${person.LastName}`,
          token: "",
          note: d.error || "Failed to create token",
        });
        return;
      }
      setTokenCopied(false);
      setTokenModal({
        name: `${person.FirstName} ${person.LastName}`,
        token: d.accessToken,
        note: "Copy this token now. The previous token no longer works, and this one cannot be viewed again.",
      });
    } catch {
      setTokenModal({
        name: `${person.FirstName} ${person.LastName}`,
        token: "",
        note: "Network error — token was not created.",
      });
    } finally {
      setTokenBusyId(null);
    }
  };

  const copyToken = async () => {
    if (!tokenModal?.token) return;
    try {
      await navigator.clipboard.writeText(tokenModal.token);
      setTokenCopied(true);
    } catch {
      setTokenCopied(false);
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>People ({total})</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ New Person</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && onSearch()} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onSearch}>Search</button>
      </div>
      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Type</th><th>Role</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {people.map(p => (
                <tr key={p.Id as number}>
                  <td>{(p.FirstName as string)} {(p.LastName as string)}</td>
                  <td>{(p.Mobile as string) || "-"}</td>
                  <td>{(p.Email as string) || "-"}</td>
                  <td><span className="badge badge-active">{(p.WorkerType as string) || "-"}</span></td>
                  <td>{(p.JobRole as string) || "-"}</td>
                  <td>{p.AccessEnabled ? <span className="badge badge-active">Enabled</span> : <span className="badge badge-suspended">Disabled</span>}</td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => openAccess(p)}>Access</button>
                    <button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => handleRegenToken(p)} disabled={tokenBusyId === p.Id}>
                      {tokenBusyId === p.Id ? "…" : "Token"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 25 && (
            <div className="pagination">
              <button className="btn btn-secondary" disabled={page === 0} onClick={() => { setPage(page-1); load(page-1, search); }}>Previous</button>
              <span style={{ padding: "8px 16px" }}>Page {page + 1} / {Math.ceil(total/25)}</span>
              <button className="btn btn-secondary" disabled={(page+1)*25 >= total} onClick={() => { setPage(page+1); load(page+1, search); }}>Next</button>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <Modal title={editItem ? "Edit Person" : "New Person"} onClose={() => setModalOpen(false)}>
          <div className="form-group"><label>First Name *</label><input name="FirstName" value={(form.FirstName as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Last Name *</label><input name="LastName" value={(form.LastName as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Mobile</label><input name="Mobile" type="tel" value={(form.Mobile as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Email</label><input name="Email" type="email" value={(form.Email as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group">
            <label>Worker Type</label>
            <select name="WorkerType" value={(form.WorkerType as string) || "Contractor"} onChange={handleFormChange}>
              <option>Employee</option><option>Contractor</option><option>Subcontractor</option><option>Consultant</option><option>Delivery</option><option>Other</option>
            </select>
          </div>
          <div className="form-group"><label>Job Role</label><input name="JobRole" value={(form.JobRole as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>White Card Number</label><input name="WhiteCardNumber" value={(form.WhiteCardNumber as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Licence Number</label><input name="LicenceNumber" value={(form.LicenceNumber as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Licence Type</label><input name="LicenceType" value={(form.LicenceType as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Emergency Contact Name</label><input name="EmergencyContactName" value={(form.EmergencyContactName as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Emergency Contact Phone</label><input name="EmergencyContactPhone" value={(form.EmergencyContactPhone as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label className="checkbox-label"><input type="checkbox" name="AccessEnabled" checked={(form.AccessEnabled as boolean) || false} onChange={handleFormChange} />Access Enabled</label></div>
          <div className="form-group">
            <label>Passcode</label>
            <input
              name="passcode"
              type="text"
              autoComplete="off"
              value={(form.passcode as string) || ""}
              onChange={handleFormChange}
              placeholder={editItem ? "Leave blank to keep the current passcode" : "Optional — at least 4 characters"}
            />
            <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
              Workers can sign in with this instead of an access token.
            </p>
          </div>
          <div className="form-group"><label>Notes</label><textarea name="Notes" value={(form.Notes as string) || ""} onChange={handleFormChange} rows={2} /></div>
          {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner" /> : (editItem ? "Save Changes" : "Create Person")}
          </button>
        </Modal>
      )}

      {accessModalOpen && selectedPerson && (
        <Modal title={`Site Access — ${selectedPerson.FirstName} ${selectedPerson.LastName}`} onClose={() => setAccessModalOpen(false)}>
          {accessLoading ? <div className="loading"><div className="spinner" /></div> : (
            <>
              {accessData.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No site access records. Create one below or via worker registration.</p>
              ) : (
                <table style={{ marginBottom: 16 }}>
                  <thead><tr><th>Site</th><th>Status</th><th>Induction</th><th></th></tr></thead>
                  <tbody>
                    {accessData.map(sa => (
                      <tr key={sa.Id as number}>
                        <td>{((sa.Site as Record<string,unknown>)?.SiteName as string) || `Site #${sa.Sites_id}`}</td>
                        <td>
                          <span className={sa.AccessStatus === "Approved" ? "badge badge-active" : sa.AccessStatus === "Denied" ? "badge badge-suspended" : "badge badge-pending"}>
                            {sa.AccessStatus as string}
                          </span>
                        </td>
                        <td>{sa.SiteInductionComplete ? "✅" : "—"}</td>
                        <td style={{ display: "flex", gap: 4 }}>
                          {sa.AccessStatus !== "Approved" && (
                            <button className="btn btn-primary" style={{ minHeight: 28, padding: "2px 8px", fontSize: "0.7rem" }} onClick={() => handleAccessAction(sa, "Approved")}>Approve</button>
                          )}
                          {sa.AccessStatus !== "Denied" && (
                            <button className="btn" style={{ minHeight: 28, padding: "2px 8px", fontSize: "0.7rem", background: "var(--danger)", color: "#fff" }} onClick={() => handleAccessAction(sa, "Denied")}>Deny</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </Modal>
      )}

      {tokenModal && (
        <Modal title={`Access token — ${tokenModal.name}`} onClose={() => setTokenModal(null)}>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: 12 }}>{tokenModal.note}</p>
          {tokenModal.token ? (
            <>
              <p style={{ fontFamily: "monospace", wordBreak: "break-all", background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontSize: "0.8rem", border: "1px solid var(--border)" }}>
                {tokenModal.token}
              </p>
              <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={copyToken}>
                {tokenCopied ? "Copied" : "Copy token"}
              </button>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 12 }}>
                The worker can also sign in with a passcode from the main register page if they set one.
              </p>
            </>
          ) : null}
        </Modal>
      )}
    </div>
  );
}