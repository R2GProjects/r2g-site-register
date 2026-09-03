import { describe, expect, it } from "vitest";
import {
  currentAcknowledgement,
  documentKind,
  documentVersion,
  isRequiredFlag,
  outstandingDocuments,
  requiredFlag,
  validateAck,
  validateDocument,
  type DocumentRecord,
} from "@/lib/documents";

const siteDoc = {
  title: "Scaffold SWMS",
  kind: "swms",
  body: "Harness on above 2m.",
  siteId: 4,
  required: true,
};

describe("documentVersion", () => {
  it("is stable for the same wording", () => {
    expect(documentVersion(siteDoc)).toBe(documentVersion(siteDoc));
  });

  it("changes when the body changes, so an old acknowledgement does not cover the new text", () => {
    expect(documentVersion(siteDoc)).not.toBe(
      documentVersion({ ...siteDoc, body: "Harness on above 1.5m." })
    );
  });

  it("changes when the title or link changes", () => {
    expect(documentVersion(siteDoc)).not.toBe(
      documentVersion({ ...siteDoc, title: "Scaffold SWMS rev 2" })
    );
    expect(documentVersion(siteDoc)).not.toBe(
      documentVersion({ ...siteDoc, url: "https://files.example/swms.pdf" })
    );
  });

  it("ignores line endings that leave the wording untouched", () => {
    expect(documentVersion({ title: "A", body: "One.\nTwo." })).toBe(
      documentVersion({ title: "A", body: "  One.\r\nTwo.\r\n  " })
    );
  });
});

describe("validateDocument", () => {
  it("accepts a SWMS with body text", () => {
    const result = validateDocument(siteDoc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.kind).toBe("swms");
      expect(result.draft.required).toBe(true);
      expect(result.draft.version).toMatch(/^doc-/);
    }
  });

  it("accepts a link with no body, for a PDF hosted elsewhere", () => {
    const result = validateDocument({
      title: "Traffic SWMS",
      siteId: 4,
      url: "https://files.example/traffic.pdf",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.body).toBe("");
  });

  it("refuses a document with neither body nor link", () => {
    expect(validateDocument({ title: "Empty", siteId: 4 })).toEqual({
      ok: false,
      reason: "noContent",
    });
  });

  it("refuses a missing title or site", () => {
    expect(validateDocument({ ...siteDoc, title: "  " })).toEqual({
      ok: false,
      reason: "noTitle",
    });
    expect(validateDocument({ ...siteDoc, siteId: "" })).toEqual({
      ok: false,
      reason: "noSite",
    });
  });

  it("refuses a link that is not http(s)", () => {
    expect(
      validateDocument({ title: "X", siteId: 4, url: "javascript:alert(1)" })
    ).toEqual({ ok: false, reason: "badUrl" });
  });

  it("does not treat a string as required", () => {
    const result = validateDocument({ ...siteDoc, required: "true" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.required).toBe(false);
  });
});

describe("isRequiredFlag", () => {
  it("treats only true or the stored 1 as required", () => {
    expect(isRequiredFlag(true)).toBe(true);
    expect(isRequiredFlag("1")).toBe(true);
    expect(isRequiredFlag("true")).toBe(false);
    expect(requiredFlag(true)).toBe("1");
    expect(requiredFlag(false)).toBe("");
  });
});

describe("documentKind", () => {
  it.each([
    ["swms", "swms"],
    ["SWMS", "swms"],
    ["procedure", "procedure"],
    ["", "other"],
  ])("reads %p as %p", (input, expected) => {
    expect(documentKind(input)).toBe(expected);
  });

  it("rejects an unknown kind", () => {
    expect(documentKind("permit")).toBeNull();
  });
});

describe("outstandingDocuments", () => {
  const docs: DocumentRecord[] = [
    {
      id: 1,
      title: "Scaffold SWMS",
      kind: "swms",
      body: "Harness.",
      url: "",
      required: true,
      siteId: 4,
      version: "doc-aaa",
      archived: false,
    },
    {
      id: 2,
      title: "Optional note",
      kind: "other",
      body: "FYI",
      url: "",
      required: false,
      siteId: 4,
      version: "doc-bbb",
      archived: false,
    },
    {
      id: 3,
      title: "Old SWMS",
      kind: "swms",
      body: "Retired",
      url: "",
      required: true,
      siteId: 4,
      version: "doc-ccc",
      archived: true,
    },
  ];

  it("nags only a required live document with no current acknowledgement", () => {
    expect(outstandingDocuments(docs, [], 10).map((d) => d.id)).toEqual([1]);
  });

  it("clears the nag when the current version is acknowledged", () => {
    const acks = [
      { documentId: 1, personId: 10, version: "doc-aaa" },
    ];
    expect(outstandingDocuments(docs, acks, 10)).toEqual([]);
  });

  it("nags again after the wording changes", () => {
    const acks = [
      { documentId: 1, personId: 10, version: "doc-old" },
    ];
    expect(outstandingDocuments(docs, acks, 10).map((d) => d.id)).toEqual([1]);
  });

  it("does not treat another worker's acknowledgement as this one's", () => {
    const acks = [
      { documentId: 1, personId: 99, version: "doc-aaa" },
    ];
    expect(outstandingDocuments(docs, acks, 10)).toHaveLength(1);
  });
});

describe("currentAcknowledgement", () => {
  it("matches only the same document, person and version", () => {
    const acks = [
      { documentId: 1, personId: 10, version: "doc-aaa" },
      { documentId: 1, personId: 10, version: "doc-bbb" },
    ];
    expect(currentAcknowledgement(acks, 1, 10, "doc-aaa")?.version).toBe(
      "doc-aaa"
    );
    expect(currentAcknowledgement(acks, 1, 10, "doc-ccc")).toBeUndefined();
  });
});

describe("validateAck", () => {
  it("requires a real tick, not a string", () => {
    expect(validateAck({ documentId: 1, accepted: true })).toEqual({
      ok: true,
      documentId: 1,
    });
    expect(validateAck({ documentId: 1, accepted: "true" })).toEqual({
      ok: false,
      reason: "notAccepted",
    });
    expect(validateAck({ documentId: "", accepted: true })).toEqual({
      ok: false,
      reason: "noDocument",
    });
  });
});
