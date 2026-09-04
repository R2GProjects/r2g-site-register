process.env.SESSION_SECRET = "test-secret-for-unit-tests-only";

import { describe, expect, it } from "vitest";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("GET /api/privacy", () => {
  it("serves the notice the registration pages record a version of", async () => {
    const { GET } = await import("@/app/api/privacy/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.version).toEqual(expect.any(String));
    expect(String(body.version).length).toBeGreaterThan(8);
    expect(Array.isArray(body.sections)).toBe(true);
    expect((body.sections as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("POST /api/admin/logout", () => {
  it("expires the admin cookie", async () => {
    const { POST } = await import("@/app/api/admin/logout/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
    const cookie = res.headers.get("set-cookie") || "";
    expect(cookie).toMatch(/sr_session=/);
    expect(cookie).toMatch(/Max-Age=0/i);
  });
});

describe("admin routes without a session", () => {
  it.each([
    ["/api/admin/attendance", () => import("@/app/api/admin/attendance/route")],
    ["/api/admin/people", () => import("@/app/api/admin/people/route")],
    ["/api/admin/timesheets", () => import("@/app/api/admin/timesheets/route")],
    ["/api/admin/emergency", () => import("@/app/api/admin/emergency/route")],
  ] as const)("%s returns 401", async (path, load) => {
    const { GET } = await load();
    const res = await GET(new Request(`http://localhost${path}`));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("Unauthorized");
  });
});

describe("POST /api/cron/auto-close", () => {
  it("refuses a caller who has neither the secret nor an admin session", async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-test-secret";
    try {
      const { POST } = await import("@/app/api/cron/auto-close/route");
      const res = await POST(new Request("http://localhost/api/cron/auto-close", { method: "POST" }));
      expect(res.status).toBe(401);
      expect((await json(res)).error).toBe("Unauthorized");
    } finally {
      process.env.CRON_SECRET = previous;
    }
  });
});

describe("GET /api/documents", () => {
  it("does not hit the register when nobody is signed in", async () => {
    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new Request("http://localhost/api/documents"));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/mobile|token|passcode/i);
  });
});
