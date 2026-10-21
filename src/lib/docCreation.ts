import type { DocumentType } from "../types";

/**
 * Single source of truth for "which screen creates which document".
 *
 * Before this module the same decision was re-implemented in four places
 * (home, customer page, documents/new, deals/new) with different special
 * cases — which is how `/deals/new?type=invoice_from_delivery_notes` ended up
 * rendering a form that could never save (that value is not a DB enum).
 *
 * Rules:
 *  - `type` is a *creation mode*, not always a `DocumentType`
 *    (`utility_bill` is a mode over `invoice`).
 *  - Everything unknown is invalid — never passed through to a form.
 *  - Permission refusal happens here, at the entrance, not at save time.
 */

export const CREATION_TYPES = [
  "quotation",
  "invoice",
  "utility_bill",
  "delivery_note",
  "billing_note",
  "invoice_from_quotation",
  "invoice_from_delivery_notes",
  "delivery_note_from_quotation",
  "credit_note",
  "debit_note",
] as const;

export type CreationType = (typeof CREATION_TYPES)[number];

/** Which screen hosts the creation. */
export type CreationForm =
  | "deal"
  | "billing_note"
  | "credit_note"
  | "invoice_from_quotation"
  | "invoice_from_delivery_notes"
  | "delivery_note_from_quotation";

/** Types the shared deal form (`/deals/new`) can host. */
const DEAL_FORM_TYPES: readonly CreationType[] = [
  "quotation",
  "invoice",
  "utility_bill",
  "delivery_note",
];

/**
 * Officer (simple mode) allow-list. This mirrors the rule that used to live
 * only inside `deals/new`'s save handler and `documents/new`'s render guard.
 */
const SIMPLE_MODE_TYPES: readonly CreationType[] = [
  "quotation",
  "delivery_note",
  "delivery_note_from_quotation",
];

const FORM_BY_TYPE: Record<CreationType, CreationForm> = {
  quotation: "deal",
  invoice: "deal",
  utility_bill: "deal",
  delivery_note: "deal",
  billing_note: "billing_note",
  credit_note: "credit_note",
  debit_note: "credit_note",
  invoice_from_quotation: "invoice_from_quotation",
  invoice_from_delivery_notes: "invoice_from_delivery_notes",
  delivery_note_from_quotation: "delivery_note_from_quotation",
};

/** What actually gets stored in `documents.doc_type`. */
const DOC_TYPE_BY_TYPE: Record<CreationType, DocumentType> = {
  quotation: "quotation",
  invoice: "invoice",
  utility_bill: "invoice",
  delivery_note: "delivery_note",
  billing_note: "billing_note",
  credit_note: "credit_note",
  debit_note: "debit_note",
  invoice_from_quotation: "invoice",
  invoice_from_delivery_notes: "invoice",
  delivery_note_from_quotation: "delivery_note",
};

/** Params each destination actually reads — nothing else is carried across. */
const CARRIED_PARAMS: Record<CreationForm, readonly string[]> = {
  deal: ["dealId", "customer_id", "documentId", "mode"],
  billing_note: ["dealId", "documentId", "customer_id"],
  credit_note: ["dealId", "documentId"],
  invoice_from_quotation: ["quotationId", "documentId"],
  invoice_from_delivery_notes: ["dnId", "dnIds", "documentId"],
  delivery_note_from_quotation: ["quotationId", "documentId"],
};

export interface CreationExperience {
  isSimpleMode: boolean;
  canShowAdvancedDealOptions: boolean;
}

/** Either the live URL query or a plain object from a component. */
export type CreationParams = URLSearchParams | Record<string, string | null | undefined>;

function readParam(params: CreationParams | undefined, key: string): string | null {
  if (!params) return null;
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  return value == null || value === "" ? null : value;
}

export type CreationResolution =
  | {
      status: "ok";
      type: CreationType;
      form: CreationForm;
      /** Value stored in `documents.doc_type` (never a UI-only mode). */
      docType: DocumentType;
      /** Full destination, query string included. */
      path: string;
    }
  | { status: "denied"; reason: string }
  | { status: "invalid"; reason: string };

export function isCreationType(value: unknown): value is CreationType {
  return typeof value === "string" && (CREATION_TYPES as readonly string[]).includes(value);
}

/** `null` when the type cannot be created by a form at all. */
export function formForCreationType(value: unknown): CreationForm | null {
  return isCreationType(value) ? FORM_BY_TYPE[value] : null;
}

function basePathFor(form: CreationForm): string {
  return form === "deal" ? "/deals/new" : "/documents/new";
}

function carriedParams(form: CreationForm, params?: CreationParams): URLSearchParams {
  const next = new URLSearchParams();
  if (!params) return next;
  for (const key of CARRIED_PARAMS[form]) {
    const value = readParam(params, key);
    if (value) next.set(key, value);
  }
  return next;
}

/** Build the destination for a valid type; `null` when the type is unknown. */
export function creationPath(
  type: unknown,
  params?: CreationParams,
): string | null {
  if (!isCreationType(type)) return null;
  const form = FORM_BY_TYPE[type];
  // `type` first: one canonical, readable URL shape regardless of entry point.
  const query = new URLSearchParams({ type });
  carriedParams(form, params).forEach((value, key) => query.set(key, value));
  return `${basePathFor(form)}?${query.toString()}`;
}

export function resolveCreation({
  type,
  params,
  experience,
}: {
  type: unknown;
  params?: CreationParams;
  experience: CreationExperience;
}): CreationResolution {
  if (!isCreationType(type)) {
    return { status: "invalid", reason: "ไม่พบประเภทเอกสารนี้" };
  }

  // Delivery notes from a quotation are the officer-facing path: they need
  // the source quotation, and they are allowed in simple mode.
  if (type === "delivery_note_from_quotation" && !readParam(params, "quotationId")) {
    return { status: "invalid", reason: "ต้องระบุใบเสนอราคาต้นทาง" };
  }

  if (
    experience.isSimpleMode &&
    !experience.canShowAdvancedDealOptions &&
    !SIMPLE_MODE_TYPES.includes(type)
  ) {
    return { status: "denied", reason: "งานประเภทนี้ต้องให้ผู้จัดการเป็นผู้จัดทำ" };
  }

  const path = creationPath(type, params);
  if (!path) return { status: "invalid", reason: "ไม่พบประเภทเอกสารนี้" };

  return {
    status: "ok",
    type,
    form: FORM_BY_TYPE[type],
    docType: DOC_TYPE_BY_TYPE[type],
    path,
  };
}

/** Deal-form types only — used by `deals/new` to reject anything else. */
export function isDealFormType(value: unknown): boolean {
  return isCreationType(value) && DEAL_FORM_TYPES.includes(value);
}
