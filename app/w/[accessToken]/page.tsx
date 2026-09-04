"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import {
  rememberWorkerToken,
  tokenFromParam,
  WORKER_DASHBOARD_PATH,
} from "@/lib/worker-entry";

/**
 * QR and saved-link entry. Swap the token for the worker session cookie and
 * leave this URL so the secret does not sit in history, referrers, or later
 * proxy logs from this tab.
 */
export default function WorkerTokenPage() {
  const params = useParams();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = tokenFromParam(params.accessToken);
    if (!token) {
      router.replace(WORKER_DASHBOARD_PATH);
      return;
    }

    let cancelled = false;
    fetch("/api/auth/worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error || "Invalid access token");
          return;
        }
        rememberWorkerToken(token, sessionStorage);
        router.replace(WORKER_DASHBOARD_PATH);
      })
      .catch(() => {
        if (!cancelled) setError("Network error");
      });

    return () => {
      cancelled = true;
    };
  }, [params.accessToken, router]);

  if (error) {
    return (
      <div>
        <Header title="Worker" />
        <div className="accent-bar" />
        <div className="container" style={{ textAlign: "center", paddingTop: 80 }}>
          <h2 style={{ color: "var(--danger)" }}>{error}</h2>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 16 }}
            onClick={() => router.push("/")}
          >
            ← Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Worker" />
      <div className="accent-bar" />
      <div className="loading">
        <div className="spinner" />
      </div>
    </div>
  );
}
