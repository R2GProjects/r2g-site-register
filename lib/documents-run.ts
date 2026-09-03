import { generateUUID, nowISO } from "@/lib/auth";
import {
  documentVersion,
  isArchived,
  isRequiredFlag,
  outstandingDocuments,
  requiredFlag,
  validateAck,
  validateDocument,
  type AcknowledgementRecord,
  type DocumentKind,
  type DocumentRecord,
} from "@/lib/documents";
import {
  TABLES,
  attachPersonDetails,
  attachSiteDetails,
  create,
  ensureDocumentAckTable,
  ensureDocumentTable,
  escapeWhereValue,
  getOne,
  list,
  numericId,
  update,
} from "@/lib/nocodb";

const DOC_LIST_FIELDS =
  "Id,DocumentUUID,Title,Kind,Url,Version,Required,Sites_id,ArchivedAt,CreatedAt1,UpdatedAt1";
const ACK_FIELDS =
  "Id,AckUUID,Documents_id,DocumentVersion,People_id,Sites_id,AcceptedAt";

function withNumericSite(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, Sites_id: numericId(row.Sites_id) };
}

function asKind(value: unknown): DocumentKind {
  const raw = String(value ?? "other");
  return raw === "swms" || raw === "procedure" ? raw : "other";
}

function asRecord(row: Record<string, unknown>): DocumentRecord | null {
  const id = numericId(row.Id);
  const siteId = numericId(row.Sites_id);
  if (!id || !siteId) return null;
  const title = String(row.Title ?? "").trim();
  const body = String(row.Body ?? "");
  const url = String(row.Url ?? "").trim();
  const stored = String(row.Version ?? "").trim();
  return {
    id,
    title,
    kind: asKind(row.Kind),
    body,
    url,
    required: isRequiredFlag(row.Required),
    siteId,
    version: stored || documentVersion({ title, body, url }),
    archived: isArchived(row.ArchivedAt),
  };
}

function asAck(row: Record<string, unknown>): AcknowledgementRecord | null {
  const documentId = numericId(row.Documents_id);
  const personId = numericId(row.People_id);
  const version = String(row.DocumentVersion ?? "").trim();
  if (!documentId || !personId || !version) return null;
  return { documentId, personId, version };
}

function siteIdFrom(row: Record<string, unknown>): number | null {
  const linked = row.Site;
  if (linked && typeof linked === "object") {
    const id = numericId((linked as { Id?: unknown }).Id);
    if (id) return id;
  }
  return numericId(row.Sites_id);
}

function withoutBody(doc: DocumentRecord) {
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    url: doc.url,
    required: doc.required,
    siteId: doc.siteId,
    version: doc.version,
    archived: doc.archived,
  };
}

export async function workerSiteIds(personId: number): Promise<number[]> {
  const [access, onsite] = await Promise.all([
    list<Record<string, unknown>>(TABLES.SiteAccess, {
      where: `(People_id,eq,${personId})`,
      limit: 200,
      fields: "Id,Site,Sites_id",
    }),
    list<Record<string, unknown>>(TABLES.Attendance, {
      where: `((People_id,eq,${personId})~and(Status,eq,OnSite))`,
      limit: 5,
      fields: "Id,Site,Sites_id",
    }),
  ]);
  const ids = new Set<number>();
  for (const row of [...access, ...onsite]) {
    const id = siteIdFrom(row);
    if (id) ids.add(id);
  }
  return [...ids];
}

export async function listSiteDocuments(siteId: number | null) {
  const table = await ensureDocumentTable();
  const rows = await list<Record<string, unknown>>(table, {
    where: siteId ? `(Sites_id,eq,${siteId})` : "",
    limit: 200,
    sort: "-UpdatedAt1",
    fields: DOC_LIST_FIELDS,
  });
  const withSites = await attachSiteDetails(rows.map(withNumericSite));
  return withSites.map((row) => {
    const record = asRecord(row);
    return {
      ...row,
      Sites_id: record?.siteId ?? numericId(row.Sites_id),
      version: record?.version,
      required: record?.required ?? false,
      archived: record?.archived ?? false,
      Site: row.Site,
    };
  });
}

export async function getDocument(id: number) {
  const table = await ensureDocumentTable();
  const row = await getOne<Record<string, unknown>>(table, id);
  if (!row) return null;
  const [withSite] = await attachSiteDetails([withNumericSite(row)]);
  const record = asRecord(withSite);
  return record
    ? { ...withSite, ...record, Site: withSite.Site }
    : withSite;
}

