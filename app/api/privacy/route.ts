import { NextResponse } from "next/server";
import { privacySections, privacyVersion, retentionYears } from "@/lib/privacy";

/**
 * The collection notice, served rather than duplicated in the client bundle.
 *
 * The retention period and contact come from the environment, so the text a
 * person is shown is the same text the version is computed from. Duplicating
 * the wording in a component would let the two drift, and then a recorded
 * version would no longer describe what anyone actually read.
 */
export async function GET() {
  return NextResponse.json({
    version: privacyVersion(),
    retentionYears: retentionYears(),
    sections: privacySections(),
  });
}
