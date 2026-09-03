import { NextResponse } from "next/server";
import { resolvePersonFromRequest } from "@/lib/person-auth";
import { numericId } from "@/lib/nocodb";
import { workerDocument, workerDocuments } from "@/lib/documents-run";

async function personFrom(request: Request) {
  const { searchParams } = new URL(request.url);
  let accessToken = searchParams.get("accessToken") || undefined;
  if (request.method !== "GET") {
    try {
      const body = await request.clone().json();
      accessToken = body.accessToken || accessToken;
      return resolvePersonFromRequest(request, {
        accessToken,
        mobile: body.mobile,
        passcode: body.passcode,
      });
    } catch {
      // Fall through to cookie / query token.
    }
  }
  return resolvePersonFromRequest(request, { accessToken });
}

export async function GET(request: Request) {
  try {
    const lookup = await personFrom(request);
    if (!lookup.person) {
      return NextResponse.json(
        { error: lookup.error || "Sign in to view documents." },
        { status: lookup.status || 401 }
      );
    }
    const { searchParams } = new URL(request.url);
    const id = numericId(searchParams.get("id"));
    if (id) {
      const row = await workerDocument(lookup.person.Id, id);
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(row);
    }
    return NextResponse.json(await workerDocuments(lookup.person.Id));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const lookup = await personFrom(request);
    if (!lookup.person) {
      return NextResponse.json(
        { error: lookup.error || "Sign in to view documents." },
        { status: lookup.status || 401 }
      );
    }
    return NextResponse.json(await workerDocuments(lookup.person.Id));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
