import { describe, expect, it } from "vitest";
import {
  isAccessQueueReason,
  pendingApprovalNote,
  signInAccess,
  siteAccessBlockedMessage,
  siteAccessBlockedPayload,
  siteAccessStatus,
} from "@/lib/site-access";

describe("siteAccessStatus", () => {
  it("accepts the five stored values", () => {
    expect(siteAccessStatus("Pending")).toBe("Pending");
    expect(siteAccessStatus("Approved")).toBe("Approved");
    expect(siteAccessStatus("Denied")).toBe("Denied");
    expect(siteAccessStatus("Revoked")).toBe("Revoked");
    expect(siteAccessStatus("Expired")).toBe("Expired");
  });

  it.each([null, undefined, "", "  ", "approved", "true", 1])(
    "rejects %p rather than treating it as approved",
    (value) => {
      expect(siteAccessStatus(value)).toBeNull();
    }
  );
});

describe("signInAccess", () => {
  it("lets only Approved through", () => {
    expect(signInAccess("Approved")).toEqual({ ok: true });
  });

  it("refuses Pending so the admin queue has an effect", () => {
    expect(signInAccess("Pending")).toEqual({ ok: false, reason: "pending" });
  });

  it.each([
    ["Denied", "denied"],
    ["Revoked", "revoked"],
    ["Expired", "expired"],
  ] as const)("names a %s refusal", (status, reason) => {
    expect(signInAccess(status)).toEqual({ ok: false, reason });
  });

  it("treats a missing row as a queue item, not a pass", () => {
    expect(signInAccess(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(signInAccess(null)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("siteAccessBlockedMessage", () => {
  it("tells pending and missing to wait for a supervisor", () => {
    const pending = siteAccessBlockedMessage("pending");
    const missing = siteAccessBlockedMessage("missing");
    expect(pending).toMatch(/waiting for admin approval/i);
    expect(missing).toBe(pending);
    expect(pending).not.toMatch(/denied|revoked|expired/i);
  });

  it("names denied, revoked and expired", () => {
    expect(siteAccessBlockedMessage("denied")).toMatch(/denied/i);
    expect(siteAccessBlockedMessage("revoked")).toMatch(/revoked/i);
    expect(siteAccessBlockedMessage("expired")).toMatch(/expired/i);
  });
});

describe("siteAccessBlockedPayload", () => {
  it("flags the approval queue without looking like a hard refusal", () => {
    expect(siteAccessBlockedPayload("pending").accessPending).toBe(true);
    expect(siteAccessBlockedPayload("missing").accessPending).toBe(true);
    expect(isAccessQueueReason("pending")).toBe(true);
    expect(isAccessQueueReason("missing")).toBe(true);
  });

  it("does not treat a named refusal as still waiting", () => {
    expect(siteAccessBlockedPayload("denied").accessPending).toBe(false);
    expect(siteAccessBlockedPayload("revoked").accessPending).toBe(false);
    expect(siteAccessBlockedPayload("expired").accessPending).toBe(false);
    expect(isAccessQueueReason("denied")).toBe(false);
  });

  it("carries the same sentence the worker will see", () => {
    const payload = siteAccessBlockedPayload("pending");
    expect(payload.error).toBe(siteAccessBlockedMessage("pending"));
    expect(payload.accessStatus).toBe("pending");
  });
});

describe("pendingApprovalNote", () => {
  it("does not claim the worker is signed in", () => {
    const note = pendingApprovalNote();
    expect(note).toMatch(/waiting for admin approval/i);
    expect(note).not.toMatch(/signed in/i);
  });
});
