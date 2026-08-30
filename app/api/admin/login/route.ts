import { NextResponse } from "next/server";
import { createSession, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { clearRateLimit, guard, MINUTE } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const envUser = process.env.ADMIN_USERNAME;
    const envPass = process.env.ADMIN_PASSWORD;
    const user = typeof username === "string" ? username.trim() : "";
    const pass = typeof password === "string" ? password.trim() : "";

    if (!envUser || !envPass) {
      return NextResponse.json({ error: "Admin credentials not configured" }, { status: 500 });
    }

    const limit = guard(request, "admin-login", {
      limit: 10,
      windowMs: 15 * MINUTE,
      identifier: user,
      message: "Too many failed logins. Wait 15 minutes and try again.",
    });
    if (limit.blocked) return limit.blocked;

    const userOk = safeEqual(user, envUser.trim());
    const passOk = safeEqual(pass, envPass.trim());
    if (!userOk || !passOk) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    clearRateLimit(limit.key);

    const token = createSession();
    const resp = NextResponse.json({ ok: true });
    resp.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return resp;
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
