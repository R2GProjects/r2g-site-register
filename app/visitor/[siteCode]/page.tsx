"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Header from "@/components/Header";

export default function VisitorPage() {
  const params = useParams();
  const router = useRouter();
  const siteCode = (params.siteCode as string).toUpperCase();

  const [form, setForm] = useState({
    firstName: "", lastName: "", mobile: "", email: "",
    companyName: "", reasonForVisit: "", personVisiting: "",
    emergencyContactName: "", emergencyContactPhone: "",
    acknowledgedSiteRules: true,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    siteName?: string;
    signedInAt?: string;
    passToken?: string;
  } | null>(null);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCheckChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.checked });
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
      const res = await fetch("/api/register/visitor", {
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

  if (result?.signedInAt) {
    const passPath = result.passToken ? `/v/${encodeURIComponent(result.passToken)}` : "";
    const passUrl =
      passPath && typeof window !== "undefined"
        ? `${window.location.origin}${passPath}`
        : "";

    return (
      <div>
        <Header title="Signed In" />
        <div className="accent-bar" />
        <div className="container">
          <div className="card" style={{ textAlign: "center" }}>
            <span className="badge badge-onsite" style={{ fontSize: "1rem", padding: "8px 16px" }}>On Site</span>
            <p style={{ marginTop: 16, fontSize: "1.125rem" }}>{result.siteName}</p>
            <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
              Signed in at {new Date(result.signedInAt).toLocaleTimeString()}
            </p>
          </div>

          {passUrl && (
            <div className="card" style={{ textAlign: "center", marginTop: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Save your pass before you go</p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: 12 }}>
                You need this to sign out when you leave. Photograph the code or
                bookmark the page — if you close this tab without it, you will
                stay on the site register.
              </p>
              <QRCodeSVG value={passUrl} size={150} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 16 }}
                onClick={() => router.push(passPath)}
              >
                Open My Pass
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Visitor Sign In" />
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
            <label>Company</label>
            <input name="companyName" value={form.companyName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Reason for Visit</label>
            <input name="reasonForVisit" value={form.reasonForVisit} onChange={handleChange} placeholder="e.g. Delivery, Meeting" />
          </div>
          <div className="form-group">
            <label>Person You&apos;re Visiting</label>
            <input name="personVisiting" value={form.personVisiting} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Emergency Contact Name</label>
            <input name="emergencyContactName" value={form.emergencyContactName} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Emergency Contact Phone</label>
            <input name="emergencyContactPhone" type="tel" value={form.emergencyContactPhone} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="acknowledgedSiteRules" checked={form.acknowledgedSiteRules} onChange={handleCheckChange} />
              I acknowledge site safety rules
            </label>
          </div>

          {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? <div className="spinner" /> : "Sign In as Visitor"}
          </button>
        </form>

        <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => router.push(`/s/${siteCode}`)}>
          Back
        </button>
      </div>
    </div>
  );
}