export async function saveDocument(body: Record<string, unknown>) {
  const parsed = validateDocument(body);
  if (!parsed.ok) {
    const message =
      parsed.reason === "noTitle"
        ? "A document needs a title."
        : parsed.reason === "noContent"
          ? "Add the wording or a link to the file."
          : parsed.reason === "badUrl"
            ? "The link must start with http:// or https://."
            : parsed.reason === "noSite"
              ? "Pick a site."
              : parsed.reason === "tooLong"
                ? "That document is too long to store."
                : "That document type is not used.";
    return { error: message, status: 400 as const };
  }
  const site = await getOne<Record<string, unknown>>(
    TABLES.Sites,
    parsed.draft.siteId
  );
  if (!site) return { error: "Site not found.", status: 404 as const };

  const table = await ensureDocumentTable();
  const now = nowISO();
  const fields = {
    Title: parsed.draft.title,
    Kind: parsed.draft.kind,
    Body: parsed.draft.body || null,
    Url: parsed.draft.url || null,
    Version: parsed.draft.version,
    Required: requiredFlag(parsed.draft.required),
    Sites_id: String(parsed.draft.siteId),
    UpdatedAt1: now,
  };
  const existingId = numericId(body.Id ?? body.id);
  if (existingId) {
    const existing = await getOne<Record<string, unknown>>(table, existingId);
    if (!existing) return { error: "Document not found.", status: 404 as const };
    await update(table, { Id: existingId, ...fields });
    return { id: existingId, version: parsed.draft.version };
  }
  const id = await create(table, {
    DocumentUUID: generateUUID(),
    CreatedAt1: now,
    ...fields,
  });
  return { id, version: parsed.draft.version };
}

export async function archiveDocument(id: number) {
  const table = await ensureDocumentTable();
  const existing = await getOne<Record<string, unknown>>(table, id);
  if (!existing) return { error: "Document not found.", status: 404 as const };
  const now = nowISO();
  await update(table, {
    Id: id,
    ArchivedAt: now,
    UpdatedAt1: now,
  });
  return { ok: true as const };
}

export async function listAcks(documentId: number) {
  const table = await ensureDocumentAckTable();
  const rows = await list<Record<string, unknown>>(table, {
    where: `(Documents_id,eq,${documentId})`,
    limit: 200,
    sort: "-AcceptedAt",
    fields: ACK_FIELDS,
  });
  return attachPersonDetails(
    rows.map((row) => ({ ...row, People_id: numericId(row.People_id) }))
  );
}

export async function workerDocuments(personId: number) {
  const ids = await workerSiteIds(personId);
  if (ids.length === 0) {
    return {
      outstanding: [] as ReturnType<typeof withoutBody>[],
      documents: [] as ReturnType<typeof withoutBody>[],
    };
  }
  const table = await ensureDocumentTable();
  const ackTable = await ensureDocumentAckTable();
  const rows = await list<Record<string, unknown>>(table, {
    where: `(Sites_id,in,${ids.join(",")})`,
    limit: 200,
    fields: DOC_LIST_FIELDS,
  });
  const documents = rows
    .map(asRecord)
    .filter((row): row is DocumentRecord => row !== null && !row.archived);
  const ackRows = await list<Record<string, unknown>>(ackTable, {
    where: `(People_id,eq,${personId})`,
    limit: 500,
    fields: ACK_FIELDS,
  });
  const acks = ackRows
    .map(asAck)
    .filter((row): row is AcknowledgementRecord => row !== null);
  return {
    documents: documents.map(withoutBody),
    outstanding: outstandingDocuments(documents, acks, personId).map(withoutBody),
  };
}

export async function workerDocument(personId: number, documentId: number) {
  const ids = await workerSiteIds(personId);
  const table = await ensureDocumentTable();
  const row = await getOne<Record<string, unknown>>(table, documentId);
  if (!row) return null;
  const record = asRecord(row);
  if (!record || record.archived) return null;
  if (!ids.includes(record.siteId)) return null;
  return record;
}

export async function acknowledgeDocument(input: {
  documentId: unknown;
  accepted: unknown;
  personId: number;
}) {
  const parsed = validateAck(input);
  if (!parsed.ok) {
    return {
      error:
        parsed.reason === "notAccepted"
          ? "Tick that you have read this version."
          : "Pick a document.",
      status: 400 as const,
    };
  }
  const allowed = await workerSiteIds(input.personId);
  const table = await ensureDocumentTable();
  const row = await getOne<Record<string, unknown>>(table, parsed.documentId);
  if (!row) return { error: "Document not found.", status: 404 as const };
  const record = asRecord(row);
  if (!record || record.archived) {
    return { error: "That document is no longer in use.", status: 400 as const };
  }
  if (!allowed.includes(record.siteId)) {
    return { error: "That document is not for your sites.", status: 403 as const };
  }

  const ackTable = await ensureDocumentAckTable();
  const version = escapeWhereValue(record.version);
  const existing = await list<Record<string, unknown>>(ackTable, {
    where: `((Documents_id,eq,${record.id})~and(People_id,eq,${input.personId})~and(DocumentVersion,eq,${version}))`,
    limit: 1,
    fields: "Id",
  });
  if (existing[0]) return { id: existing[0].Id as number, already: true };

  const now = nowISO();
  const id = await create(ackTable, {
    AckUUID: generateUUID(),
    Documents_id: String(record.id),
    DocumentVersion: record.version,
    Snapshot: JSON.stringify({
      title: record.title,
      body: record.body,
      url: record.url,
      kind: record.kind,
    }),
    People_id: String(input.personId),
    Sites_id: String(record.siteId),
    AcceptedAt: now,
    CreatedAt1: now,
  });
  await create(TABLES.AuditLog, {
    AuditUUID: generateUUID(),
    EventType: "DocumentAcknowledged",
    Person: String(input.personId),
    Site: String(record.siteId),
    PerformedBy: String(input.personId),
    Source: "Worker",
    NewValue: record.version,
    CreatedAt1: now,
  });
  return { id, already: false };
}
