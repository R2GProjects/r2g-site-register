"use client";
import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";

type Row = Record<string, unknown>;

const named = (value: unknown, first: string, second?: string): string => {
  if (!value || typeof value !== "object") return "-";
  const obj = value as Record<string, unknown>;
  const parts = [obj[first], second ? obj[second] : null]
    .filter(Boolean)
    .map(String);
  return parts.length > 0 ? parts.join(" ") : "-";
};

const when = (value: unknown): string =>
  value ? new Date(String(value)).toLocaleString() : "-";

export default function InductionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Row[]>([]);
  const [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [detail, setDetail] = useState<Row | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(
    (p: number) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: "50" });
      if (siteId) params.set("siteId", siteId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      fetch(`/api/admin/inductions?${params}`)
        .then((r) => r.json())
        .then((d) => {
          setRows(d.list || []);
          setTotal(d.totalRows || 0);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    },
    [siteId, from, to]
  );

  useEffect(() => {
    fetch("/api/admin/sites?limit=200")
      .then((r) => r.json())
      .then((d) => setSites(d.list || []))
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetail({});
    try {
      const res = await fetch(`/api/admin/inductions?id=${id}`);
      const d = await res.json();
      setDetail(res.ok ? d : { error: d.error || "Could not load this record" });
    } catch {
      setDetail({ error: "Network error" });
    } finally {
      setDetailLoading(false);
    }
  };

  const signature = (detail?.SignatureImage || detail?.Signature) as
    | string
    | undefined;
  const snapshot = detail?.RulesSnapshot as string | undefined;

  return (
    <div style={{ paddingTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Inductions ({total})</h2>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
          <label>Site</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.Id as number} value={String(s.Id)}>
                {(s.SiteName as string) || (s.SiteCode as string)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(siteId || from || to) && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSiteId("");
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No inductions match these filters. Records signed before signatures
          were introduced will show without one.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Site</th>
                <th>Completed</th>
                <th>Expires</th>
                <th>Rules version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Id as number}>
                  <td>{named(r.Person, "FirstName", "LastName")}</td>
                  <td>{named(r.Site, "SiteName")}</td>
                  <td>{when(r.CompletedAt)}</td>
                  <td>{when(r.ExpiresAt)}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {(r.InductionVersion as string) || "-"}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ minHeight: 32, padding: "4px 8px", fontSize: "0.7rem" }}
                      onClick={() => openDetail(r.Id as number)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 50 && (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                disabled={page === 0}
                onClick={() => {
                  setPage(page - 1);
                  load(page - 1);
                }}
              >
                Previous
              </button>
              <span style={{ padding: "8px 16px" }}>
                Page {page + 1} / {Math.ceil(total / 50)}
              </span>
              <button
                className="btn btn-secondary"
                disabled={(page + 1) * 50 >= total}
                onClick={() => {
                  setPage(page + 1);
                  load(page + 1);
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {detail && (
        <Modal title="Induction Record" onClose={() => setDetail(null)}>
          {detailLoading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : detail.error ? (
            <p className="error">{String(detail.error)}</p>
          ) : (
            <>
              <p>
                <strong>{named(detail.Person, "FirstName", "LastName")}</strong> at{" "}
                {named(detail.Site, "SiteName")}
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                Completed {when(detail.CompletedAt)} · expires {when(detail.ExpiresAt)}
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", fontFamily: "monospace" }}>
                {(detail.InductionVersion as string) || "no version"}
              </p>

              <p style={{ fontWeight: 600, marginTop: 16, marginBottom: 4 }}>Signature</p>
              {signature ? (
                <img
                  src={signature}
                  alt="Worker signature"
                  style={{
                    width: "100%",
                    background: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                />
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  Not captured. This induction predates signature capture.
                </p>
              )}

              <p style={{ fontWeight: 600, marginTop: 16, marginBottom: 4 }}>
                Rules accepted
              </p>
              {snapshot ? (
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "0.875rem",
                    lineHeight: 1.5,
                    background: "var(--surface)",
                    borderRadius: "var(--radius)",
                    padding: 12,
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  {snapshot}
                </div>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                  No copy of the rules was stored with this induction, so the
                  wording shown at the time cannot be reproduced.
                </p>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
