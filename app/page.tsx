"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

const emptyRegForm = {
  firstName: "", lastName: "", mobile: "", email: "",
  companyName: "", workerType: "Contractor", jobRole: "",
  whiteCardNumber: "", licenceNumber: "", licenceType: "",
  emergencyContactName: "", emergencyContactPhone: "",
  siteCode: "", passcode: "",
};

export default function HomePage() {
  const [siteCode, setSiteCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [workerMobile, setWorkerMobile] = useState("");
  const [workerPasscode, setWorkerPasscode] = useState("");
  const [workerLoading, setWorkerLoading] = useState(false);
  const [mode, setMode] = useState<"site" | "worker" | "register" | null>(null);
  const [error, setError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [nearbySites, setNearbySites] = useState<Array<Record<string, unknown>> | null>(null);
  const [sites, setSites] = useState<Array<Record<string, unknown>>>([]);
  const [regForm, setRegForm] = useState({ ...emptyRegForm });
  const [regLoading, setRegLoading] = useState(false);
  const [regResult, setRegResult] = useState<{ accessToken?: string; passcode?: string | null; note?: string } | null>(null);
  const router = useRouter();

  const openRegister = () => {
    setMode("register");
    setError("");
    setRegResult(null);
    setRegForm({ ...emptyRegForm });
    fetch("/api/sites")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSites(data); })
      .catch(() => setSites([]));
  };

  const handleSiteEnter = () => {
    const code = siteCode.trim().toUpperCase();
    if (!code) { setError("Enter a site code"); return; }
    router.push(`/s/${code}`);
  };

  const handleWorkerAccess = async () => {
    const token = accessToken.trim();
    if (token) {
      router.push(`/w/${encodeURIComponent(token)}`);
      return;
    }

    const mobile = workerMobile.trim();
    const passcode = workerPasscode.trim();
    if (!mobile || !passcode) {
      setError("Enter your mobile number and passcode, or paste your access token");
      return;
    }

    setError("");
    setWorkerLoading(true);
    try {
      const res = await fetch("/api/auth/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign in failed");
      } else {
        router.push("/w");
      }
    } catch {
      setError("Network error");
    } finally {
      setWorkerLoading(false);
    }
  };

  const handleRegChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setRegForm({ ...regForm, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.firstName.trim() || !regForm.lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    setError("");
    setRegLoading(true);
    try {
      const res = await fetch("/api/register/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...regForm,
          siteCode: regForm.siteCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        setRegResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setRegLoading(false);
    }
  };

  const handleFindMySite = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setError("");
    setNearbySites(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/sites/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&radius=500`
          );
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || "Failed to find nearby sites");
          } else if (!data.length) {
            setNearbySites([]);
          } else {
            setNearbySites(data);
          }
        } catch {
          setError("Network error finding nearby sites");
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location access denied. Enter site code manually.");
        } else if (err.code === err.TIMEOUT) {
          setError("Location request timed out. Enter site code manually.");
        } else {
          setError("Could not determine location. Enter site code manually.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div>
      <Header title="R2G Site Register" showBack={false} />
      <div className="accent-bar" />

      <div className="container">
        <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>Site Attendance Register</p>
          <p style={{ color: "var(--muted)", marginTop: 4, fontSize: "0.875rem" }}>
            Sign in to a construction site or access your worker profile
          </p>
        </div>

        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

        {geoLoading && (
          <div className="loading"><div className="spinner" /></div>
        )}

        {nearbySites && nearbySites.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>📍 Nearby Sites</h3>
            {nearbySites.map((s) => (
              <button
                key={s.Id as number}
                className="btn btn-secondary btn-block"
                style={{ marginBottom: 8, justifyContent: "space-between" }}
                onClick={() => router.push(`/s/${s.SiteCode}`)}
              >
                <span>{s.SiteName as string} ({s.SiteCode as string})</span>
                <span className="badge badge-active">{(s.distanceM as number)}m</span>
              </button>
            ))}
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "center", margin: "8px 0" }}>
              — or enter a site code below —
            </p>
          </div>
        )}

        {nearbySites && nearbySites.length === 0 && (
          <div className="card" style={{ marginBottom: 16, textAlign: "center" }}>
            <p style={{ color: "var(--muted)" }}>
              No R2G sites found within 500m of your location. Enter a site code manually.
            </p>
          </div>
        )}

        {!nearbySites && (
          <>
            {!mode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  className="btn btn-primary btn-block"
                  onClick={handleFindMySite}
                  disabled={geoLoading}
                >
                  📍 Find My Site
                </button>
                <button className="btn btn-secondary btn-block" onClick={() => { setMode("site"); setError(""); }}>
                  I&apos;m at a Site
                </button>
                <button className="btn btn-secondary btn-block" onClick={openRegister}>
                  Register as Worker
                </button>
                <button className="btn btn-secondary btn-block" onClick={() => { setMode("worker"); setError(""); }}>
                  I&apos;m a Registered Worker
                </button>
              </div>
            ) : mode === "site" ? (
              <div className="card">
                <h2 style={{ fontSize: "1.125rem", marginBottom: 16 }}>Enter Site Code</h2>
                <div className="form-group">
                  <label>Site Code</label>
                  <input
                    value={siteCode}
                    onChange={e => { setSiteCode(e.target.value); setError(""); }}
                    placeholder="e.g. CNR15"
                    autoFocus
                    style={{ textTransform: "uppercase", letterSpacing: "2px", textAlign: "center", fontSize: "1.25rem" }}
                  />
                </div>
                <button className="btn btn-primary btn-block" onClick={handleSiteEnter}>Go to Site</button>
                <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={() => { setMode(null); setError(""); }}>
                  Back
                </button>
              </div>
            ) : mode === "register" ? (
              <div className="card">
                {regResult ? (
                  <>
                    <h2 style={{ fontSize: "1.125rem", marginBottom: 12 }}>You&apos;re registered</h2>
                    <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: 16 }}>
                      {regResult.note}
                    </p>
                    {regResult.passcode && (
                      <>
                        <p style={{ fontWeight: 600, marginBottom: 8 }}>Your Passcode</p>
                        <p style={{ fontFamily: "monospace", wordBreak: "break-all", background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontSize: "1rem" }}>
                          {regResult.passcode}
                        </p>
                      </>
                    )}
                    <p style={{ fontWeight: 600, margin: "16px 0 8px" }}>Your Access Token</p>
                    <p style={{ fontFamily: "monospace", wordBreak: "break-all", background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontSize: "0.75rem" }}>
                      {regResult.accessToken}
                    </p>
                    <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--muted)" }}>
                      Use your passcode or this token to sign in.
                    </p>
                    <button
                      className="btn btn-primary btn-block"
                      style={{ marginTop: 16 }}
                      onClick={() => router.push(`/w/${regResult.accessToken}`)}
                    >
                      Go to My Dashboard
                    </button>
                    <button
                      className="btn btn-secondary btn-block"
                      style={{ marginTop: 8 }}
                      onClick={() => { setMode(null); setRegResult(null); setError(""); }}
                    >
                      Back to Home
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleRegister}>
                    <h2 style={{ fontSize: "1.125rem", marginBottom: 16 }}>Register as Worker</h2>
                    <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: 16 }}>
                      Add yourself to the register. A site is optional if you are not on site yet.
                    </p>
                    {sites.length > 0 && (
                      <div className="form-group">
                        <label>Site (optional)</label>
                        <select name="siteCode" value={regForm.siteCode} onChange={handleRegChange}>
                          <option value="">No site yet</option>
                          {sites.map(s => (
                            <option key={s.Id as number} value={s.SiteCode as string}>
                              {s.SiteName as string} ({s.SiteCode as string})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="form-group">
                      <label>First Name *</label>
                      <input name="firstName" value={regForm.firstName} onChange={handleRegChange} required autoFocus />
                    </div>
                    <div className="form-group">
                      <label>Last Name *</label>
                      <input name="lastName" value={regForm.lastName} onChange={handleRegChange} required />
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
                      <label>Company / Employer</label>
                      <input name="companyName" value={regForm.companyName} onChange={handleRegChange} placeholder="Optional — will create if new" />
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
                      <input name="passcode" type="password" value={regForm.passcode} onChange={handleRegChange} placeholder="At least 6 characters — for faster sign-in" />
                      <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
                        You sign in with your mobile number and this passcode, so a mobile number is required to use one.
                      </p>
                    </div>
                    <button className="btn btn-primary btn-block" type="submit" disabled={regLoading}>
                      {regLoading ? <div className="spinner" /> : "Register"}
                    </button>
                    <button
                      className="btn btn-secondary btn-block"
                      style={{ marginTop: 8 }}
                      type="button"
                      onClick={() => { setMode(null); setError(""); }}
                    >
                      Back
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="card">
                <h2 style={{ fontSize: "1.125rem", marginBottom: 16 }}>Sign In</h2>
                <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: 16 }}>
                  Use your mobile number and passcode, or paste your access token.
                </p>
                <div className="form-group">
                  <label htmlFor="home-mobile">Mobile Number</label>
                  <input
                    id="home-mobile"
                    type="tel"
                    autoComplete="tel"
                    value={workerMobile}
                    onChange={e => { setWorkerMobile(e.target.value); setError(""); }}
                    placeholder="e.g. 0412 345 678"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="home-passcode">Passcode</label>
                  <input
                    id="home-passcode"
                    type="password"
                    autoComplete="current-password"
                    value={workerPasscode}
                    onChange={e => { setWorkerPasscode(e.target.value); setError(""); }}
                    placeholder="Your passcode"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="home-token">Access Token (optional)</label>
                  <input
                    id="home-token"
                    value={accessToken}
                    onChange={e => { setAccessToken(e.target.value); setError(""); }}
                    placeholder="Or paste your token"
                  />
                </div>
                <button className="btn btn-primary btn-block" onClick={handleWorkerAccess} disabled={workerLoading}>
                  {workerLoading ? <div className="spinner" /> : "Access My Profile"}
                </button>
                <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={() => { setMode(null); setError(""); }}>
                  Back
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
