import { describe, expect, it } from "vitest";
import { getDocumentMenuActions } from "../../src/lib/documentActions";
import { getDefaultWorkspacePermissions } from "../../src/lib/permissions";
import type { Document, DocumentStatus, DocumentType } from "../../src/types";

const owner = getDefaultWorkspacePermissions("owner");

function makeDoc(docType: DocumentType, status: DocumentStatus): Document {
  return { doc_type: docType, status } as unknown as Document;
}

function ids(doc: Document) {
  return getDocumentMenuActions(doc, owner).map((action) => action.id);
}

describe("getDocumentMenuActions", () => {
  it("offers send, edit and delete for a draft quotation", () => {
    expect(ids(makeDoc("quotation", "draft"))).toEqual(["send", "edit", "delete"]);
  });

  it("does not duplicate edit/delete/send for a draft debit note", () => {
    const result = ids(makeDoc("debit_note", "draft"));
    expect(result).toEqual(["issue_cn", "edit", "delete"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("offers confirm receipt for a draft receipt", () => {
    expect(ids(makeDoc("receipt", "draft"))).toEqual(["confirm_receipt", "edit", "delete"]);
  });

  it("offers convert, void and copy for a sent quotation", () => {
    expect(ids(makeDoc("quotation", "sent"))).toEqual(["convert", "void", "copy"]);
  });

  it("offers billing, payment and void for a sent invoice", () => {
    expect(ids(makeDoc("invoice", "sent"))).toEqual(["billing", "pay", "void", "copy"]);
  });

  it("offers payment and void for a sent billing note", () => {
    expect(ids(makeDoc("billing_note", "sent"))).toEqual(["pay", "void", "copy"]);
  });

  it("offers invoice-from-DN and void for a sent delivery note", () => {
    expect(ids(makeDoc("delivery_note", "sent"))).toEqual(["invoice_from_dn", "void", "copy"]);
  });

  it("offers void for an issued credit note", () => {
    expect(ids(makeDoc("credit_note", "issued"))).toEqual(["void"]);
  });

  it("offers nothing for a voided document", () => {
    expect(ids(makeDoc("invoice", "voided"))).toEqual([]);
  });

  it("hides delete when the role cannot delete", () => {
    const officer = getDefaultWorkspacePermissions("officer");
    const actions = getDocumentMenuActions(makeDoc("quotation", "draft"), officer);
    expect(actions.map((action) => action.id)).not.toContain("delete");
  });
});
