"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";

interface VisitStatus {
  name: string;
  siteName: string | null;
  siteCode: string | null;
  signInTime: string | null;
  signOutTime: string | null;
  status: string | null;
  onSite: boolean;
}

export default function VisitorPassPage() {
  const params = useParams();
  const token = params.token as string;

  const [visit, setVisit] = useState<VisitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [passUrl, setPassUrl] = useState("");

  useEffect(() => {
    setPassUrl(window.location.href);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/attend/visitor/status?token=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      if (!res.ok) setError(data.error || "Could not load your pass");
      else setVisit(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => {
    if (!confirm("Sign out of this site?")) return;
    setSigningOut(true);
    setError("");
    try {
      const res = await fetch("/api/attend/visitor/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok && !data.alreadySignedOut) {
        setError(data.error || "Sign out failed");
      }
      await load();
    } catch {
      setError("Network error");
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Visitor Pass" />
        <div className="accent-bar" />
        <div className="container">
          <div className="loading"><div className="spinner" /></div>
        </div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div>
        <Header title="Visitor Pass" />
        <div className="accent-bar" />
        <div className="container">
          <div className="card">
            <p>{error || "This pass is not valid."}</p>
            <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: 8 }}>
              Scan the site QR code again to sign in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Visitor Pass" />
      <div className="accent-bar" />
      <div className="container">
        <div className="card" style={{ textAlign: "center" }}>
          <span
            className={visit.onSite ? "badge badge-onsite" : "badge badge-signedout"}
            style={{ fontSize: "1rem", padding: "8px 16px" }}
          >
            {visit.onSite ? "On Site" : "Signed Out"}
          </span>

          <p style={{ marginTop: 16, fontSize: "1.125rem", fontWeight: 600 }}>{visit.name}</p>
          {visit.siteName && <p>{visit.siteName}</p>}

          {visit.signInTime && (
            <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: 8 }}>
              Signed in {new Date(visit.signInTime).toLocaleString()}
            </p>
          )}
          {visit.signOutTime && (
            <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              Signed out {new Date(visit.signOutTime).toLocaleString()}
            </p>
          )}

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

          {visit.onSite ? (
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? <div className="spinner" /> : "Sign Out"}
            </button>
          ) : (
            <p style={{ marginTop: 16, fontSize: "0.875rem", color: "var(--muted)" }}>
              Thanks for signing out. You can close this page.
            </p>
          )}
        </div>

        {visit.onSite && passUrl && (
          <div className="card" style={{ textAlign: "center", marginTop: 16 }}>
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: "0.875rem" }}>
              Keep this to sign out later
            </p>
            <QRCodeSVG value={passUrl} size={140} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
              Bookmark this page or photograph the code. Without it you will stay
              on the site register after you leave.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
