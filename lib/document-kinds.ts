/**
 * Labels and kinds for site documents. Kept off the hashing module so a
 * client page can render SWMS / Procedure without pulling node:crypto.
 */

export const DOCUMENT_KINDS = ["swms", "procedure", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  swms: "SWMS",
  procedure: "Procedure",
  other: "Document",
};

export function documentKind(value: unknown): DocumentKind | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "swms") return "swms";
  if (raw === "procedure" || raw === "procedures") return "procedure";
  if (raw === "other" || raw === "document" || raw === "") return "other";
  return null;
}
