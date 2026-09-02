"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";
import PrivacyNotice from "@/components/PrivacyNotice";
import { readDevicePosition } from "@/lib/client-location";
import {
  DEFAULT_IDLE_MS,
  DEFAULT_SUCCESS_MS,
  DEFAULT_VISITOR_PASS_MS,
  kioskIdleExpired,
  visitorPassUrl,
} from "@/lib/kiosk";

interface SiteData {
  SiteCode: string;
  SiteName: string;
  Address: string | null;
  Status: string;
  SiteManager: string | null;
  SiteManagerPhone: string | null;
  RequiresInduction: boolean;
}

const emptyReg = {
  firstName: "",
  lastName: "",
  mobile: "",
  companyName: "",
  jobRole: "",
  passcode: "",
};

const emptyVisitor = {
  firstName: "",
  lastName: "",
  mobile: "",
  companyName: "",
  reasonForVisit: "",
  personVisiting: "",
};

type Panel = "home" | "worker" | "register" | "visitor";

interface Success {
  kind: "in" | "out" | "visitor" | "already";
  title: string;
  detail: string;
  passUrl?: string;
}

async function latLng(): Promise<{ lat?: number; lng?: number }> {
  try {
    return await readDevicePosition();
  } catch {
    return {};
  }
}

export default function KioskPage() {
  const params = useParams();
  const router = useRouter();
  const siteCode = (params.siteCode as string).toUpperCase();

  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>("home");
  const [busy, setBusy] = useState(false);

  const [mobile, setMobile] = useState("");
  const [passcode, setPasscode] = useState("");
  const [formError, setFormError] = useState("");
  const [inductionRequired, setInductionRequired] = useState(false);

  const [regForm, setRegForm] = useState({ ...emptyReg });
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [visitorForm, setVisitorForm] = useState({ ...emptyVisitor });
  const [visitorPrivacy, setVisitorPrivacy] = useState(false);

  const [success, setSuccess] = useState<Success | null>(null);
  const lastActivity = useRef(Date.now());

  const reset = useCallback(() => {
    setPanel("home");
    setBusy(false);
    setMobile("");
    setPasscode("");
    setFormError("");
    setInductionRequired(false);
    setRegForm({ ...emptyReg });
    setPrivacyAccepted(false);
    setVisitorForm({ ...emptyVisitor });
    setVisitorPrivacy(false);
    setSuccess(null);
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kiosk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enter", siteCode }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setSite(data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load site");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteCode]);

  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    const id = window.setInterval(() => {
      if (success) return;
      if (kioskIdleExpired(lastActivity.current, Date.now(), DEFAULT_IDLE_MS)) {
        reset();
      }
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
      window.clearInterval(id);
    };
  }, [reset, success]);

  useEffect(() => {
    if (!success || busy) return;
    const wait =
      success.kind === "visitor" ? DEFAULT_VISITOR_PASS_MS : DEFAULT_SUCCESS_MS;
    const id = window.setTimeout(reset, wait);
    return () => window.clearTimeout(id);
  }, [success, reset, busy]);

  const leaveKiosk = async () => {
    try {
      await fetch("/api/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exit" }),
      });
    } catch {
      // Leaving still has to work if the network dropped.
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    router.push("/");
  };

  const goFullscreen = () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(() => undefined);
  };

  const handleWorker = async (action: "in" | "out") => {
    const number = mobile.trim();
    const code = passcode.trim();
    if (!number || !code) {
      setFormError("Enter your mobile number and passcode");
      return;
    }
    setFormError("");
    setInductionRequired(false);
    setBusy(true);
    try {
      if (action === "out") {
        const res = await fetch("/api/attend/signout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mobile: number, passcode: code }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSuccess(null);
          setPanel("worker");
          setFormError(data.error || "Sign out failed");
        } else {
          setSuccess({
            kind: "out",
            title: "Signed out",
            detail: "Have a good one.",
          });
        }
        return;
      }

      const pos = await latLng();
      const res = await fetch("/api/attend/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: number,
          passcode: code,
          siteCode,
          lat: pos.lat,
          lng: pos.lng,
          acknowledgedSiteRules: true,
          fitForWorkConfirmed: true,
          kiosk: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.inductionRequired) {
          setInductionRequired(true);
          setFormError(
            data.error || "Site induction required before sign-in"
          );
        } else {
          setFormError(data.error || "Sign in failed");
        }
        return;
      }
      const name = [data.person?.FirstName, data.person?.LastName]
        .filter(Boolean)
        .join(" ");
      if (data.alreadyOnSite) {
        setSuccess({
          kind: "already",
          title: name ? `${name} is already signed in` : "Already signed in",
          detail: "Use Sign out if you are leaving.",
        });
      } else {
        setSuccess({
          kind: "in",
          title: name ? `Welcome, ${name}` : "Signed in",
          detail: site?.SiteName || siteCode,
        });
      }
    } catch {
      setFormError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.firstName.trim() || !regForm.lastName.trim()) {
      setFormError("First and last name are required");
      return;
    }
    if (!regForm.mobile.trim() || !regForm.passcode.trim()) {
      setFormError("Mobile number and passcode are required so you can sign in next time");
      return;
    }
    if (!privacyAccepted) {
      setFormError("Please confirm you have read how your details are used.");
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const pos = await latLng();
      const res = await fetch("/api/register/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteCode,
          ...regForm,
          workerType: "Contractor",
          lat: pos.lat,
          lng: pos.lng,
          acknowledgedSiteRules: true,
          fitForWorkConfirmed: true,
          privacyAccepted,
          kiosk: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Registration failed");
        return;
      }
      const name = `${regForm.firstName.trim()} ${regForm.lastName.trim()}`;
      setSuccess({
        kind: "in",
        title: `Welcome, ${name}`,
        detail: data.note || site?.SiteName || siteCode,
      });
    } catch {
      setFormError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const handleVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorForm.firstName.trim() || !visitorForm.lastName.trim()) {
      setFormError("First and last name are required");
      return;
    }
    if (!visitorPrivacy) {
      setFormError("Please confirm you have read how your details are used.");
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const res = await fetch("/api/register/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteCode,
          ...visitorForm,
          acknowledgedSiteRules: true,
          privacyAccepted: visitorPrivacy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Sign in failed");
        return;
      }
      const name = `${visitorForm.firstName.trim()} ${visitorForm.lastName.trim()}`;
      setSuccess({
        kind: "visitor",
        title: `Welcome, ${name}`,
        detail: "Photograph this pass — you need it to sign out when you leave.",
        passUrl: data.passToken
          ? visitorPassUrl(window.location.origin, data.passToken)
          : undefined,
      });
    } catch {
      setFormError("Network error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Kiosk" showBack={false} hideAdmin />
        <div className="accent-bar" />
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div>
        <Header title={siteCode} showBack={false} hideAdmin />
        <div className="accent-bar" />
        <div className="container" style={{ textAlign: "center", paddingTop: 80 }}>
          <h2>{error || "Site not found"}</h2>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            Check the site code with the site manager.
          </p>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={leaveKiosk}>
            Leave kiosk
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div>
        <Header title={site.SiteName} showBack={false} hideAdmin />
        <div className="accent-bar" />
        <div className="container" style={{ textAlign: "center", paddingTop: 32 }}>
          <div className="card">
            <span
              className={`badge ${success.kind === "out" ? "badge-signedout" : "badge-onsite"}`}
              style={{ fontSize: "1rem", padding: "8px 16px" }}
            >
              {success.kind === "out" ? "Signed out" : "On site"}
            </span>
            <h2 style={{ fontSize: "1.5rem", marginTop: 16 }}>{success.title}</h2>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>{success.detail}</p>
            {success.passUrl && (
              <div style={{ marginTop: 20 }}>
                <QRCodeSVG
                  value={success.passUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  level="M"
                />
              </div>
            )}
            <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} onClick={reset}>
              Next person
            </button>
            {success.kind === "already" && (
              <button
                className="btn btn-secondary btn-block"
                style={{ marginTop: 12 }}
                onClick={() => handleWorker("out")}
                disabled={busy}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={site.SiteName} showBack={false} hideAdmin />
      <div className="accent-bar" />
      <div className="container">
        {panel === "home" && (
          <>
            <div className="card" style={{ textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                {site.Address || site.SiteCode}
              </p>
              {site.RequiresInduction && (
                <div className="badge badge-active" style={{ marginTop: 8 }}>
                  Induction required
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-block" onClick={() => { setFormError(""); setPanel("worker"); }}>
              Worker sign in / out
            </button>
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => { setFormError(""); setPrivacyAccepted(false); setPanel("register"); }}
            >
              First time here
            </button>
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => { setFormError(""); setVisitorPrivacy(false); setPanel("visitor"); }}
            >
              Visitor
            </button>
          </>
        )}

        {panel === "worker" && (
          <div className="card">
            <h3 style={{ fontSize: "1.125rem", marginBottom: 16 }}>Worker</h3>
            <div className="form-group">
              <label htmlFor="kiosk-mobile">Mobile number</label>
              <input
                id="kiosk-mobile"
                type="tel"
                autoComplete="off"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. 0412 345 678"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="kiosk-passcode">Passcode</label>
              <input
                id="kiosk-passcode"
                type="password"
                autoComplete="off"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </div>
            {inductionRequired && (
              <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 12 }}>
                Complete the induction on your own phone — scan the site QR — then
                sign in here. A shared tablet cannot keep your session.
              </p>
            )}
            {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}
            <button
              className="btn btn-primary btn-block"
              onClick={() => handleWorker("in")}
              disabled={busy}
            >
              {busy ? <div className="spinner" /> : "Sign in"}
            </button>
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={() => handleWorker("out")}
              disabled={busy}
            >
              Sign out
            </button>
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 12 }}
              onClick={reset}
              disabled={busy}
            >
              Back
            </button>
          </div>
        )}

        {panel === "register" && (
          <form onSubmit={handleRegister} className="card">
            <h3 style={{ fontSize: "1.125rem", marginBottom: 16 }}>First time here</h3>
            <div className="form-group">
              <label>First name *</label>
              <input
                name="firstName"
                autoComplete="off"
                value={regForm.firstName}
                onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last name *</label>
              <input
                name="lastName"
                autoComplete="off"
                value={regForm.lastName}
                onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Mobile *</label>
              <input
                name="mobile"
                type="tel"
                autoComplete="off"
                value={regForm.mobile}
                onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Passcode * (at least 6 characters)</label>
              <input
                name="passcode"
                type="password"
                autoComplete="new-password"
                value={regForm.passcode}
                onChange={(e) => setRegForm({ ...regForm, passcode: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                name="companyName"
                autoComplete="off"
                value={regForm.companyName}
                onChange={(e) => setRegForm({ ...regForm, companyName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Job role</label>
              <input
                name="jobRole"
                autoComplete="off"
                value={regForm.jobRole}
                onChange={(e) => setRegForm({ ...regForm, jobRole: e.target.value })}
              />
            </div>
            <PrivacyNotice accepted={privacyAccepted} onChange={setPrivacyAccepted} />
            {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? <div className="spinner" /> : "Register and sign in"}
            </button>
            <button
              className="btn btn-secondary btn-block"
              type="button"
              style={{ marginTop: 12 }}
              onClick={reset}
              disabled={busy}
            >
              Back
            </button>
          </form>
        )}

        {panel === "visitor" && (
          <form onSubmit={handleVisitor} className="card">
            <h3 style={{ fontSize: "1.125rem", marginBottom: 16 }}>Visitor</h3>
            <div className="form-group">
              <label>First name *</label>
              <input
                autoComplete="off"
                value={visitorForm.firstName}
                onChange={(e) => setVisitorForm({ ...visitorForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last name *</label>
              <input
                autoComplete="off"
                value={visitorForm.lastName}
                onChange={(e) => setVisitorForm({ ...visitorForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Mobile</label>
              <input
                type="tel"
                autoComplete="off"
                value={visitorForm.mobile}
                onChange={(e) => setVisitorForm({ ...visitorForm, mobile: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                autoComplete="off"
                value={visitorForm.companyName}
                onChange={(e) => setVisitorForm({ ...visitorForm, companyName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Reason for visit</label>
              <input
                autoComplete="off"
                value={visitorForm.reasonForVisit}
                onChange={(e) => setVisitorForm({ ...visitorForm, reasonForVisit: e.target.value })}
                placeholder="e.g. Delivery, Meeting"
              />
            </div>
            <div className="form-group">
              <label>Person you&apos;re visiting</label>
              <input
                autoComplete="off"
                value={visitorForm.personVisiting}
                onChange={(e) => setVisitorForm({ ...visitorForm, personVisiting: e.target.value })}
              />
            </div>
            <PrivacyNotice accepted={visitorPrivacy} onChange={setVisitorPrivacy} />
            {formError && <div className="error" style={{ marginBottom: 12 }}>{formError}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? <div className="spinner" /> : "Sign in as visitor"}
            </button>
            <button
              className="btn btn-secondary btn-block"
              type="button"
              style={{ marginTop: 12 }}
              onClick={reset}
              disabled={busy}
            >
              Back
            </button>
          </form>
        )}

        <p style={{ textAlign: "center", marginTop: 24 }}>
          <button
            type="button"
            onClick={goFullscreen}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: "0.75rem",
              minHeight: 32,
              padding: 8,
              fontWeight: 500,
            }}
          >
            Full screen
          </button>
          <span style={{ color: "var(--border)", margin: "0 8px" }}>·</span>
          <button
            type="button"
            onClick={leaveKiosk}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: "0.75rem",
              minHeight: 32,
              padding: 8,
              fontWeight: 500,
            }}
          >
            Leave kiosk
          </button>
        </p>
      </div>
    </div>
  );
}
