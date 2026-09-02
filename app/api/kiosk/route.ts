import { NextResponse } from "next/server";
import { findSiteByCode } from "@/lib/nocodb";
import { WORKER_COOKIE } from "@/lib/auth";
import { createGateToken, GATE_COOKIE, GATE_MAX_AGE } from "@/lib/presence";
import {
  isKioskSiteCode,
  kioskCookieOptions,
  KIOSK_COOKIE,
} from "@/lib/kiosk";

function clearWorkerCookie(resp: NextResponse) {
  resp.cookies.set(WORKER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function clearKioskCookie(resp: NextResponse) {
  resp.cookies.set(KIOSK_COOKIE, "", {
    ...kioskCookieOptions(),
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  try {
    const { action, siteCode } = await request.json();

    if (action === "exit") {
      const resp = NextResponse.json({ ok: true });
      clearKioskCookie(resp);
      clearWorkerCookie(resp);
      return resp;
    }

    if (action !== "enter") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const code = String(siteCode ?? "").trim().toUpperCase();
    if (!isKioskSiteCode(code)) {
      return NextResponse.json({ error: "Missing siteCode" }, { status: 400 });
    }

    const site = await findSiteByCode(
      code,
      "Id,SiteUUID,SiteCode,SiteName,Address,Suburb,State,Postcode,SiteManager,SiteManagerPhone,Client,Status,Latitude,Longitude,EmergencyPlanURL,RequiresInduction,InductionRules,SiteQRCodeURL"
    );
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
    if (site.Status !== "Active" && site.Status !== "Setup") {
      return NextResponse.json({ error: "Site is not active" }, { status: 400 });
    }

    const resp = NextResponse.json(site);
    // Opening kiosk is being at the gate, the same as scanning the site QR.
    resp.cookies.set(GATE_COOKIE, createGateToken(String(site.SiteCode)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GATE_MAX_AGE,
    });
    resp.cookies.set(KIOSK_COOKIE, String(site.SiteCode).toUpperCase(), kioskCookieOptions());
    // A leftover personal login on this tablet must not become the next person.
    clearWorkerCookie(resp);
    return resp;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
