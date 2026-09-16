import type { Document, DocumentType } from "../types";
import { matchesDocumentQuery } from "./documentSearch";
import { isDocumentOverdue } from "./dealStatus";

export type AgingBucket = "all" | "0-30" | "31-60" | "61-90" | "90+" | "due-soon";

export type DocumentSort =
  | "newest"
  | "oldest"
  | "amount_desc"
  | "amount_asc"
  | "due_soonest"
  | "customer_az";

export interface DocumentFilters {
  q: string;
  type: DocumentType | "all";
  status: string;
  /** "all" | "1".."12" */
  month: string;
  /** "all" | "2026" */
  year: string;
  from: string;
  to: string;
  hideVoided: boolean;
  amountMin: number | null;
  amountMax: number | null;
  aging: AgingBucket;
  customerId: string | null;
  item: string;
  /** "all" | "cash" | "bank_transfer" | "cheque" */
  method: string;
  vatOnly: boolean;
  whtOnly: boolean;
}

export const EMPTY_FILTERS: DocumentFilters = {
  q: "",
  type: "all",
  status: "all",
  month: "all",
  year: "all",
  from: "",
  to: "",
  hideVoided: false,
  amountMin: null,
  amountMax: null,
  aging: "all",
  customerId: null,
  item: "",
  method: "all",
  vatOnly: false,
  whtOnly: false,
};

/** The amount a row displays: delivery notes headline their reference value. */
export function getDocumentDisplayAmount(doc: Document): number {
  return doc.doc_type === "delivery_note" ? doc.total_amount : doc.net_payable;
}

const COLLECTIBLE_STATUSES = ["sent", "in_billing", "partially_paid", "overdue"];

/** Days since the due date (negative = still in the future), Bangkok-based. */
function daysOverdue(doc: Document, today: string): number | null {
  if (!doc.due_date) return null;
  const due = new Date(`${doc.due_date}T00:00:00+07:00`).getTime();
  const now = new Date(`${today}T00:00:00+07:00`).getTime();
  if (Number.isNaN(due) || Number.isNaN(now)) return null;
  return Math.floor((now - due) / 86_400_000);
}

function matchesAging(doc: Document, aging: AgingBucket, today: string): boolean {
  if (aging === "all") return true;
  if (!COLLECTIBLE_STATUSES.includes(doc.status)) return false;
  const overdue = daysOverdue(doc, today);
  if (overdue == null) return false;
  if (aging === "due-soon") return overdue <= 0 && overdue >= -7;
  if (overdue <= 0) return false;
  if (aging === "0-30") return overdue <= 30;
  if (aging === "31-60") return overdue > 30 && overdue <= 60;
  if (aging === "61-90") return overdue > 60 && overdue <= 90;
  return overdue > 90;
}

function matchesItem(doc: Document, item: string): boolean {
  const term = item.trim().toLowerCase();
  if (!term) return true;
  if (!Array.isArray(doc.line_items)) return false;
  return doc.line_items.some((line) => {
    const name = (line.item_name || "").toLowerCase();
    const sku = (line.item_sku || "").toLowerCase();
    return name.includes(term) || sku.includes(term);
  });
}

/** Single source for every archive filter — used by the list page and tested directly. */
export function matchesDocumentFilters(
  doc: Document,
  filters: DocumentFilters,
  today: string,
): boolean {
  if (filters.type !== "all" && doc.doc_type !== filters.type) return false;

  if (filters.status !== "all") {
    if (filters.status === "processing") {
      if (!["draft", "sent", "in_billing", "overdue", "converted", "partially_paid"].includes(doc.status)) {
        return false;
      }
    } else if (filters.status === "done") {
      if (!["paid", "generated", "issued"].includes(doc.status)) return false;
    } else if (filters.status === "overdue") {
      if (!isDocumentOverdue(doc, today)) return false;
    } else if (doc.status !== filters.status) {
      return false;
    }
  }

  if (filters.hideVoided && doc.status === "voided" && filters.status !== "voided") return false;
  if (filters.from && doc.issue_date < filters.from) return false;
  if (filters.to && doc.issue_date > filters.to) return false;

  if (filters.month !== "all" && doc.issue_date) {
    if (new Date(doc.issue_date).getMonth() + 1 !== Number(filters.month)) return false;
  }
  if (filters.year !== "all" && doc.issue_date) {
    if (new Date(doc.issue_date).getFullYear() !== Number(filters.year)) return false;
  }

  const amount = getDocumentDisplayAmount(doc);
  if (filters.amountMin != null && amount < filters.amountMin) return false;
  if (filters.amountMax != null && amount > filters.amountMax) return false;

  if (!matchesAging(doc, filters.aging, today)) return false;
  if (filters.customerId && doc.customer_id !== filters.customerId) return false;
  if (!matchesItem(doc, filters.item)) return false;
  if (filters.method !== "all" && doc.payment_method !== filters.method) return false;
  if (filters.vatOnly && !doc.vat_registered) return false;
  if (filters.whtOnly && !(doc.wht_amount > 0 || doc.wht_rate > 0)) return false;

  return matchesDocumentQuery(doc, filters.q);
}

export function sortDocuments(docs: Document[], sort: DocumentSort): Document[] {
  const sorted = [...docs];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => (a.issue_date || "").localeCompare(b.issue_date || ""));
    case "amount_desc":
      return sorted.sort((a, b) => getDocumentDisplayAmount(b) - getDocumentDisplayAmount(a));
    case "amount_asc":
      return sorted.sort((a, b) => getDocumentDisplayAmount(a) - getDocumentDisplayAmount(b));
    case "due_soonest":
      return sorted.sort((a, b) => {
        const aDue = a.due_date || "9999-12-31";
        const bDue = b.due_date || "9999-12-31";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        return (b.issue_date || "").localeCompare(a.issue_date || "");
      });
    case "customer_az":
      return sorted.sort((a, b) => {
        const aName = (a as { customer?: { name?: string } }).customer?.name || "";
        const bName = (b as { customer?: { name?: string } }).customer?.name || "";
        const byName = aName.localeCompare(bName, "th");
        if (byName !== 0) return byName;
        return (b.issue_date || "").localeCompare(a.issue_date || "");
      });
    case "newest":
    default:
      return sorted.sort((a, b) => (b.issue_date || "").localeCompare(a.issue_date || ""));
  }
}

/** Number of active filters — drives the toolbar badge. Excludes month/year defaults. */
export function countActiveFilters(filters: DocumentFilters): number {
  let count = 0;
  if (filters.q) count++;
  if (filters.type !== "all") count++;
  if (filters.status !== "all") count++;
  if (filters.month !== "all") count++;
  if (filters.year !== "all") count++;
  if (filters.from) count++;
  if (filters.to) count++;
  if (filters.hideVoided) count++;
  if (filters.amountMin != null) count++;
  if (filters.amountMax != null) count++;
  if (filters.aging !== "all") count++;
  if (filters.customerId) count++;
  if (filters.item) count++;
  if (filters.method !== "all") count++;
  if (filters.vatOnly) count++;
  if (filters.whtOnly) count++;
  return count;
}
