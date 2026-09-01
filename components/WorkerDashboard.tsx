"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";

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
  const [sites, setSites] = useState<Array<{ SiteCode: string; SiteName: string }>>([]);
  const [signInSiteCode, setSignInSiteCode] = useState("");

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
        else setData(d);
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
      const res = await fetch("/api/attend/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          siteCode,
          acknowledgedSiteRules: true,
          fitForWorkConfirmed: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.inductionRequired && d.siteCode) {
          goToInduction(d.siteCode);
          return;
        }
        setMessage(d.error || "Sign in failed");
        setMessageIsError(true);
      } else {
        load();
      }
    } catch {
      setMessage("Network error");
      setMessageIsError(true);
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
      const res = await fetch("/api/attend/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const d = await res.json();
      if (!res.ok) {
        setMessage(d.error || "Sign out failed");
        setMessageIsError(true);
      } else {
        load();
      }
    } catch {
      setMessage("Network error");
      setMessageIsError(true);
    } finally {
      setActionLoading(false);
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

        <button className="btn btn-secondary btn-block" style={{ marginTop: 24 }} onClick={() => router.push("/")}>
          Home
        </button>
      </div>
    </div>
  );
}
