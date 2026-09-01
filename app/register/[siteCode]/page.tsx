"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";

export default function RegisterWorkerPage() {
  const params = useParams();
  const router = useRouter();
  const siteCode = (params.siteCode as string).toUpperCase();

  const [form, setForm] = useState({
    firstName: "", lastName: "", mobile: "", email: "",
    companyName: "", workerType: "Contractor", jobRole: "",
    whiteCardNumber: "", whiteCardExpiry: "",
    licenceNumber: "", licenceType: "",
    emergencyContactName: "", emergencyContactPhone: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ accessToken?: string; note?: string } | null>(null);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      setError("First and last name are required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/register/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteCode, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div>
        <Header title="Registration Complete" />
        <div className="accent-bar" />
        <div className="container">
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 16 }}>You&apos;re registered at</p>
            <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)", marginBottom: 16 }}>
              {result.note?.match(/at (.+)/)?.[0] || siteCode}
            </p>
            <div className="card" style={{ background: "var(--accent-light)" }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Your Access Token</p>
              <p style={{ fontFamily: "monospace", wordBreak: "break-all", background: "var(--bg)", padding: 12, borderRadius: "var(--radius)", fontSize: "0.75rem" }}>
                {result.accessToken}
              </p>
            </div>
            <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--muted)" }}>
              Save this token — it&apos;s your key for signing in. You can also scan your personal QR from your worker dashboard.
            </p>
            {result.note && (
              <p style={{ marginTop: 8, fontSize: "0.875rem", color: "var(--muted)" }}>{result.note}</p>
            )}
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => router.push(`/w/${result.accessToken}`)}>
              Go to My Dashboard
            </button>
            <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={() => router.push(`/s/${siteCode}`)}>
              Back to Site
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Register Worker" />
      <div className="accent-bar" />
      <div className="container">
        <div className="card" style={{ marginBottom: 16 }}>
          <p>Site: <strong>{siteCode}</strong></p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>First Name *</label>
            <input name="firstName" value={form.firstName} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Last Name *</label>
            <input name="lastName" value={form.lastName} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Mobile</label>
            <input name="mobile" type="tel" value={form.mobile} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Company / Employer</label>
            <input name="companyName" value={form.companyName} onChange={handleChange} placeholder="Optional — will create if new" />
          </div>
          <div className="form-group">
            <label>Worker Type</label>
            <select name="workerType" value={form.workerType} onChange={handleChange}>
              <option>Employee</option><option>Contractor</option><option>Subcontractor</option>
              <option>Consultant</option><option>Delivery</option><option>Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Job Role</label>
            <input name="jobRole" value={form.jobRole} onChange={handleChange} placeholder="e.g. Carpenter, Plumber" />
          </div>
          <div className="form-group">
            <label>White Card Number</label>
            <input name="whiteCardNumber" value={form.whiteCardNumber} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>White Card Expiry</label>
            <input name="whiteCardExpiry" type="date" value={form.whiteCardExpiry} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Licence Number</label>
            <input name="licenceNumber" value={form.licenceNumber} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Licence Type</label>
            <input name="licenceType" value={form.licenceType} onChange={handleChange} placeholder="e.g. Electrical, Plumbing" />
          </div>
          <div className="form-group">
            <label>Emergency Contact Name</label>
            <input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Emergency Contact Phone</label>
            <input name="emergencyContactPhone" type="tel" value={form.emergencyContactPhone} onChange={handleChange} />
          </div>

          {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? <div className="spinner" /> : "Register"}
          </button>
        </form>

        <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => router.push(`/s/${siteCode}`)}>
          Back
        </button>
      </div>
    </div>
  );
}