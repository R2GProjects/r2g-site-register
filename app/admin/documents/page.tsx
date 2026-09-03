"use client";
import { useCallback, useEffect, useState } from "react";
import {
  DOCUMENT_KIND_LABEL,
  DOCUMENT_KINDS,
  type DocumentKind,
} from "@/lib/documents";

interface SiteOption {
  Id: number;
  SiteName?: string;
  SiteCode?: string;
}

interface DocRow {
  Id: number;
  Title?: string;
  Kind?: string;
  Body?: string;
  Url?: string;
  Version?: string;
  version?: string;
  required?: boolean;
  archived?: boolean;
  Required?: string;
  ArchivedAt?: string | null;
  Sites_id?: number | null;
  Site?: { SiteName?: string; SiteCode?: string };
}

interface AckRow {
  Id: number;
  DocumentVersion?: string;
  AcceptedAt?: string;
  Person?: { FirstName?: string; LastName?: string };
}

function siteLabel(site: SiteOption) {
  return site.SiteName || site.SiteCode || `Site #${site.Id}`;
}

function kindLabel(kind: unknown): string {
  const key = String(kind || "") as DocumentKind;
  return DOCUMENT_KIND_LABEL[key] || String(kind || "Document");
}

export default function DocumentsPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteId, setSiteId] = useState("");
  const [list, setList] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<DocRow | null>(null);
  const [acks, setAcks] = useState<AckRow[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("swms");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("siteId") || "";
    fetch("/api/admin/sites?limit=200")
      .then((r) => r.json())
      .then((data) => {
        const rows: SiteOption[] = data.list || [];
        setSites(rows);
        if (initial) setSiteId(initial);
        else if (rows[0]?.Id) setSiteId(String(rows[0].Id));
      })
      .catch(console.error);
  }, []);

  const load = useCallback((sid: string) => {
    if (!sid) return;
    setLoading(true);
    fetch(`/api/admin/documents?siteId=${sid}`)
      .then((r) => r.json())
      .then((data) => setList(data.list || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(siteId);
  }, [siteId, load]);

  const resetForm = () => {
    setOpen(null);
    setAcks([]);
    setTitle("");
    setKind("swms");
    setBody("");
    setUrl("");
    setRequired(true);
    setError("");
  };

  const openDoc = async (row: DocRow) => {
    setError("");
    const res = await fetch(`/api/admin/documents?id=${row.Id}&acks=1`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not open that document.");
      return;
    }
    setOpen(data);
    setAcks(data.acks || []);
    setTitle(String(data.Title || data.title || ""));
    setKind((data.Kind || data.kind || "other") as DocumentKind);
    setBody(String(data.Body || data.body || ""));
    setUrl(String(data.Url || data.url || ""));
    setRequired(Boolean(data.required));
  };

  const save = async () => {
    if (!siteId) {
      setError("Pick a site.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        Id: open?.Id,
        title,
        kind,
        body,
        url,
        required: required ? true : "",
        siteId,
      };
      const res = await fetch("/api/admin/documents", {
        method: open?.Id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      resetForm();
      load(siteId);
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: number) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: id, archive: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Archive failed");
        return;
      }
      if (open?.Id === id) resetForm();
      load(siteId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Documents</h2>
      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ margin: 0, minWidth: 180, maxWidth: 320 }}>
          <label htmlFor="doc-site">Site</label>
          <select id="doc-site" value={siteId} onChange={(e) => { setSiteId(e.target.value); resetForm(); }}>
            {sites.map((site) => (
              <option key={site.Id} value={site.Id}>
                {siteLabel(site)}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: 8 }}>
          Editing the wording or the link is a new version. People who already
          accepted the old wording stay recorded against it. Missing an
          acknowledgement does not block sign-in.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>
          {open?.Id ? "Edit document" : "Add a document"}
        </p>
        <div className="form-group">
          <label htmlFor="doc-title">Title</label>
          <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {DOCUMENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? "btn btn-primary" : "btn btn-secondary"}
              style={{ minHeight: 40, padding: "6px 12px", fontSize: "0.875rem" }}
              onClick={() => setKind(k)}
            >
              {DOCUMENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="form-group">
          <label htmlFor="doc-body">Wording</label>
          <textarea id="doc-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="doc-url">Link to file (optional if wording is filled)</label>
          <input id="doc-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required — workers on this site are asked to accept the current version
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="spinner" /> : open?.Id ? "Save new version" : "Add document"}
          </button>
          {open?.Id && (
            <button className="btn btn-secondary" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          )}
        </div>
        {open?.Id && (
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
            Version {open.version || open.Version}
          </p>
        )}
      </div>

      {open?.Id && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Acknowledgements</p>
          {acks.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Nobody has accepted this document yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {acks.map((ack) => (
                  <tr key={ack.Id}>
                    <td>
                      {[ack.Person?.FirstName, ack.Person?.LastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {ack.DocumentVersion}
                      {ack.DocumentVersion === (open.version || open.Version) ? " (current)" : ""}
                    </td>
                    <td>
                      {ack.AcceptedAt
                        ? new Date(ack.AcceptedAt).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No documents on this site yet.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Kind</th>
                <th>Required</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.Id} style={{ opacity: row.archived ? 0.55 : 1 }}>
                  <td>{row.Title}</td>
                  <td>{kindLabel(row.Kind)}</td>
                  <td>{row.required || row.Required === "1" ? "Yes" : "No"}</td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn btn-secondary"
                      style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                      onClick={() => openDoc(row)}
                    >
                      Open
                    </button>
                    {!row.archived && (
                      <button
                        className="btn btn-secondary"
                        style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                        disabled={saving}
                        onClick={() => archive(row.Id)}
                      >
                        Archive
                      </button>
                    )}
                    {row.archived ? <span className="badge badge-signedout">Archived</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
