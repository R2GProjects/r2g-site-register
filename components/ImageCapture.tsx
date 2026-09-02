"use client";
import { useRef, useState } from "react";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}

const MAX_EDGE = 960;
const JPEG_QUALITY = 0.72;

/**
 * Take or pick a photo of a ticket, compressed on the device.
 *
 * Phone cameras produce multi-megabyte JPEGs that would blow the registration
 * request and the LongText column. The image is resized here so what we store
 * is evidence of the card, not an archive of the camera sensor.
 */
export default function ImageCapture({ value, onChange, label }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const compress = async (file: File): Promise<string> => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that photo");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setLocalError("");
    try {
      onChange(await compress(file));
    } catch {
      setLocalError("Could not read that photo. Try another.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      {label && <label>{label}</label>}
      {value ? (
        <img
          src={value}
          alt="Card photograph"
          style={{
            width: "100%",
            maxHeight: 180,
            objectFit: "contain",
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            marginBottom: 8,
          }}
        />
      ) : (
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: 8 }}>
          Photograph the card so a number on file is evidence, not just something typed.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 36, fontSize: "0.875rem" }}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Reading…" : value ? "Replace photo" : "Take photo"}
        </button>
        {value && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 36, fontSize: "0.875rem" }}
            onClick={() => onChange(null)}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </div>
      {localError && (
        <p className="error" style={{ marginTop: 8 }}>{localError}</p>
      )}
    </div>
  );
}
