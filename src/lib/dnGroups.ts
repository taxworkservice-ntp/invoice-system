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

/** Compact delivery-note spacing: spacer height when classic_v2_compact_dn is on.
 * Measured 2.2mm (CSS height 2mm + row border) by print-layout-measure.mjs. */
export const DN_GROUP_SPACER_COMPACT_MM = 2.2;

export interface DnRefInfo {
  number: string;
  issue_date: string | null;
  kind?: DnRefKind;
  /** Frozen SO header snapshot (invoice link) — second line under the group header. */
  soHeader?: string | null;
  /** Frozen DN section index (0-based among marker-led runs, null = ungrouped).
   * Invoice lines billed from multi-section DNs carry one group per section. */
  section?: number | null;
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
  soHeader: string | null;
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
  soHeader: string | null;
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

/**
 * Free-text SO group header for a delivery note (Classic V2 opt-in).
 * Non-DN doc types and blank text collapse to null — every render and
 * pagination predicate shares this, so empty always means today's flat
 * layout with byte-identical output.
 */
export function getDnSoHeaderText(
  docType: string,
  value: string | null | undefined,
): string | null {
  if (docType !== "delivery_note") return null;
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Single-group row plan for a DN carrying an SO header: one "1." header
 * holding only the SO text, every line numbered 1.1…. Takes precedence over
 * source grouping on the DN itself — an explicitly typed header wins over
 * the incidental quotation back-reference. No sum footer (DN amounts are
 * usually hidden) and no spacers (one group has no boundaries).
 */
export function buildDnSoHeaderPlan(
  renderableLines: DocumentLineItem[],
  soHeader: string,
): DnRowPlanEntry[] {
  const header: DnHeaderPayload = {
    g: 1,
    number: "",
    issueDate: null,
    kind: undefined,
    soHeader,
    subtotal: 0,
  };
  return renderableLines.map((item, j) => ({
    item,
    number: `1.${j + 1}`,
    header: j === 0 ? header : null,
    spacerAfter: false,
    footerAfter: null,
  }));
}

/** Qty-0 DN reference rows (invoice detail mode) — stripped before render. */
export function isDnRefMarker(item: Pick<DocumentLineItem, "quantity" | "source_document_id" | "source_line_item_id">): boolean {
  return (
    item.quantity === 0 &&
    !!item.source_document_id &&
    !item.source_line_item_id
  );
}

/** Marker rows (qty-0 DN headers) and section-header lines never render —
 * strip them first. NOTE: the row PLAN needs section markers (they become
 * headers), so plan inputs must only strip ref markers — see
 * filterDnRefMarkers. */
export function filterDnRenderLines(
  lines: DocumentLineItem[],
): DocumentLineItem[] {
  return lines.filter(
    (item) => !isDnRefMarker(item) && !isDnSectionMarker(item),
  );
}

/** Ref markers stripped, section markers KEPT — the row-plan input. */
export function filterDnRefMarkers(
  lines: DocumentLineItem[],
): DocumentLineItem[] {
  return lines.filter((item) => !isDnRefMarker(item));
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
  startTop = 0,
): DnBlock[] {
  const blocks: DnBlock[] = [];
  let top = startTop;
  let open: { key: string; items: DocumentLineItem[] } | null = null;
  let prevKey: string | null = null;

  // Group key: source document alone for section-less lines (legacy path,
  // byte-identical comparisons), source + frozen section for invoice lines
  // billed from multi-section DNs — one group per section.
  const groupKeyOf = (item: DocumentLineItem): string => {
    const section = refMap[item.id]?.section;
    return section == null
      ? (item.source_document_id as string)
      : `${item.source_document_id}::${section}`;
  };

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
      soHeader: ref.soHeader?.trim() ? ref.soHeader.trim() : null,
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
    if (groupable(item, refMap) && groupKeyOf(item) !== prevKey) {
      flush();
      open = { key: groupKeyOf(item), items: [] };
    } else if (!groupable(item, refMap)) {
      flush();
    }
    if (open && groupable(item, refMap)) {
      open.items.push(item);
    } else {
      top += 1;
      blocks.push({ type: "single", s: top, item });
    }
    prevKey = groupable(item, refMap) ? groupKeyOf(item) : (item.source_document_id ?? null);
  }
  flush();
  return blocks;
}

/** Canonical band label shape (kept so RefItemName date styling holds). */

/**
 * Printable line note — single shared implementation (every template's
 * local copy was folded in here). Internal control lines never print: the
 * [USAGE_BILL] utility-bill flag and the [DN_SECTION] section-marker tag.
 */
export function getPrintableLineNote(note: string | null | undefined): string {
  return String(note || "")
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.trim();
      return text !== "[USAGE_BILL]" && text !== DN_SECTION_TAG;
    })
    .join("\n")
    .trim();
}

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
        soHeader: block.soHeader,
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
  return markGroupSpacers(plan);
}

