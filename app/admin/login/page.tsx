"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (window.location.hostname === "localhost") {
      setIsLocal(true);
      setUsername("admin");
      setPassword("r2g-local");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        router.push("/admin");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="R2G Admin" />
      <div className="accent-bar" />
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="card">
          <h2 style={{ fontSize: "1.25rem", marginBottom: 16 }}>Admin Login</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? <div className="spinner" /> : "Login"}
            </button>
          </form>
          {isLocal && (
            <p style={{ marginTop: 16, color: "var(--muted)", fontSize: "0.875rem" }}>
              Local account — username <strong>admin</strong>, password <strong>r2g-local</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}