import { describe, expect, it } from "vitest";
import {
  CLOCK_SKEW_MS,
  DEFAULT_QUEUE_MAX_AGE_MS,
  decideFlushResult,
  enqueue,
  flushBody,
  isQueuedRequest,
  makeQueueItem,
  parseStoredQueue,
  queueDedupeKey,
  removeItem,
  resolveQueuedEventTime,
  resolveSignOutTime,
  serializeStoredQueue,
  shouldQueueFailure,
} from "@/lib/offline-queue";

const NOW = Date.parse("2026-09-02T04:00:00.000Z");

function item(
  partial: Partial<Parameters<typeof makeQueueItem>[0]> & { action?: "signin" | "signout" } = {}
) {
  return makeQueueItem({
    id: partial.id ?? "q1",
    action: partial.action ?? "signin",
    queuedAt: partial.queuedAt ?? "2026-09-02T03:00:00.000Z",
    body: partial.body ?? { mobile: "0412", siteCode: "WGSB5" },
  });
}

describe("isQueuedRequest", () => {
  it("is only the boolean true, so a string in a JSON body cannot opt in", () => {
    expect(isQueuedRequest(true)).toBe(true);
    expect(isQueuedRequest("true")).toBe(false);
    expect(isQueuedRequest(1)).toBe(false);
  });
});

describe("resolveQueuedEventTime", () => {
  it("uses the server clock when nothing was queued", () => {
    const result = resolveQueuedEventTime(undefined, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.at).toBe(NOW);
      expect(result.iso).toBe("2026-09-02T04:00:00.000Z");
    }
  });

  it("keeps the tap time so a 7am sign-in that flushes at lunch is still 7am", () => {
    const tap = "2026-09-02T03:00:00.000Z";
    const result = resolveQueuedEventTime(tap, NOW);
    expect(result).toEqual({
      ok: true,
      iso: tap,
      at: Date.parse(tap),
    });
  });

  it("allows a couple of minutes of clock skew into the future", () => {
    const result = resolveQueuedEventTime(
      new Date(NOW + CLOCK_SKEW_MS).toISOString(),
      NOW
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a time further in the future than skew", () => {
    const result = resolveQueuedEventTime(
      new Date(NOW + CLOCK_SKEW_MS + 1).toISOString(),
      NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/future/i);
  });

  it("rejects a tap older than the max age", () => {
    const result = resolveQueuedEventTime(
      new Date(NOW - DEFAULT_QUEUE_MAX_AGE_MS - 1).toISOString(),
      NOW
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too old/i);
  });

  it("accepts a tap exactly at the max age", () => {
    const result = resolveQueuedEventTime(
      new Date(NOW - DEFAULT_QUEUE_MAX_AGE_MS).toISOString(),
      NOW
    );
    expect(result.ok).toBe(true);
  });

  it.each(["nope", "yesterday"])("rejects %p", (value) => {
    expect(resolveQueuedEventTime(value, NOW).ok).toBe(false);
  });
});

describe("resolveSignOutTime", () => {
  it("does not stamp a sign-out before the sign-in it closes", () => {
    const signIn = Date.parse("2026-09-02T03:00:00.000Z");
    expect(resolveSignOutTime("2026-09-02T03:00:00.000Z", signIn - 60_000)).toBe(
      signIn
    );
  });

  it("keeps a later tap", () => {
    const later = Date.parse("2026-09-02T08:00:00.000Z");
    expect(resolveSignOutTime("2026-09-02T03:00:00.000Z", later)).toBe(later);
  });
});

describe("enqueue", () => {
  it("keeps the first tap when the same person double-presses sign-in", () => {
    const first = item({ id: "a", queuedAt: "2026-09-02T03:00:00.000Z" });
    const second = item({ id: "b", queuedAt: "2026-09-02T03:01:00.000Z" });
    expect(enqueue([first], second)).toEqual([first]);
  });

  it("queues a sign-out behind a pending sign-in", () => {
    const inn = item({ id: "a", action: "signin" });
    const out = item({
      id: "b",
      action: "signout",
      body: { mobile: "0412" },
    });
    expect(enqueue([inn], out)).toEqual([inn, out]);
  });

  it("dedupes a second sign-out for the same person", () => {
    const first = item({ id: "a", action: "signout", body: { mobile: "0412" } });
    const second = item({ id: "b", action: "signout", body: { mobile: "0412" } });
    expect(enqueue([first], second)).toEqual([first]);
  });
});

describe("removeItem", () => {
  it("drops the flushed item and leaves the rest in order", () => {
    const a = item({ id: "a" });
    const b = item({
      id: "b",
      action: "signout",
      body: { mobile: "0412" },
    });
    expect(removeItem([a, b], "a")).toEqual([b]);
  });
});

describe("decideFlushResult / shouldQueueFailure", () => {
  it("retries a dead radio", () => {
    expect(decideFlushResult(true, null)).toBe("retry");
    expect(shouldQueueFailure(true, null)).toBe(true);
  });

  it("retries 502/503 so a blip does not eat the tap", () => {
    expect(decideFlushResult(false, 502)).toBe("retry");
    expect(decideFlushResult(false, 503)).toBe("retry");
    expect(shouldQueueFailure(false, 503)).toBe(true);
  });

  it("does not queue a 403 — induction and expired cards will not heal themselves", () => {
    expect(shouldQueueFailure(false, 403)).toBe(false);
    expect(decideFlushResult(false, 403)).toBe("drop");
  });

  it("drops a 200 so a sent item is not sent again", () => {
    expect(decideFlushResult(false, 200)).toBe("drop");
  });
});

describe("parseStoredQueue / serializeStoredQueue", () => {
  it("round-trips items", () => {
    const items = [item()];
    expect(parseStoredQueue(serializeStoredQueue(items))).toEqual(items);
  });

  it.each([null, "", "{}", '{"v":2,"items":[]}', "not json"])(
    "treats %p as empty rather than throwing",
    (raw) => {
      expect(parseStoredQueue(raw)).toEqual([]);
    }
  );
});

describe("flushBody", () => {
  it("marks the replay so the server keeps the tap time", () => {
    const queued = item({ queuedAt: "2026-09-02T03:00:00.000Z" });
    expect(flushBody(queued)).toMatchObject({
      mobile: "0412",
      siteCode: "WGSB5",
      queued: true,
      queuedAt: "2026-09-02T03:00:00.000Z",
    });
  });
});

describe("queueDedupeKey", () => {
  it("is case-insensitive on the site so WGSB5 and wgsb5 are the same tap", () => {
    expect(queueDedupeKey("signin", { mobile: "0412", siteCode: "wgsb5" })).toBe(
      queueDedupeKey("signin", { mobile: "0412", siteCode: "WGSB5" })
    );
  });
});
