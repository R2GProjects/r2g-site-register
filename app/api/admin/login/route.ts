import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

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

    if (user !== envUser.trim() || pass !== envPass.trim()) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSession();
    const resp = NextResponse.json({ ok: true });
    resp.cookies.set("sr_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 28800,
    });
    return resp;
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}