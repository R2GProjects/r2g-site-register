"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import ImageCapture from "@/components/ImageCapture";
import type { CredentialState } from "@/lib/credentials";

/** A date input only accepts YYYY-MM-DD, but the stored value may carry a time. */
function dateValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw ? raw.slice(0, 10) : "";
}

const CREDENTIAL_BADGE: Record<
  CredentialState["status"],
  { className: string; label: (c: CredentialState) => string } | null
> = {
  expired: {
    className: "badge badge-suspended",
    label: (c) => `${c.label} expired`,
  },
  expiring: {
    className: "badge badge-pending",
    label: (c) =>
      `${c.label} due in ${Math.max(0, c.daysRemaining ?? 0)}d`,
  },
  unverified: {
    className: "badge badge-signedout",
    label: (c) => `${c.label}: no expiry`,
  },
  missing: null,
  valid: null,
};

function CredentialBadges({ credentials }: { credentials?: CredentialState[] }) {
  const shown = (credentials || []).filter((c) => CREDENTIAL_BADGE[c.status]);
  if (shown.length === 0) return <span style={{ color: "var(--muted)" }}>-</span>;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {shown.map((c) => {
        const badge = CREDENTIAL_BADGE[c.status]!;
        return (
          <span key={c.key} className={badge.className}>
            {badge.label(c)}
          </span>
        );
      })}
    </span>
  );
}

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
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [onsiteIds, setOnsiteIds] = useState<Record<number, boolean>>({});

  const defaultForm: Record<string,unknown> = {
    FirstName: "", LastName: "", Mobile: "", Email: "",
    JobRole: "", WorkerType: "Contractor",
    WhiteCardNumber: "", WhiteCardExpiry: "", WhiteCardImage: null,
    LicenceNumber: "", LicenceType: "", LicenceExpiry: "", LicenceImage: null,
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
    fetch("/api/admin/onsite")
      .then(r => r.json())
      .then((rows: Array<Record<string, unknown>>) => {
        if (!Array.isArray(rows)) return;
        const ids: Record<number, boolean> = {};
        for (const row of rows) {
          const id = (row.Person as { Id?: number } | undefined)?.Id ?? (row.People_id as number | undefined);
          if (typeof id === "number") ids[id] = true;
        }
        setOnsiteIds(ids);
      })
      .catch(() => setOnsiteIds({}));
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
    fetch(`/api/admin/people?id=${item.Id}`)
      .then((r) => r.json())
      .then((detail: Record<string, unknown>) => {
        if (!detail || detail.error || detail.Id !== item.Id) return;
        setForm((current) => ({
          ...current,
          ...detail,
          passcode: "",
        }));
      })
      .catch(() => undefined);
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

  const handleDelete = async (person: Record<string, unknown>) => {
    const name = `${person.FirstName || ""} ${person.LastName || ""}`.trim();
    if (!confirm(`Delete ${name || "this person"}? This cannot be undone.`)) return;
    setDeleteBusyId(person.Id as number);
    try {
      const res = await fetch("/api/admin/people", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: person.Id }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Delete failed");
        return;
      }
      load(page, search);
    } catch {
      alert("Network error");
    } finally {
      setDeleteBusyId(null);
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
            <thead><tr><th>Name</th><th>Signed in</th><th>Mobile</th><th>Email</th><th>Type</th><th>Role</th><th>Tickets</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {people.map(p => (
                <tr key={p.Id as number}>
                  <td>
                    <span className={`signin-dot ${onsiteIds[p.Id as number] ? "in" : "out"}`} />
                    {(p.FirstName as string)} {(p.LastName as string)}
                  </td>
                  <td>
                    {onsiteIds[p.Id as number]
                      ? <span className="badge badge-onsite">Signed in</span>
                      : <span className="badge badge-signedout">Not signed in</span>}
                  </td>
                  <td>{(p.Mobile as string) || "-"}</td>
                  <td>{(p.Email as string) || "-"}</td>
                  <td><span className="badge badge-active">{(p.WorkerType as string) || "-"}</span></td>
                  <td>{(p.JobRole as string) || "-"}</td>
                  <td><CredentialBadges credentials={p.credentials as CredentialState[] | undefined} /></td>
                  <td>{p.AccessEnabled ? <span className="badge badge-active">Enabled</span> : <span className="badge badge-suspended">Disabled</span>}</td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => openAccess(p)}>Access</button>
                    <button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }} onClick={() => handleRegenToken(p)} disabled={tokenBusyId === p.Id}>
                      {tokenBusyId === p.Id ? "…" : "Token"}
                    </button>
                    <button
                      className="btn"
                      style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem", background: "var(--danger)", color: "#fff" }}
                      onClick={() => handleDelete(p)}
                      disabled={deleteBusyId === p.Id}
                    >
                      {deleteBusyId === p.Id ? "…" : "Delete"}
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
          <div className="form-group">
            <label>White Card Expiry</label>
            <input name="WhiteCardExpiry" type="date" value={dateValue(form.WhiteCardExpiry)} onChange={handleFormChange} />
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              Once set, sign-in is blocked from the day after this date.
            </span>
          </div>
          <div className="form-group">
            <ImageCapture
              label="White Card Photo"
              value={(form.WhiteCardImage as string) || null}
              onChange={(dataUrl) => setForm({ ...form, WhiteCardImage: dataUrl })}
            />
          </div>
          <div className="form-group"><label>Licence Number</label><input name="LicenceNumber" value={(form.LicenceNumber as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Licence Type</label><input name="LicenceType" value={(form.LicenceType as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Licence Expiry</label><input name="LicenceExpiry" type="date" value={dateValue(form.LicenceExpiry)} onChange={handleFormChange} /></div>
          <div className="form-group">
            <ImageCapture
              label="Licence Photo"
              value={(form.LicenceImage as string) || null}
              onChange={(dataUrl) => setForm({ ...form, LicenceImage: dataUrl })}
            />
          </div>
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