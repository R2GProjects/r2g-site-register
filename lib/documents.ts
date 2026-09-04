/**
 * Versioned site documents (SWMS, procedures) and who accepted which wording.
 *
 * Editing the text changes the version on its own, the same way site rules
 * do. An acknowledgement stores a snapshot, so a later edit does not rewrite
 * what this worker was shown. Missing a current acknowledgement is flagged
 * on the dashboard; it does not block sign-in — refusing entry over a
 * document nobody has attached yet is the wrong way to fail.
 */

import { contentVersion } from "@/lib/content-version";
import { documentKind, type DocumentKind } from "@/lib/document-kinds";

export {
  DOCUMENT_KIND_LABEL,
  DOCUMENT_KINDS,
  documentKind,
  type DocumentKind,
} from "@/lib/document-kinds";

export const MAX_DOCUMENT_CHARS = 50_000;
export const MAX_DOCUMENT_URL = 500;

export type DocumentProblem =
  | "noTitle"
  | "noContent"
  | "tooLong"
  | "badUrl"
  | "noSite"
  | "noKind";

export interface DocumentDraft {
  title: string;
  kind: DocumentKind;
  body: string;
  url: string;
  required: boolean;
  siteId: number;
  version: string;
}

export interface DocumentRecord {
  id: number;
  title: string;
  kind: DocumentKind;
  body: string;
  url: string;
  required: boolean;
  siteId: number;
  version: string;
  archived: boolean;
}

export interface AcknowledgementRecord {
  documentId: number;
  personId: number;
  version: string;
}

function asId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Required is the boolean true, or the stored flag "1". Nothing else. */
export function isRequiredFlag(value: unknown): boolean {
  return value === true || value === "1";
}

export function requiredFlag(value: unknown): string {
  return isRequiredFlag(value) ? "1" : "";
}

export function isArchived(value: unknown): boolean {
  return Boolean(value) && String(value).trim() !== "";
}

/**
 * A version derived from the title, body and link together.
 *
 * Changing any of them is a new document as far as acknowledgement is
 * concerned. Reformatting that leaves the wording untouched does not.
 */
export function documentVersion(input: {
  title?: unknown;
  body?: unknown;
  url?: unknown;
}): string {
  const title = String(input.title ?? "").replace(/\r\n/g, "\n").trim();
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  const url = String(input.url ?? "").trim();
  return contentVersion("doc", `${title}\n${body}\n${url}`);
}

export function currentAcknowledgement(
  acks: AcknowledgementRecord[],
  documentId: number,
  personId: number,
  version: string
): AcknowledgementRecord | undefined {
  return acks.find(
    (ack) =>
      ack.documentId === documentId &&
      ack.personId === personId &&
      ack.version === version
  );
}

/**
 * Required, live documents this person has not accepted at the current
 * wording. Optional documents and archived ones are not nagged.
 */
export function outstandingDocuments(
  documents: DocumentRecord[],
  acks: AcknowledgementRecord[],
  personId: number
): DocumentRecord[] {
  return documents.filter((doc) => {
    if (doc.archived || !doc.required) return false;
    return !currentAcknowledgement(acks, doc.id, personId, doc.version);
  });
}

function parseUrl(value: unknown): { url: string; error?: DocumentProblem } {
  const url = String(value ?? "").trim();
  if (!url) return { url: "" };
  if (url.length > MAX_DOCUMENT_URL) return { url: "", error: "tooLong" };
  if (!/^https?:\/\//i.test(url)) return { url: "", error: "badUrl" };
  return { url };
}

export function validateDocument(input: {
  title?: unknown;
  kind?: unknown;
  body?: unknown;
  url?: unknown;
  required?: unknown;
  siteId?: unknown;
}): { ok: true; draft: DocumentDraft } | { ok: false; reason: DocumentProblem } {
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, reason: "noTitle" };

  const kind = documentKind(input.kind);
  if (!kind) return { ok: false, reason: "noKind" };

  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  const parsedUrl = parseUrl(input.url);
  if (parsedUrl.error) return { ok: false, reason: parsedUrl.error };
  if (body.length > MAX_DOCUMENT_CHARS) return { ok: false, reason: "tooLong" };
  if (!body && !parsedUrl.url) return { ok: false, reason: "noContent" };

  const siteId = asId(input.siteId);
  if (!siteId) return { ok: false, reason: "noSite" };

  return {
    ok: true,
    draft: {
      title,
      kind,
      body,
      url: parsedUrl.url,
      required: isRequiredFlag(input.required),
      siteId,
      version: documentVersion({ title, body, url: parsedUrl.url }),
    },
  };
}

export function validateAck(input: {
  documentId?: unknown;
  accepted?: unknown;
}): { ok: true; documentId: number } | { ok: false; reason: "noDocument" | "notAccepted" } {
  const documentId = asId(input.documentId);
  if (!documentId) return { ok: false, reason: "noDocument" };
  if (input.accepted !== true) return { ok: false, reason: "notAccepted" };
  return { ok: true, documentId };
}
