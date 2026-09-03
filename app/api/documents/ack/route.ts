import { NextResponse } from "next/server";
import { resolvePersonFromRequest } from "@/lib/person-auth";
import { guard, MINUTE } from "@/lib/rate-limit";
import { acknowledgeDocument } from "@/lib/documents-run";
import { isKioskRequest } from "@/lib/kiosk";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (isKioskRequest(body.kiosk)) {
      return NextResponse.json(
        { error: "Read site documents on your own phone, not the gate tablet." },
        { status: 400 }
      );
    }
    const limit = guard(request, "document-ack", {
      limit: 20,
      windowMs: 10 * MINUTE,
      message: "Too many acknowledgements. Wait a few minutes and try again.",
    });
    if (limit.blocked) return limit.blocked;

    const lookup = await resolvePersonFromRequest(request, {
      accessToken: body.accessToken,
      mobile: body.mobile,
      passcode: body.passcode,
    });
    if (!lookup.person) {
      return NextResponse.json(
        { error: lookup.error || "Sign in to acknowledge." },
        { status: lookup.status || 401 }
      );
    }

    const saved = await acknowledgeDocument({
      documentId: body.documentId ?? body.Id,
      accepted: body.accepted,
      personId: lookup.person.Id,
    });
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ Id: saved.id, already: saved.already, ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
