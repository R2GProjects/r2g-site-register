"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

export default function SitesPage() {
  const [items, setItems] = useState<Array<Record<string,unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Record<string,unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const defaultForm = {
    SiteCode: "", SiteName: "", Address: "", Suburb: "", State: "NSW", Postcode: "",
    SiteManager: "", SiteManagerPhone: "", Client: "", Status: "Setup",
    Latitude: "", Longitude: "",
    EmergencyPlanURL: "", RequiresInduction: false, InductionRules: "",
    Notes: "",
  };
  const [form, setForm] = useState<Record<string,unknown>>({ ...defaultForm });

  const load = (p: number, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "25" });
    if (q) params.set("q", q);
    fetch(`/api/admin/sites?${params}`)
      .then(r => r.json())
      .then(data => { setItems(data.list || []); setTotal(data.totalRows || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0, ""); }, []);
  const onSearch = () => { setPage(0); load(0, search); };

  const statusClass = (s: string) => {
    if (s === "Active") return "badge badge-active";
    if (s === "Completed") return "badge badge-completed";
    if (s === "Suspended") return "badge badge-suspended";
    return "badge badge-pending";
  };

  const openCreate = () => {
    setEditItem(null);
    setForm({ ...defaultForm, State: "NSW" });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (item: Record<string,unknown>) => {
    setEditItem(item);
    setForm({ ...item });
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
    if (!form.SiteCode || !form.SiteName) {
      setFormError("Site Code and Site Name are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        Latitude: form.Latitude ? parseFloat(form.Latitude as string) : null,
        Longitude: form.Longitude ? parseFloat(form.Longitude as string) : null,
      };
      const url = "/api/admin/sites";
      const method = editItem ? "PATCH" : "POST";
      const body = editItem ? { ...payload, Id: editItem.Id } : payload;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setFormError(d.error || "Save failed");
      } else {
        setModalOpen(false);
        load(page, search);
      }
    } catch {
      setFormError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Sites ({total})</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ New Site</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="Search by name or code..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && onSearch()} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onSearch}>Search</button>
      </div>
      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Manager</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map(s => (
                <tr key={s.Id as number}>
                  <td><strong>{s.SiteCode as string}</strong></td>
                  <td>{s.SiteName as string}</td>
                  <td>{(s.Address as string) || "-"}</td>
                  <td>{(s.SiteManager as string) || "-"}</td>
                  <td><span className={statusClass(s.Status as string)}>{s.Status as string}</span></td>
                  <td><button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }} onClick={() => openEdit(s)}>Edit</button></td>
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
        <Modal title={editItem ? "Edit Site" : "New Site"} onClose={() => setModalOpen(false)}>
          <div className="form-group">
            <label>Site Code *</label>
            <input name="SiteCode" value={(form.SiteCode as string) || ""} onChange={handleFormChange} style={{ textTransform: "uppercase" }} />
          </div>
          <div className="form-group">
            <label>Site Name *</label>
            <input name="SiteName" value={(form.SiteName as string) || ""} onChange={handleFormChange} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input name="Address" value={(form.Address as string) || ""} onChange={handleFormChange} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="form-group"><label>Suburb</label><input name="Suburb" value={(form.Suburb as string) || ""} onChange={handleFormChange} /></div>
            <div className="form-group"><label>State</label><input name="State" value={(form.State as string) || ""} onChange={handleFormChange} /></div>
            <div className="form-group"><label>Postcode</label><input name="Postcode" value={(form.Postcode as string) || ""} onChange={handleFormChange} /></div>
          </div>
          <div className="form-group">
            <label>Site Manager</label>
            <input name="SiteManager" value={(form.SiteManager as string) || ""} onChange={handleFormChange} />
          </div>
          <div className="form-group">
            <label>Site Manager Phone</label>
            <input name="SiteManagerPhone" value={(form.SiteManagerPhone as string) || ""} onChange={handleFormChange} />
          </div>
          <div className="form-group">
            <label>Client</label>
            <input name="Client" value={(form.Client as string) || ""} onChange={handleFormChange} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group"><label>Latitude</label><input name="Latitude" type="number" step="any" value={(form.Latitude as string) || ""} onChange={handleFormChange} placeholder="-33.8688" /></div>
            <div className="form-group"><label>Longitude</label><input name="Longitude" type="number" step="any" value={(form.Longitude as string) || ""} onChange={handleFormChange} placeholder="151.2093" /></div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select name="Status" value={(form.Status as string) || "Setup"} onChange={handleFormChange}>
              <option>Setup</option><option>Active</option><option>Suspended</option><option>Completed</option><option>Archived</option>
            </select>
          </div>
          <div className="form-group">
            <label>Emergency Plan URL</label>
            <input name="EmergencyPlanURL" value={(form.EmergencyPlanURL as string) || ""} onChange={handleFormChange} placeholder="https://..." />
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="RequiresInduction" checked={(form.RequiresInduction as boolean) || false} onChange={handleFormChange} />
              Requires Induction
            </label>
          </div>
          <div className="form-group">
            <label>Induction Rules</label>
            <textarea name="InductionRules" value={(form.InductionRules as string) || ""} onChange={handleFormChange} rows={4} placeholder="Site-specific induction content..." />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea name="Notes" value={(form.Notes as string) || ""} onChange={handleFormChange} rows={2} />
          </div>
          {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner" /> : (editItem ? "Save Changes" : "Create Site")}
          </button>
        </Modal>
      )}
    </div>
  );
}