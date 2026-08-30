"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";

interface SiteData {
  SiteUUID: string;
  SiteCode: string;
  SiteName: string;
  Address: string | null;
  Status: string;
  SiteManager: string | null;
  SiteManagerPhone: string | null;
  SiteQRCodeURL: string | null;
  RequiresInduction: boolean;
}

export default function SitePage() {
  const params = useParams();
  const router = useRouter();
  const siteCode = (params.siteCode as string).toUpperCase();
  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Token sign-in state
  const [accessToken, setAccessToken] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);

  // Inline registration state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [regForm, setRegForm] = useState({
    firstName: "", lastName: "", mobile: "", email: "",
    companyName: "", workerType: "Contractor", jobRole: "",
    whiteCardNumber: "", licenceNumber: "", licenceType: "",
    emergencyContactName: "", emergencyContactPhone: "",
    passcode: "",
  });
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState("");

  useEffect(() => {
    fetch(`/api/sites?code=${encodeURIComponent(siteCode)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setSite(data);
        }
      })
      .catch(() => setError("Failed to load site"))
      .finally(() => setLoading(false));
  }, [siteCode]);

  const handleWorkerGo = () => {
    const token = accessToken.trim();
    if (!token) return;
    router.push(`/w/${token}`);
  };

  const handleSignIn = async () => {
    const token = accessToken.trim();
    const code = passcode.trim();
    if (!token && !code) {
      setSignInError("Enter your passcode or access token");
      return;
    }
    setSignInError("");
    setSignInLoading(true);
    try {
      const res = await fetch("/api/attend/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token || undefined,
          passcode: code || undefined,
          siteCode,
          acknowledgedSiteRules: true,
          fitForWorkConfirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.inductionRequired && data.siteCode) {
          const dest = token || code;
          router.push(`/induct/${data.siteCode}?token=${encodeURIComponent(dest)}&return=/w/${encodeURIComponent(dest)}`);
          return;
        }
        setSignInError(data.error || "Sign in failed");
      } else {
        router.push(`/w/${encodeURIComponent(token || code)}`);
      }
    } catch {
      setSignInError("Network error");
    } finally {
      setSignInLoading(false);
    }
  };

  const handleRegChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setRegForm({ ...regForm, [e.target.name]: e.target.value });
  };

  const handleRegisterAndSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.firstName || !regForm.lastName) {
      setRegError("First and last name are required");
      return;
    }
    setRegError("");
    setRegLoading(true);
    try {
      const res = await fetch("/api/register/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteCode,
          ...regForm,
          acknowledgedSiteRules: true,
          fitForWorkConfirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || "Registration failed");
      } else {
        // Redirect to worker dashboard — they're already signed in
        router.push(`/w/${data.accessToken}`);
      }
    } catch {
      setRegError("Network error");
    } finally {
      setRegLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title={siteCode} />
        <div className="accent-bar" />
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div>
        <Header title={siteCode} />
        <div className="accent-bar" />
        <div className="container" style={{ textAlign: "center", paddingTop: 80 }}>
          <h2>{error || "Site not found"}</h2>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>Check the site code and try again.</p>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => router.push("/")}>
            ← Sign in
          </button>
        </div>
      </div>
    );
  }

  const siteUrl = typeof window !== "undefined" ? `${window.location.origin}/s/${site.SiteCode}` : "";

  return (
    <div>
      <Header title={site.SiteCode} />
      <div className="accent-bar" />

      <div className="container">
        <div className="card" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: 8 }}>{site.SiteName}</h2>
          {site.Address && <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{site.Address}</p>}
          {site.SiteManager && (
            <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              Manager: {site.SiteManager}
              {site.SiteManagerPhone ? ` (${site.SiteManagerPhone})` : ""}
            </p>
          )}
          {site.Status !== "Active" && (
            <div className="badge badge-pending" style={{ marginTop: 8 }}>Status: {site.Status}</div>
          )}
          {site.RequiresInduction && (
            <div className="badge badge-active" style={{ marginTop: 8, marginLeft: 4 }}>Induction Required</div>
          )}
        </div>

        {/* QR Code */}
        {siteUrl && (
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: "0.875rem" }}>Scan to access this site</p>
            <QRCodeSVG
              value={siteUrl}
              size={160}
              bgColor="#ffffff"
              fgColor="#0a0a0a"
              level="M"
            />
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8, wordBreak: "break-all" }}>
              {siteUrl}
            </p>
          </div>
        )}

        {showTokenInput ? (
          <div className="card">
            {!showRegisterForm ? (
              <>
                <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Sign In</h3>
                <div className="form-group">
                  <label>Passcode</label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={e => setPasscode(e.target.value)}
                    placeholder="Your passcode"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Access Token (optional)</label>
                  <input
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    placeholder="Or paste your token — add a passcode above to save it"
                  />
                </div>
                {signInError && <div className="error" style={{ marginBottom: 12 }}>{signInError}</div>}
                <button className="btn btn-primary btn-block" onClick={handleSignIn} disabled={signInLoading}>
                  {signInLoading ? <div className="spinner" /> : "Sign In"}
                </button>
                <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={handleWorkerGo}>
                  Go to My Dashboard
                </button>
                <button
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => { setShowRegisterForm(true); setRegError(""); }}
                >
                  Don&apos;t have a token? Register &amp; Sign In
                </button>
                <button
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowTokenInput(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Register &amp; Sign In</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 16 }}>
                  Enter your details to register and sign in to <strong>{site.SiteName}</strong>.
                </p>

                <form onSubmit={handleRegisterAndSignIn}>
                  <div className="form-group">
                    <label>First Name *</label>
                    <input name="firstName" value={regForm.firstName} onChange={handleRegChange} required autoFocus />
                  </div>
                  <div className="form-group">
                    <label>Last Name *</label>
                    <input name="lastName" value={regForm.lastName} onChange={handleRegChange} required />
                  </div>
                  <div className="form-group">
                    <label>Company / Employer</label>
                    <input name="companyName" value={regForm.companyName} onChange={handleRegChange} placeholder="Optional — will create if new" />
                  </div>
                  <div className="form-group">
                    <label>Mobile</label>
                    <input name="mobile" type="tel" value={regForm.mobile} onChange={handleRegChange} />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input name="email" type="email" value={regForm.email} onChange={handleRegChange} />
                  </div>
                  <div className="form-group">
                    <label>Worker Type</label>
                    <select name="workerType" value={regForm.workerType} onChange={handleRegChange}>
                      <option>Employee</option><option>Contractor</option><option>Subcontractor</option>
                      <option>Consultant</option><option>Delivery</option><option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Job Role</label>
                    <input name="jobRole" value={regForm.jobRole} onChange={handleRegChange} placeholder="e.g. Carpenter, Plumber" />
                  </div>
                  <div className="form-group">
                    <label>White Card Number</label>
                    <input name="whiteCardNumber" value={regForm.whiteCardNumber} onChange={handleRegChange} />
                  </div>
                  <div className="form-group">
                    <label>Licence Number</label>
                    <input name="licenceNumber" value={regForm.licenceNumber} onChange={handleRegChange} />
                  </div>
                  <div className="form-group">
                    <label>Licence Type</label>
                    <input name="licenceType" value={regForm.licenceType} onChange={handleRegChange} placeholder="e.g. Electrical, Plumbing" />
                  </div>
                  <div className="form-group">
                    <label>Emergency Contact Name</label>
                    <input name="emergencyContactName" value={regForm.emergencyContactName} onChange={handleRegChange} />
                  </div>
                  <div className="form-group">
                    <label>Emergency Contact Phone</label>
                    <input name="emergencyContactPhone" type="tel" value={regForm.emergencyContactPhone} onChange={handleRegChange} />
                  </div>
                  <div className="form-group">
                    <label>Passcode</label>
                    <input name="passcode" type="password" value={regForm.passcode} onChange={handleRegChange} placeholder="At least 4 characters" />
                  </div>

                  {regError && <div className="error" style={{ marginBottom: 16 }}>{regError}</div>}

                  <button className="btn btn-primary btn-block" type="submit" disabled={regLoading}>
                    {regLoading ? <div className="spinner" /> : "Register & Sign In"}
                  </button>
                  <button
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: 8 }}
                    type="button"
                    onClick={() => { setShowRegisterForm(false); setRegError(""); }}
                  >
                    ← Back — I have a token
                  </button>
                  <button
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: 8 }}
                    type="button"
                    onClick={() => { setShowTokenInput(false); setShowRegisterForm(false); }}
                  >
                    Cancel
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button className="btn btn-primary btn-block" onClick={() => setShowTokenInput(true)}>
              Sign In
            </button>
            <button className="btn btn-secondary btn-block" onClick={() => router.push(`/visitor/${siteCode}`)}>
              I&apos;m a Visitor
            </button>
          </div>
        )}

        <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => router.push("/")}>
          Scan Different Site
        </button>
      </div>
    </div>
  );
}