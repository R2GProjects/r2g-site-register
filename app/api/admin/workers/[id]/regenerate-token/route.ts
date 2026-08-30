import { NextResponse } from "next/server";
import { TABLES, update } from "@/lib/nocodb";
import { validateAdminAuth, generateAccessToken, hashToken, nowISO } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const personId = parseInt(params.id);
    if (isNaN(personId)) {
      return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
    }

    const token = generateAccessToken();
    const tokenHash = hashToken(token);

    await update(TABLES.People, {
      Id: personId,
      AccessTokenHash: tokenHash,
      UpdatedAt1: nowISO(),
    });

    return NextResponse.json({ accessToken: token });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}