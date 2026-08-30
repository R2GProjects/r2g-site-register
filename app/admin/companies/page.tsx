"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

export default function CompaniesPage() {
  const [items, setItems] = useState<Array<Record<string,unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Record<string,unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const defaultForm: Record<string,unknown> = {
    CompanyName: "", TradingName: "", ABN: "", ContactName: "", ContactPhone: "", ContactEmail: "",
    CompanyType: "Contractor", Status: "Active", Notes: "",
  };
  const [form, setForm] = useState<Record<string,unknown>>({ ...defaultForm });

  const load = (p: number, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: "25" });
    if (q) params.set("q", q);
    fetch(`/api/admin/companies?${params}`)
      .then(r => r.json())
      .then(data => { setItems(data.list || []); setTotal(data.totalRows || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(0, ""); }, []);
  const onSearch = () => { setPage(0); load(0, search); };

  const openCreate = () => { setEditItem(null); setForm({ ...defaultForm, CompanyType: "Contractor", Status: "Active" }); setFormError(""); setModalOpen(true); };
  const openEdit = (item: Record<string,unknown>) => { setEditItem(item); setForm({ ...item }); setFormError(""); setModalOpen(true); };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!form.CompanyName) { setFormError("Company name is required."); return; }
    setSaving(true); setFormError("");
    try {
      const url = "/api/admin/companies";
      const method = editItem ? "PATCH" : "POST";
      const body = editItem ? { ...form, Id: editItem.Id } : form;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error || "Save failed"); }
      else { setModalOpen(false); load(page, search); }
    } catch { setFormError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Companies ({total})</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ New Company</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && onSearch()} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onSearch}>Search</button>
      </div>
      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Name</th><th>ABN</th><th>Type</th><th>Contact</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map(c => (
                <tr key={c.Id as number}>
                  <td>{c.CompanyName as string}</td>
                  <td>{(c.ABN as string) || "-"}</td>
                  <td><span className="badge badge-active">{(c.CompanyType as string) || "Other"}</span></td>
                  <td>{(c.ContactName as string) || "-"}</td>
                  <td>{(c.Status as string) === "Active" ? <span className="badge badge-active">Active</span> : <span className="badge badge-suspended">{c.Status as string}</span>}</td>
                  <td><button className="btn btn-secondary" style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }} onClick={() => openEdit(c)}>Edit</button></td>
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
        <Modal title={editItem ? "Edit Company" : "New Company"} onClose={() => setModalOpen(false)}>
          <div className="form-group"><label>Company Name *</label><input name="CompanyName" value={(form.CompanyName as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Trading Name</label><input name="TradingName" value={(form.TradingName as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>ABN</label><input name="ABN" value={(form.ABN as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Contact Name</label><input name="ContactName" value={(form.ContactName as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Contact Phone</label><input name="ContactPhone" value={(form.ContactPhone as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group"><label>Contact Email</label><input name="ContactEmail" value={(form.ContactEmail as string) || ""} onChange={handleFormChange} /></div>
          <div className="form-group">
            <label>Company Type</label>
            <select name="CompanyType" value={(form.CompanyType as string) || "Contractor"} onChange={handleFormChange}>
              <option>Builder</option><option>Contractor</option><option>Subcontractor</option><option>Consultant</option><option>Supplier</option><option>Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select name="Status" value={(form.Status as string) || "Active"} onChange={handleFormChange}>
              <option>Active</option><option>Inactive</option>
            </select>
          </div>
          <div className="form-group"><label>Notes</label><textarea name="Notes" value={(form.Notes as string) || ""} onChange={handleFormChange} rows={2} /></div>
          {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner" /> : (editItem ? "Save Changes" : "Create Company")}
          </button>
        </Modal>
      )}
    </div>
  );
}