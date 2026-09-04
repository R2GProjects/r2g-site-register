"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";
import { readDevicePosition } from "@/lib/client-location";
import { postAttendance } from "@/lib/client-offline";
import type { CredentialState } from "@/lib/credentials";
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@/lib/document-kinds";
import { INCIDENT_KIND_LABEL, type IncidentKind } from "@/lib/incident";

interface WorkerData {
  person: {
    Id: number; FirstName: string; LastName: string;
    WorkerType: string; AccessEnabled: boolean;
    WhiteCardVerified: boolean; InductionStatus: string;
    Company: { Id: number; CompanyName: string } | number | null;
  };
  siteAccess: Array<{
    Id: number; SiteAccessUUID: string;
    Site: { Id: number; SiteUUID: string; SiteCode?: string; SiteName?: string } | number;
    AccessStatus: string; EndDate: string; StartDate: string;
    SiteInductionComplete: boolean;
    InductionExpiresAt: string | null;
    InductionExpired: boolean;
  }>;
  onsite: null | {
    Id: number; Status: string; SignInTime: string;
    Site: { Id: number; SiteUUID: string; SiteCode?: string; SiteName?: string } | number;
  };
  credentials?: CredentialState[];
}

interface SiteDoc {
  id: number;
  title: string;
  kind: DocumentKind;
  url: string;
  version: string;
  siteId: number;
  body?: string;
}

/**
 * Rendered by both /w/<token> (QR or saved link) and /w (after a passcode
 * sign-in, where the worker session cookie carries the identity instead).
 */