/**
 * Spacer post-pass shared by every row plan: a dotted (hierarchical) number
 * followed by a different top-level number means a group/section boundary,
 * so the boundary line gets breathing room below it — except on the
 * document's final line (no trailing gap before the totals).
 */
function markGroupSpacers(plan: DnRowPlanEntry[]): DnRowPlanEntry[] {
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

/* ============ DN section markers (multiple SO groups, opt-in) ============ */
/**
 * Section-header lines let one delivery note carry MORE THAN ONE reference
 * group (e.g. two customer SOs on the same trip). A marker is a plain line
 * item — qty 0, price 0, no source refs — whose line_note carries
 * DN_SECTION_TAG and whose item_name is the printed header text. Markers
 * never render as rows (see filterDnRenderLines); they split the lines
 * below them into a named "G / G.j" section.
 *
 * Markers are DN-only by construction (only the DN forms can create them),
 * so no schema change was needed: detection is purely conventional.
 */
export const DN_SECTION_TAG = "[DN_SECTION]";

type SectionMarkerLike = Pick<
  DocumentLineItem,
  "quantity" | "unit_price" | "source_document_id" | "source_line_item_id" | "line_note"
>;

export function isDnSectionMarker(item: SectionMarkerLike): boolean {
  if (item.quantity !== 0) return false;
  if ((Number(item.unit_price) || 0) !== 0) return false;
  if (item.source_document_id || item.source_line_item_id) return false;
  return String(item.line_note || "")
    .split(/\r?\n/)
    .some((noteLine) => noteLine.trim() === DN_SECTION_TAG);
}

/** Printed header text of a marker (null when blank — blank markers are ignored). */
export function getDnSectionHeaderText(
  item: Pick<DocumentLineItem, "item_name">,
): string | null {
  const text = String(item.item_name || "").trim();
  return text ? text : null;
}

/** Ordered section header texts in a line list — the invoice-freeze source. */
export function getDnSectionHeaders(
  lines: (SectionMarkerLike & Pick<DocumentLineItem, "item_name">)[],
): string[] {
  const headers: string[] = [];
  for (const item of lines) {
    if (!isDnSectionMarker(item)) continue;
    const text = getDnSectionHeaderText(item);
    if (text) headers.push(text);
  }
  return headers;
}

/**
 * Freeze encoding for multi-section headers: blank-filtered, newline-joined
 * into the single-text `invoice_delivery_notes.so_header` column. One header
 * per visual line — never `" / "`-joined soup. Inverse of
 * splitDnSectionHeaders.
 */
export function joinDnSectionHeaders(headers: (string | null | undefined)[]): string {
  return headers
    .map((h) => String(h || "").trim())
    .filter((h) => h !== "")
    .join("\n");
}

/** Split a frozen section-header value back into printable lines. */
export function splitDnSectionHeaders(value: string | null | undefined): string[] {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * Which SO text an invoice line's group header shows. Section lines take
 * their own entry from the frozen newline-joined link header (falling back
 * to the whole value when the index is out of range); ungrouped lines keep
 * the whole value verbatim — the legacy path, so issued invoices never
 * change.
 */
export function resolveSectionSoHeader(
  linkSoHeader: string | null | undefined,
  section: number | null | undefined,
): string | null {
  const text = String(linkSoHeader || "").trim();
  if (!text) return null;
  if (section == null) return text;
  const parts = splitDnSectionHeaders(text);
  return parts[section] ?? text;
}

/**
 * Section membership of a DN's lines in document order (billing-time
 * snapshot): 0-based index among marker-led runs, null outside any section.
 * Mirrors buildDnSectionPlan's run-splitting exactly (blank markers end the
 * run without starting one), so the invoice groups what the DN shows.
 */
export function getDnLineSectionMap(
  lines: (SectionMarkerLike & Pick<DocumentLineItem, "item_name"> & { id: string })[],
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  let section = -1;
  let inSection = false;
  for (const line of lines) {
    if (isDnSectionMarker(line)) {
      if (getDnSectionHeaderText(line)) {
        section += 1;
        inSection = true;
      } else {
        inSection = false;
      }
      continue;
    }
    map.set(line.id, inSection ? section : null);
  }
  return map;
}

/**
 * Form-facing display numbers for section-marker DN lines, mirroring
 * buildDnSectionPlan's printed hierarchy (groups `G`, children `G.j`).
 * Non-blank markers start a section; a blank marker ends one; lines inside a
 * section are numbered `G.j`, lines outside keep the shared top-level counter.
 * With no markers this degrades to plain `1, 2, 3`, so forms can always use
 * it while grouping is on. Keep in sync with buildDnSectionPlan.
 */
export function getDnSectionDisplayNumbers<
  T extends { id: string; isSectionMarker: boolean; item_name: string },
>(lines: T[]): Map<string, string> {
  const numbers = new Map<string, string>();
  let top = 0;
  let section = 0;
  let child = 0;
  let inSection = false;
  for (const line of lines) {
    if (line.isSectionMarker) {
      if (line.item_name.trim()) {
        top += 1;
        section = top;
        child = 0;
        inSection = true;
        numbers.set(line.id, String(section));
      } else {
        inSection = false;
      }
      continue;
    }
    if (inSection) {
      child += 1;
      numbers.set(line.id, `${section}.${child}`);
    } else {
      top += 1;
      numbers.set(line.id, String(top));
    }
  }
  return numbers;
}

/**
 * Ids of non-blank section markers that have no item lines under them before
 * the next marker (or the end of the list). Such headings are dropped from the
 * printout (buildDnSectionPlan only emits non-empty runs), so forms surface a
 * warning instead of letting the heading silently vanish.
 */
export function getDnSectionMarkersWithoutChildren<
  T extends { id: string; isSectionMarker: boolean; item_name: string },
>(lines: T[]): Set<string> {
  const empty = new Set<string>();
  let currentMarkerId: string | null = null;
  let hasChild = false;
  const flush = () => {
    if (currentMarkerId && !hasChild) empty.add(currentMarkerId);
  };
  for (const line of lines) {
    if (line.isSectionMarker) {
      flush();
      currentMarkerId = line.item_name.trim() ? line.id : null;
      hasChild = false;
    } else if (currentMarkerId) {
      hasChild = true;
    }
  }
  flush();
  return empty;
}

/**
 * Form insertion helpers for section markers (insert-anywhere UX).
 * Pure index math — shared by the DN forms so both compute identical
 * insertion points. Print output is unaffected: only the order of lines in
 * the array changes, which the row plan already derives from.
 */

/** Index at which a new marker goes to sit directly above `lineId`. */
export function findInsertIndexAboveLine<T extends { id: string }>(
  lines: T[],
  lineId: string,
): number {
  const index = lines.findIndex((line) => line.id === lineId);
  return index < 0 ? lines.length : index;
}

/**
 * Index at which a new item goes to land at the end of the section led by
 * `markerId` (just before the next marker, or the end of the list).
 * Falls back to the end when the marker is unknown.
 */
export function findSectionEndIndex<
  T extends { id: string; isSectionMarker: boolean },
>(lines: T[], markerId: string): number {
  const markerIndex = lines.findIndex((line) => line.id === markerId);
  if (markerIndex < 0) return lines.length;
  let end = markerIndex + 1;
  while (end < lines.length && !lines[end].isSectionMarker) end += 1;
  return end;
}

/**
 * Count of named item lines under the section led by `markerId` (stops at
 * the next marker). Powers the section band's "N รายการ" label — unnamed
 * placeholder rows are not items yet.
 */
export function countSectionItems<
  T extends { id: string; isSectionMarker: boolean; item_name: string },
>(lines: T[], markerId: string): number {
  const markerIndex = lines.findIndex((line) => line.id === markerId);
  if (markerIndex < 0) return 0;
  let count = 0;
  for (let i = markerIndex + 1; i < lines.length && !lines[i].isSectionMarker; i += 1) {
    if (lines[i].item_name.trim()) count += 1;
  }
  return count;
}

/**
 * Legacy single-header conversion (form unification): the old whole-doc
 * `dn_so_header` field and marker lines are the same concept, so forms
 * offer only markers. When an old draft carries header text but no markers,
 * the form prepends one marker with this text and saves `dn_so_header:
 * null` — the printed single group is output-identical either way (see
 * equivalence test). Returns null when there is nothing to convert.
 */
export function getLegacyDnHeaderForConversion(
  lines: SectionMarkerLike[],
  dnSoHeader: string | null | undefined,
): string | null {
  const text = String(dnSoHeader || "").trim();
  if (!text) return null;
  if (lines.some((item) => isDnSectionMarker(item))) return null;
  return text;
}

  /**
   * Multi-section row plan for a DN carrying section markers. Marker-led
   * runs become flat "G / G.j" sections headed by the marker text (no sum
   * footer — DN amounts are usually hidden, same as buildDnSoHeaderPlan);
   * unmarked runs behave exactly like today (auto source groups or flat
   * singles, sharing one continuous top-level sequence with the sections).
   * Every non-blank section gets its header row first, even for one item.
   * With no markers this is byte-identical to planDnRows(buildDnBlocks()).
   */
export function buildDnSectionPlan(
  renderableLines: DocumentLineItem[],
  refMap: DnRefMap,
): DnRowPlanEntry[] {
  if (!renderableLines.some((item) => isDnSectionMarker(item))) {
    return planDnRows(buildDnBlocks(renderableLines, refMap));
  }
  const plan: DnRowPlanEntry[] = [];
  let top = 0;
  let segment: DocumentLineItem[] = [];
  let sectionHeader: string | null = null;
  const flush = () => {
    if (segment.length === 0) {
      sectionHeader = null;
      return;
    }
    if (sectionHeader != null) {
      top += 1;
      const g = top;
      const header: DnHeaderPayload = {
        g,
        number: "",
        issueDate: null,
        kind: undefined,
        soHeader: sectionHeader,
        subtotal: 0,
      };
      segment.forEach((item, j) => {
        plan.push({
          item,
          number: `${g}.${j + 1}`,
          header: j === 0 ? header : null,
          spacerAfter: false,
          footerAfter: null,
        });
      });
    } else {
      const blocks = buildDnBlocks(segment, refMap, top);
      plan.push(...planDnRows(blocks));
      for (const block of blocks) {
        top = Math.max(top, block.type === "group" ? block.g : block.s);
      }
    }
    segment = [];
    sectionHeader = null;
  };
  for (const item of renderableLines) {
    if (isDnSectionMarker(item)) {
      flush();
      sectionHeader = getDnSectionHeaderText(item);
      continue;
    }
    segment.push(item);
  }
  flush();
  return markGroupSpacers(plan);
}
