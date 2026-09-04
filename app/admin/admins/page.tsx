"use client";
import { useCallback, useEffect, useState } from "react";

interface AdminRow {
  Id: number;
  Username: string;
  DisplayName: string;
  Active: boolean;
}

export default function AdminsPage() {
  const [list, setList] = useState<AdminRow[]>([]);
  const [you, setYou] = useState("");
  const [bootstrap, setBootstrap] = useState("");
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/admins")
      .then((r) => r.json())
      .then((data) => {
        setList(data.list || []);
        setYou(String(data.you || ""));
        setBootstrap(String(data.bootstrap || ""));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditId(null);
    setUsername("");
    setDisplayName("");
    setPassword("");
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/admins", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Id: editId,
          Username: username,
          DisplayName: displayName,
          password,
          Active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      reset();
      load();
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (id: number, active: boolean) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/admins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Id: id, active }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Admins</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16, fontSize: "0.875rem" }}>
        Corrections and emergency sign-outs are recorded against the person who
        is signed in
        {you ? <> — currently <strong>{you}</strong></> : null}.
        The environment account
        {bootstrap ? <> (<strong>{bootstrap}</strong>)</> : null} still works
        and cannot be switched off here.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, marginBottom: 12 }}>
          {editId ? "Edit admin" : "Add an admin"}
        </p>
        <div className="form-group">
          <label htmlFor="adm-user">Login name</label>
          <input
            id="adm-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label htmlFor="adm-name">Display name (shown on the audit log)</label>
          <input
            id="adm-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="adm-pass">
            {editId ? "New password (leave blank to keep)" : "Password"}
          </label>
          <input
            id="adm-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="spinner" /> : editId ? "Save" : "Add admin"}
          </button>
          {editId ? (
            <button className="btn btn-secondary" onClick={reset} disabled={saving}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No named logins yet. Add one so the next correction is not filed as
          a shared admin.
        </p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Login</th>
                <th>Name</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.Id} style={{ opacity: row.Active ? 1 : 0.55 }}>
                  <td>{row.Username}</td>
                  <td>{row.DisplayName || row.Username}</td>
                  <td>
                    <span className={row.Active ? "badge badge-active" : "badge badge-suspended"}>
                      {row.Active ? "Active" : "Off"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn btn-secondary"
                      style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                      onClick={() => {
                        setEditId(row.Id);
                        setUsername(row.Username);
                        setDisplayName(row.DisplayName);
                        setPassword("");
                        setError("");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ minHeight: 32, padding: "4px 12px", fontSize: "0.75rem" }}
                      disabled={saving}
                      onClick={() => setActive(row.Id, !row.Active)}
                    >
                      {row.Active ? "Switch off" : "Switch on"}
                    </button>
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
