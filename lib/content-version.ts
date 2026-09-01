import { createHash } from "node:crypto";

/**
 * A short version identifier derived from the text itself.
 *
 * Used wherever a person accepts a document — site rules, the privacy notice —
 * so that editing the wording changes the version on its own. Nobody has to
 * remember to bump a number, and a record signed against the old text stays
 * distinguishable from one signed against the new.
 *
 * Line endings are normalised and the ends trimmed, so reformatting that leaves
 * the wording untouched does not invalidate everyone's acceptance.
 */
export function contentVersion(prefix: string, text: unknown): string {
  const normalised = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!normalised) return `${prefix}-none`;
  const digest = createHash("sha256").update(normalised, "utf8").digest("hex");
  return `${prefix}-${digest.slice(0, 12)}`;
}
