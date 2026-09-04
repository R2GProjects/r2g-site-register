import { describe, expect, it } from "vitest";
import {
  WORKER_DASHBOARD_PATH,
  WORKER_TOKEN_STORAGE_KEY,
  inductionReturnQuery,
  recalledWorkerToken,
  rememberWorkerToken,
  safeWorkerReturnPath,
  stashWorkerTokenAndDashboard,
  tokenFromParam,
  workerPersonalQrUrl,
  workerSessionPath,
  workerTokenEntryPath,
} from "@/lib/worker-entry";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    setItem(key: string, value: string) {
      data[key] = value;
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
  };
}

describe("tokenFromParam", () => {
  it("trims and decodes a path segment", () => {
    expect(tokenFromParam("  abc%2Fdef  ")).toBe("abc/def");
  });

  it.each([null, undefined, "", "   "])("is empty for %p", (value) => {
    expect(tokenFromParam(value)).toBe("");
  });

  it("keeps a malformed percent sequence rather than throwing", () => {
    expect(tokenFromParam("%")).toBe("%");
  });
});

describe("workerTokenEntryPath", () => {
  it("is the QR entry, with the token encoded", () => {
    expect(workerTokenEntryPath("ab/cd")).toBe("/w/ab%2Fcd");
  });

  it("falls back to the dashboard when there is no token", () => {
    expect(workerTokenEntryPath("")).toBe(WORKER_DASHBOARD_PATH);
    expect(workerTokenEntryPath("  ")).toBe(WORKER_DASHBOARD_PATH);
  });
});

describe("workerSessionPath", () => {
  it("never interpolates a token into the signed-in URL", () => {
    expect(workerSessionPath()).toBe("/w");
    expect(workerSessionPath()).not.toContain("token");
    expect(stashWorkerTokenAndDashboard("secret-token", memoryStorage())).toBe(
      "/w"
    );
  });
});

describe("workerPersonalQrUrl", () => {
  it("points at the token entry so a saved QR can sign in later", () => {
    expect(workerPersonalQrUrl("https://register.example", "abc")).toBe(
      "https://register.example/w/abc"
    );
  });

  it("strips a trailing slash on the origin", () => {
    expect(workerPersonalQrUrl("https://register.example/", "abc")).toBe(
      "https://register.example/w/abc"
    );
  });

  it("is blank when there is nothing to encode", () => {
    expect(workerPersonalQrUrl("https://register.example", "")).toBe("");
  });
});

describe("safeWorkerReturnPath", () => {
  it("keeps /w", () => {
    expect(safeWorkerReturnPath("/w")).toBe("/w");
  });

  it.each(["/w/secret-token", "/admin", "https://evil.example/", "", "  "])(
    "refuses %p rather than putting a secret back in the path",
    (value) => {
      expect(safeWorkerReturnPath(value)).toBe("/w");
    }
  );
});

describe("inductionReturnQuery", () => {
  it("sends the worker back to /w, not /w/<token>", () => {
    const query = new URLSearchParams(inductionReturnQuery());
    expect(query.get("return")).toBe("/w");
    expect(query.get("token")).toBeNull();
  });
});

describe("rememberWorkerToken", () => {
  it("stores a trimmed token for the personal QR", () => {
    const storage = memoryStorage();
    rememberWorkerToken("  abc  ", storage);
    expect(storage.data[WORKER_TOKEN_STORAGE_KEY]).toBe("abc");
    expect(recalledWorkerToken(storage)).toBe("abc");
  });

  it("does not write an empty value", () => {
    const storage = memoryStorage();
    rememberWorkerToken("  ", storage);
    expect(storage.data[WORKER_TOKEN_STORAGE_KEY]).toBeUndefined();
    expect(recalledWorkerToken(storage)).toBe("");
  });
});
