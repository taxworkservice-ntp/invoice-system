import type { DocumentLineItem } from "../types";
import { formatBuddhistDate } from "./dates";

/**
 * Classic V2 detail-mode DN grouping (BOQ-style hierarchical numbering).
 *
 * Groups are derived from the item lines' source refs at render time — the
 * qty-0 DN marker rows never render. A line starts (or continues) a group
 * when it has a source line item AND a `lineDeliveryNoteMap` entry; the
 * group breaks when the source document changes between consecutive
 * renderable lines. This matches the historical band predicate exactly, so
 * pagination and render can never disagree about group boundaries.
 *
 * Numbering: groups and standalone lines share one top-level sequence
 * (1, 2, 3…); group children are numbered hierarchically (1.1, 1.2…).
 * Invoices without groups (or ref-saved one-row-per-DN invoices, whose rows
 * have no `source_line_item_id`) degrade to plain flat 1..n numbering.
 *
 * Dependency-free (no Supabase chain) so it can be unit-checked via tsx.
 */

export type DnRefKind = "delivery_note" | "quotation";

/** Breathing room after each DN group (mm) — rendered as a borderless
 * spacer row and charged to the group's last line in pagination. Must match
 * the `.print-classic-dn-spacer` CSS height. */
export const DN_GROUP_SPACER_MM = 3;

export interface DnRefInfo {
  number: string;
  issue_date: string | null;
  kind?: DnRefKind;
}

export type DnRefMap = Record<string, DnRefInfo>;

export interface DnGroupBlock {
  type: "group";
  /** Source document id shared by the group's lines. */
  key: string;
  /** Top-level number of the group (1-based). */
  g: number;
  number: string;
  issueDate: string | null;
  kind: DnRefKind | undefined;
  items: DocumentLineItem[];
  /** Σ line_total of the group, rounded to 2dp. */
  subtotal: number;
}

export interface DnSingleBlock {
  type: "single";
  /** Top-level number of the line (1-based). */
  s: number;
  item: DocumentLineItem;
}

export type DnBlock = DnGroupBlock | DnSingleBlock;

export interface DnHeaderPayload {
  g: number;
  number: string;
  issueDate: string | null;
  kind: DnRefKind | undefined;
  subtotal: number;
}

/** Row plan entry aligned 1:1 with the flattened renderable lines. */
export interface DnRowPlanEntry {
  item: DocumentLineItem;
  /** "G" for singles, "G.j" for group children. */
  number: string;
  /** Present on the first child of each group (header renders above it). */
  header: DnHeaderPayload | null;
  /** True on the last child of each group (spacer renders below it), except
   * the document's final line — no trailing gap before the totals. */
  spacerAfter: boolean;
  /** Present on the last child of a MULTI-line group (sum row renders below
   * the child, above any spacer). Single-line groups need no sum — it would
   * duplicate the line amount. Shown even on the document's final line. */
  footerAfter: DnHeaderPayload | null;
}

/** Marker rows (qty-0 DN headers) never render — strip them first. */
export function filterDnRenderLines(
  lines: DocumentLineItem[],
): DocumentLineItem[] {
  return lines.filter(
    (item) =>
      !(
        item.quantity === 0 &&
        !!item.source_document_id &&
        !item.source_line_item_id
      ),
  );
}

function groupable(
  item: DocumentLineItem,
  refMap: DnRefMap,
): boolean {
  return (
    !!item.source_document_id &&
    !!item.source_line_item_id &&
    !!refMap[item.id]
  );
}

export function buildDnBlocks(
  renderableLines: DocumentLineItem[],
  refMap: DnRefMap,
): DnBlock[] {
  const blocks: DnBlock[] = [];
  let top = 0;
  let open: { key: string; items: DocumentLineItem[] } | null = null;
  let prevSource: string | null = null;

  const flush = () => {
    if (!open) return;
    const first = open.items[0];
    const ref = refMap[first.id];
    top += 1;
    const g = top;
    blocks.push({
      type: "group",
      key: open.key,
      g,
      number: ref.number,
      issueDate: ref.issue_date,
      kind: ref.kind,
      items: open.items,
      subtotal:
        Math.round(
          open.items.reduce((s, l) => s + (Number(l.line_total) || 0), 0) *
            100,
        ) / 100,
    });
    open = null;
  };

  for (const item of renderableLines) {
    if (groupable(item, refMap) && item.source_document_id !== prevSource) {
      flush();
      open = { key: item.source_document_id as string, items: [] };
    } else if (!groupable(item, refMap)) {
      flush();
    }
    if (open && groupable(item, refMap)) {
      open.items.push(item);
    } else {
      top += 1;
      blocks.push({ type: "single", s: top, item });
    }
    prevSource = item.source_document_id ?? null;
  }
  flush();
  return blocks;
}

/** Canonical band label shape (kept so RefItemName date styling holds). */
export function dnHeaderLabel(payload: {
  number: string;
  issueDate: string | null;
}): string {
  return payload.issueDate
    ? `${payload.number} วันที่: ${formatBuddhistDate(payload.issueDate)}`
    : payload.number;
}

export function dnHeaderPrefix(
  kind: DnRefKind | undefined,
): string {
  return kind === "quotation" ? "อ้างอิงใบเสนอราคา" : "อ้างอิงใบส่งของ";
}

/** Flatten blocks into per-line row plans (global numbers, header payloads). */
export function planDnRows(blocks: DnBlock[]): DnRowPlanEntry[] {
  const plan: DnRowPlanEntry[] = [];
  for (const block of blocks) {
    if (block.type === "single") {
      plan.push({
        item: block.item,
        number: `${block.s}`,
        header: null,
        spacerAfter: false,
        footerAfter: null,
      });
    } else {
      const header: DnHeaderPayload = {
        g: block.g,
        number: block.number,
        issueDate: block.issueDate,
        kind: block.kind,
        subtotal: block.subtotal,
      };
      block.items.forEach((item, j) => {
        plan.push({
          item,
          number: `${block.g}.${j + 1}`,
          header: j === 0 ? header : null,
          // Set below: only the group's last child gets a spacer, and never
          // the document's final line.
          spacerAfter: false,
          // Sum row only for multi-line groups, on the last child.
          footerAfter:
            block.items.length > 1 && j === block.items.length - 1
              ? header
              : null,
        });
      });
    }
  }
  // Mark each group's last child (except the document's final line): a
  // spacer renders below it so groups read as separated blocks. Standalone
  // lines never get spacers — flat invoices render exactly as before.
  const topOf = (n: string) => n.split(".")[0];
  for (let i = 0; i < plan.length - 1; i++) {
    if (
      plan[i].number.includes(".") &&
      topOf(plan[i].number) !== topOf(plan[i + 1].number)
    ) {
      plan[i].spacerAfter = true;
    }
  }
  return plan;
}