export default function WorkerDashboard({ accessToken }: { accessToken?: string }) {
  const router = useRouter();

  const [data, setData] = useState<WorkerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [sites, setSites] = useState<Array<{ Id?: number; SiteCode: string; SiteName: string }>>([]);
  const [signInSiteCode, setSignInSiteCode] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKind, setReportKind] = useState<IncidentKind>("hazard");
  const [reportWhat, setReportWhat] = useState("");
  const [reportWhere, setReportWhere] = useState("");
  const [reportAction, setReportAction] = useState("");
  const [reportSiteId, setReportSiteId] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [outstanding, setOutstanding] = useState<SiteDoc[]>([]);
  const [openDoc, setOpenDoc] = useState<SiteDoc | null>(null);
  const [docAccepted, setDocAccepted] = useState(false);
  const [docSaving, setDocSaving] = useState(false);

  const credentials = accessToken ? { accessToken } : {};
  const inductionReturn = accessToken ? `/w/${encodeURIComponent(accessToken)}` : "/w";

  const load = () => {
    setLoading(true);
    fetch("/api/auth/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
          })
            .then((r) => r.json())
            .then((docs) => {
              if (Array.isArray(docs.outstanding)) setOutstanding(docs.outstanding);
            })
            .catch(() => {});
        }
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [accessToken]);

  useEffect(() => {
    fetch("/api/sites")
      .then(r => r.json())
      .then(list => {
        if (!Array.isArray(list)) return;
        setSites(list);
        if (list[0]?.SiteCode) setSignInSiteCode(String(list[0].SiteCode));
      })
      .catch(() => setSites([]));
  }, []);

  const goToInduction = (siteCode: string) => {
    const query = new URLSearchParams({ return: inductionReturn });
    if (accessToken) query.set("token", accessToken);
    router.push(`/induct/${siteCode}?${query}`);
  };

  const signIn = async (siteCode: string) => {
    setActionLoading(true);
    setMessage("");
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await readDevicePosition();
        lat = pos.lat;
        lng = pos.lng;
      } catch {
        // No GPS — the server will accept a recent scan of the site QR instead.
      }
      const result = await postAttendance("signin", {
        ...credentials,
        siteCode,
        lat,
        lng,
        acknowledgedSiteRules: true,
        fitForWorkConfirmed: true,
      });
      if (result.status === "queued") {
        setMessage("No coverage — saved on this phone. It will send when you are back in range. You can walk on.");
        setMessageIsError(false);
      } else if (result.status === "error") {
        if (result.data.inductionRequired && result.data.siteCode) {
          goToInduction(String(result.data.siteCode));
          return;
        }
        setMessage(result.error || "Sign in failed");
        setMessageIsError(true);
      } else {
        load();
      }
    } catch {
      setMessage("No coverage — saved on this phone. It will send when you are back in range. You can walk on.");
      setMessageIsError(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignInToSite = () => {
    const code = signInSiteCode.trim();
    if (!code) {
      setMessage("Select a site to sign in");
      setMessageIsError(true);
      return;
    }
    signIn(code);
  };

  const handleSignInToAccess = (sa: WorkerData["siteAccess"][0]) => {
    const site = typeof sa.Site === "object" ? sa.Site : null;
    if (!site?.SiteCode) return;
    signIn(site.SiteCode);
  };

  const handleSignOut = async () => {
    setActionLoading(true);
    setMessage("");
    try {
      const result = await postAttendance("signout", { ...credentials });
      if (result.status === "queued") {
        setMessage("No coverage — sign-out saved on this phone. It will send when you are back in range.");
        setMessageIsError(false);
      } else if (result.status === "error") {
        setMessage(result.error || "Sign out failed");
        setMessageIsError(true);
      } else {
        load();
      }
    } catch {
      setMessage("No coverage — sign-out saved on this phone. It will send when you are back in range.");
      setMessageIsError(false);
    } finally {
      setActionLoading(false);
    }
  };

  const openDocument = async (doc: SiteDoc) => {
    setDocAccepted(false);
    setMessage("");
    const params = new URLSearchParams({ id: String(doc.id) });
    if (accessToken) params.set("accessToken", accessToken);
    try {
      const res = await fetch(`/api/documents?${params}`);
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || "Could not open that document");
        setMessageIsError(true);
        return;
      }
      setOpenDoc(body);
    } catch {
      setMessage("No coverage — try again when you have reception.");
      setMessageIsError(true);
    }
  };

  const handleAck = async () => {
    if (!openDoc) return;
    setDocSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/documents/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          documentId: openDoc.id,
          accepted: docAccepted === true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || "Could not record that");
        setMessageIsError(true);
        return;
      }
      setOpenDoc(null);
      setDocAccepted(false);
      setOutstanding((rows) => rows.filter((row) => row.id !== openDoc.id));
      setMessage("Recorded. You can still sign in if others remain.");
      setMessageIsError(false);
    } catch {
      setMessage("No coverage — try again when you have reception.");
      setMessageIsError(true);
    } finally {
      setDocSaving(false);
    }
  };

  const handleReport = async () => {
    if (!data) return;
    const onsiteSite =
      data.onsite && typeof data.onsite.Site === "object" ? data.onsite.Site : null;
    const siteId = onsiteSite?.Id ? String(onsiteSite.Id) : reportSiteId;
    setReportSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          kind: reportKind,
          what: reportWhat,
          whereOnSite: reportWhere,
          action: reportAction,
          siteId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || "Could not send the report");
        setMessageIsError(true);
        return;
      }
      setReportWhat("");
      setReportWhere("");
      setReportAction("");
      setReportOpen(false);
      setMessage("Report sent. The site manager will see it.");
      setMessageIsError(false);
    } catch {
      setMessage("No coverage — try again when you have reception.");
      setMessageIsError(true);
    } finally {
      setReportSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Worker" />
        <div className="accent-bar" />
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Worker" />
        <div className="accent-bar" />
        <div className="container" style={{ textAlign: "center", paddingTop: 80 }}>
          <h2 style={{ color: "var(--danger)" }}>{error}</h2>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => router.push("/")}>
            ← Sign in
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const person = data.person;
  const onsite = data.onsite;
  const onsiteSiteName = onsite && typeof onsite.Site === "object"
    ? onsite.Site.SiteName || onsite.Site.SiteCode
    : null;

  // Only the ones needing action are worth a card; a valid ticket is noise.
  const tickets = (data.credentials || []).filter(
    (c) => c.status === "expired" || c.status === "expiring"
  );
  const hasExpiredTicket = tickets.some((c) => c.status === "expired");

  const workerDashboardUrl =
    accessToken && typeof window !== "undefined"
      ? `${window.location.origin}/w/${accessToken}`
      : "";

  return (
    <div>
      <Header title="Worker" />
      <div className="accent-bar" />

      <div className="container">
        <div className="card">
          <h2 style={{ fontSize: "1.25rem" }}>{person.FirstName} {person.LastName}</h2>
          {person.WorkerType && (
            <span className="badge badge-active" style={{ marginTop: 4 }}>{person.WorkerType}</span>
          )}
          {person.Company && typeof person.Company === "object" && person.Company.CompanyName && (
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: 4 }}>
              {person.Company.CompanyName}
            </p>
          )}
          {!person.AccessEnabled && (
            <p className="error" style={{ marginTop: 4 }}>Access is disabled. Contact admin.</p>
          )}
          {person.InductionStatus && (
            <p style={{ fontSize: "0.875rem", color: "var(--success)", marginTop: 4 }}>
              Induction: {person.InductionStatus}
            </p>
          )}
        </div>

        {tickets.length > 0 && (
          <div
            className="card"
            style={{
              borderColor: hasExpiredTicket ? "var(--danger)" : undefined,
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Your tickets</p>
            {tickets.map((c) => (
              <div key={c.key} style={{ marginBottom: 8 }}>
                <span
                  className={
                    c.status === "expired"
                      ? "badge badge-suspended"
                      : "badge badge-pending"
                  }
                >
                  {c.status === "expired" ? "Expired" : "Expiring"}
                </span>
                <span style={{ marginLeft: 8 }}>{c.label}</span>
                {c.expiresAt && (
                  <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: 2 }}>
                    {c.status === "expired"
                      ? `Expired ${c.expiresAt}.`
                      : `Expires ${c.expiresAt} — ${Math.max(0, c.daysRemaining ?? 0)} days left.`}
                  </p>
                )}
              </div>
            ))}
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              {hasExpiredTicket
                ? "You cannot sign in to a site until this is renewed. Send the new details to your site supervisor."
                : "Renew before the date above so you are not turned away at the gate."}
            </p>
          </div>
        )}

        {outstanding.length > 0 && (
          <div className="card">
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Site documents to read</p>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 12 }}>
              These are required for your sites. You can still sign in if you have not read them yet.
            </p>
            {openDoc ? (
              <>
                <p style={{ fontWeight: 600 }}>{openDoc.title}</p>
                <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 8 }}>
                  {DOCUMENT_KIND_LABEL[openDoc.kind] || "Document"}
                </p>
                {openDoc.body ? (
                  <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>{openDoc.body}</p>
                ) : null}
                {openDoc.url ? (
                  <p style={{ marginBottom: 12 }}>
                    <a href={openDoc.url} target="_blank" rel="noreferrer">
                      Open the file
                    </a>
                  </p>
                ) : null}
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={docAccepted}
                    onChange={(e) => setDocAccepted(e.target.checked)}
                  />
                  I have read this version
                </label>
                <button
                  className="btn btn-primary btn-block"
                  onClick={handleAck}
                  disabled={docSaving}
                >
                  {docSaving ? <div className="spinner" /> : "Record"}
                </button>
                <button
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => { setOpenDoc(null); setDocAccepted(false); }}
                  disabled={docSaving}
                >
                  Back
                </button>
              </>
            ) : (
              outstanding.map((doc) => (
                <button
                  key={doc.id}
                  className="btn btn-secondary btn-block"
                  style={{ marginBottom: 8 }}
                  onClick={() => openDocument(doc)}
                >
                  {DOCUMENT_KIND_LABEL[doc.kind] || "Document"} — {doc.title}
                </button>
              ))
            )}
          </div>
        )}

        {workerDashboardUrl && (
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: "0.875rem" }}>Your Personal QR Code</p>
            <QRCodeSVG
              value={workerDashboardUrl}
              size={140}
              bgColor="#ffffff"
              fgColor="#0a0a0a"
              level="M"
            />
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
              Save this QR or bookmark this page to sign in quickly.
            </p>
          </div>
        )}

        {accessToken && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Your Access Token:</p>
            <div className="card" style={{ background: "var(--surface)" }}>
              <p style={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all", userSelect: "all" }}>
                {accessToken}
              </p>
            </div>
          </div>
        )}

        {onsite ? (
          <div className="card" style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
            <span className="badge badge-onsite" style={{ fontSize: "1rem", padding: "8px 16px" }}>On Site Now</span>
            <p style={{ marginTop: 8 }}>
              {onsiteSiteName ? `Site: ${onsiteSiteName}` : ""}
            </p>
            <p style={{ marginTop: 4 }}>
              Signed in at: {new Date(onsite.SignInTime).toLocaleTimeString()}
            </p>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16, background: "var(--fg)" }}
              onClick={handleSignOut}
              disabled={actionLoading}
            >
              {actionLoading ? <div className="spinner" /> : "Sign Out"}
            </button>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Sign In</h3>
              <div className="form-group">
                <label htmlFor="worker-site">Site</label>
                {sites.length > 0 ? (
                  <select id="worker-site" value={signInSiteCode} onChange={e => setSignInSiteCode(e.target.value)}>
                    {sites.map(s => (
                      <option key={s.SiteCode} value={s.SiteCode}>
                        {s.SiteName} ({s.SiteCode})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="worker-site"
                    value={signInSiteCode}
                    onChange={e => setSignInSiteCode(e.target.value)}
                    placeholder="Enter site code"
                    style={{ textTransform: "uppercase" }}
                  />
                )}
              </div>
              <button className="btn btn-primary btn-block" onClick={handleSignInToSite} disabled={actionLoading}>
                {actionLoading ? <div className="spinner" /> : "Sign In"}
              </button>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
                Location confirms you are at the site. If GPS is blocked, scan the QR at the gate instead.
              </p>
            </div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Your sites:</p>
            {data.siteAccess.length === 0 ? (
              <div className="card">
                <p style={{ color: "var(--muted)" }}>
                  No site access yet. Use Sign In above to sign in to a site.
                </p>
              </div>
            ) : (
              data.siteAccess.map(sa => {
                const site = typeof sa.Site === "object" ? sa.Site : null;
                const siteCode = site?.SiteCode;
                const siteName = site?.SiteName || site?.SiteCode || `Site ${site?.Id || ""}`;
                const isApproved = sa.AccessStatus === "Approved";
                return (
                  <button
                    key={sa.Id}
                    className="btn btn-secondary btn-block"
                    style={{ marginBottom: 8 }}
                    onClick={() => handleSignInToAccess(sa)}
                    disabled={actionLoading || !isApproved || !siteCode}
                  >
                    {sa.AccessStatus === "Pending" ? "(Pending) " : ""}
                    {siteName}
                    {sa.AccessStatus !== "Approved" ? ` [${sa.AccessStatus}]` : ""}
                    {isApproved && sa.InductionExpired
                      ? " — induction expired"
                      : isApproved && sa.SiteInductionComplete && " ✓"}
                  </button>
                );
              })
            )}
          </>
        )}

        {message && (
          <div className={messageIsError ? "error" : "success"} style={{ marginTop: 12 }}>
            {message}
          </div>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          {!reportOpen ? (
            <button className="btn btn-secondary btn-block" onClick={() => setReportOpen(true)}>
              Report a hazard or incident
            </button>
          ) : (
            <>
              <p style={{ fontWeight: 600, marginBottom: 12 }}>Report a hazard or incident</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {(["hazard", "nearmiss", "incident"] as IncidentKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={reportKind === kind ? "btn btn-primary" : "btn btn-secondary"}
                    style={{ minHeight: 40, padding: "6px 12px", fontSize: "0.875rem" }}
                    onClick={() => setReportKind(kind)}
                  >
                    {INCIDENT_KIND_LABEL[kind]}
                  </button>
                ))}
              </div>
              {!onsite && (
                <div className="form-group">
                  <label htmlFor="report-site">Site</label>
                  <select
                    id="report-site"
                    value={reportSiteId}
                    onChange={(e) => setReportSiteId(e.target.value)}
                  >
                    <option value="">Select a site</option>
                    {sites.filter((s) => s.Id).map((s) => (
                      <option key={s.Id} value={s.Id}>{s.SiteName} ({s.SiteCode})</option>
                    ))}
                  </select>
                </div>
              )}
              {onsiteSiteName && (
                <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 8 }}>
                  Site: {onsiteSiteName}
                </p>
              )}
              <div className="form-group">
                <label htmlFor="report-what">What did you see?</label>
                <textarea
                  id="report-what"
                  rows={3}
                  value={reportWhat}
                  onChange={(e) => setReportWhat(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="report-where">Where on site (optional)</label>
                <input
                  id="report-where"
                  value={reportWhere}
                  onChange={(e) => setReportWhere(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="report-action">What did you do (optional)</label>
                <textarea
                  id="report-action"
                  rows={2}
                  value={reportAction}
                  onChange={(e) => setReportAction(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary btn-block"
                onClick={handleReport}
                disabled={reportSaving}
              >
                {reportSaving ? <div className="spinner" /> : "Send report"}
              </button>
              <button
                className="btn btn-secondary btn-block"
                style={{ marginTop: 8 }}
                onClick={() => setReportOpen(false)}
                disabled={reportSaving}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <button className="btn btn-secondary btn-block" style={{ marginTop: 24 }} onClick={() => router.push("/")}>
          Home
        </button>
      </div>
    </div>
  );
}
