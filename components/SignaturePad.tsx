"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  /** Called with a PNG data URL, or null once the pad is cleared. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * A signature pad sized for a thumb on a phone at a site gate.
 *
 * The canvas is backed at the device pixel ratio so the stroke is not a blurry
 * smear on a phone screen, and pointer events cover finger, stylus and mouse
 * without three separate code paths. Touch scrolling is suppressed over the pad
 * only, so drawing does not drag the page around underneath it.
 */
export default function SignaturePad({ onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  const context = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0a0a0a";
    return ctx;
  };

  // Sized from the laid-out width, so it fits whatever card it is dropped into.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
    // Resizing clears the bitmap, so anything already drawn is gone with it.
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  }, [height, onChange]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = context();
    if (!ctx) return;
    const { x, y } = pointAt(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    const { x, y } = pointAt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "#fff",
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          style={{
            display: "block",
            width: "100%",
            height,
            touchAction: "none",
            cursor: "crosshair",
          }}
        />
        {empty && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: "0.875rem",
              pointerEvents: "none",
            }}
          >
            Sign here with your finger
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 8, minHeight: 36, fontSize: "0.875rem" }}
        onClick={clear}
        disabled={empty}
      >
        Clear
      </button>
    </div>
  );
}
