"use client";
import { useEffect, useState } from "react";

interface Section {
  heading: string;
  body: string;
}

interface Props {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}

/**
 * The collection notice and its acknowledgement.
 *
 * The summary is always visible and the detail expands, because a wall of text
 * above a sign-in button on a phone gets scrolled past rather than read. The
 * wording is fetched so that it matches the version the server records.
 */
export default function PrivacyNotice({ accepted, onChange }: Props) {
  const [sections, setSections] = useState<Section[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/privacy")
      .then((r) => r.json())
      .then((d) => setSections(d.sections || []))
      .catch(() => setSections([]));
  }, []);

  return (
    <div
      className="card"
      style={{ background: "var(--surface)", marginBottom: 16 }}
    >
      <p style={{ fontWeight: 600, marginBottom: 4 }}>How we use your details</p>
      <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
        We collect your contact details and a record of this visit so we know
        who is on site and can account for everyone in an emergency. Only site
        managers and administrators see them.
      </p>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          marginTop: 8,
          color: "var(--accent)",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {open ? "Hide the full notice" : "Read the full notice"}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {sections.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              Loading the notice…
            </p>
          ) : (
            sections.map((s) => (
              <div key={s.heading} style={{ marginBottom: 10 }}>
                <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>{s.heading}</p>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {s.body}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onChange(e.target.checked)}
          />
          I have read how my details are used and I agree to them being recorded.
        </label>
      </div>
    </div>
  );
}
