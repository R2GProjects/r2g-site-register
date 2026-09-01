"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import SignaturePad from "@/components/SignaturePad";

interface InductionData {
  siteCode: string;
  siteName: string;
  address: string | null;
  siteManager: string | null;
  siteManagerPhone: string | null;
  emergencyPlanURL: string | null;
  requiresInduction: boolean;
  inductionRules: string | null;
}

export default function InductionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteCode = (params.siteCode as string).toUpperCase();
  const accessToken = searchParams.get("token") || "";
  const returnPath = searchParams.get("return") || "";

  const [data, setData] = useState<InductionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/induct?code=${encodeURIComponent(siteCode)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load induction data"))
      .finally(() => setLoading(false));
  }, [siteCode]);

  const handleComplete = useCallback(async () => {
    if (!accepted) {
      setError("You must acknowledge that you have read and understood the induction rules.");
      return;
    }
    if (!signature) {
      setError("Please sign in the box above to confirm you have completed the induction.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      // No token in the URL is normal for a passcode sign-in — the worker
      // session cookie identifies them instead.
      const res = await fetch("/api/induct/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(accessToken ? { accessToken } : {}),
          siteCode,
          accepted: true,
          signature,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Failed to complete induction");
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }, [accepted, accessToken, siteCode, signature]);

  if (loading) {
    return (
      <div>
        <Header title="Site Induction" />
        <div className="accent-bar" />
        <div className="loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <Header title="Site Induction" />
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

  if (done) {
    return (
      <div>
        <Header title="Induction Complete" />
        <div className="accent-bar" />
        <div className="container" style={{ textAlign: "center", paddingTop: 40 }}>
          <div className="card">
            <p style={{ fontSize: "2rem", marginBottom: 8 }}>✅</p>
            <h2 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Site Induction Complete</h2>
            <p style={{ color: "var(--muted)" }}>
              You have completed the induction for <strong>{data?.siteName}</strong>.
            </p>
            <p style={{ color: "var(--muted)", marginTop: 4 }}>
              You can now sign in to this site.
            </p>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={() =>
                router.push(
                  returnPath || (accessToken ? `/w/${encodeURIComponent(accessToken)}` : "/w")
                )
              }
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Site Induction" />
      <div className="accent-bar" />
      <div className="container">
        {data && (
          <>
            <div className="card">
              <h2 style={{ fontSize: "1.25rem", marginBottom: 4 }}>{data.siteName}</h2>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Site Code: {data.siteCode}</p>
              {data.address && (
                <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{data.address}</p>
              )}
              {data.siteManager && (
                <p style={{ fontSize: "0.875rem", marginTop: 4 }}>
                  Site Manager: {data.siteManager}
                  {data.siteManagerPhone ? ` (${data.siteManagerPhone})` : ""}
                </p>
              )}
            </div>

            {data.inductionRules ? (
              <div className="card">
                <h3 style={{ marginBottom: 8 }}>Site Rules & Induction</h3>
                <div style={{ fontSize: "0.9375rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {data.inductionRules}
                </div>
              </div>
            ) : (
              <div className="card">
                <p style={{ color: "var(--muted)" }}>
                  No specific induction rules have been configured for this site. Please follow standard site safety procedures.
                </p>
              </div>
            )}

            {data.emergencyPlanURL && (
              <div className="card">
                <h3 style={{ marginBottom: 8 }}>Emergency Plan</h3>
                <img
                  src={data.emergencyPlanURL}
                  alt="Emergency Plan Diagram"
                  style={{ width: "100%", maxWidth: "100%", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
                  Familiarise yourself with emergency exits, assembly points, and first aid locations.
                </p>
              </div>
            )}

            <div className="card">
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  I have read and understood the site induction rules and emergency plan.
                </label>
              </div>

              <div className="form-group">
                <label>Your signature</label>
                <SignaturePad onChange={setSignature} />
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 8 }}>
                  Your signature is stored with the exact site rules shown above
                  and the time you accepted them.
                </p>
              </div>

              {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

              <button
                className="btn btn-primary btn-block"
                onClick={handleComplete}
                disabled={submitting}
              >
                {submitting ? <div className="spinner" /> : "Complete Induction"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}