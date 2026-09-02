"use client";
import { useEffect, useState } from "react";
import {
  flushOfflineQueue,
  readQueue,
  subscribeQueue,
} from "@/lib/client-offline";

function registerWorker() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

export default function OfflineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(0);
  const [flushError, setFlushError] = useState("");

  useEffect(() => {
    registerWorker();
    const syncCount = () => setPending(readQueue().length);
    syncCount();
    const stop = subscribeQueue(syncCount);
    const flush = () => {
      flushOfflineQueue().then((result) => {
        if (result.lastError) setFlushError(result.lastError);
        else if (result.sent > 0) setFlushError("");
        syncCount();
      });
    };
    flush();
    window.addEventListener("online", flush);
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <>
      {children}
      {pending > 0 && (
        <div className="offline-banner">
          {pending === 1
            ? "1 tap waiting to send when this device has coverage."
            : `${pending} taps waiting to send when this device has coverage.`}
          {flushError ? ` Last attempt: ${flushError}` : ""}
        </div>
      )}
    </>
  );
}
