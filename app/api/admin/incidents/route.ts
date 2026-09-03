import { NextResponse } from "next/server";
import { validateAdminAuth } from "@/lib/auth";
import { allowedValue, numericId } from "@/lib/nocodb";
import { INCIDENT_STATUSES } from "@/lib/incident";
import { listIncidents, updateIncident } from "@/lib/incident-run";

export async function GET(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const report = await listIncidents({
      siteId: numericId(searchParams.get("siteId")),
      status: allowedValue(searchParams.get("status"), INCIDENT_STATUSES) || "",
      from: String(searchParams.get("from") ?? "").trim(),
      to: String(searchParams.get("to") ?? "").trim(),
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const id = numericId(body.Id ?? body.id);
    if (!id) return NextResponse.json({ error: "Id required" }, { status: 400 });
    const saved = await updateIncident({
      id,
      status: body.Status ?? body.status,
      adminNotes: body.AdminNotes ?? body.adminNotes,
    });
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
