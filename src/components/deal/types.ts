import type { BillingRef } from "../../lib/billingRefs";
import type { DealStageInfo } from "../../lib/dealWorkflow";
import type { WorkspacePermissions } from "../../lib/permissions";
import type { BillingNoteInvoice, Customer, Deal, Document, DocumentLineItem } from "../../types";

export interface DocWithMeta {
  document: Document;
  stage: "quote" | "invoice" | "collect" | "done";
  line_items: DocumentLineItem[];
  billing_invoices: BillingNoteInvoice[];
}

/**
 * A document from ANOTHER deal that this deal's invoices billed (billing-run
 * deals). Display-only: it renders as a card in this deal's document history
 * but stays in its original deal — never re-parented.
 */
export interface BorrowedDoc extends DocWithMeta {
  sourceDealId: string;
  sourceDealNumber: string | null;
}

export interface DealBillingRefs {
  billedIn: BillingRef | null;
  sourceDeals: Array<{
    dealId: string;
    dealNumber: string | null;
    invoiceNumber: string | null;
  }>;
}

export interface DealHeaderModel {
  deal: Deal;
  customer: Customer | null;
  title: string;
  itemSummary: string;
  workflow: DealStageInfo;
  isOverdue: boolean;
  overdueDueDate: string | null;
  amount: number;
  amountLabel: string;
  billingRefs: DealBillingRefs;
  nonVoidedDocs: DocWithMeta[];
  allDone: boolean;
  permissions: WorkspacePermissions;
}
