export type UserRole = "admin" | "client";
export type ClientMemberRole = "owner" | "manager" | "officer";
export type ClientMemberStatus = "active" | "disabled";

export type DocumentType =
  | "quotation"
  | "invoice"
  | "tax_invoice_receipt"
  | "billing_note"
  | "receipt"
  | "delivery_note"
  | "credit_note"
  // Requires sql/20260824_credit_note_guards_and_debit_note.sql to be applied
  // (extends the DB document_type enum) before creating debit notes.
  | "debit_note";

export type DocumentStatus =
  | "draft"
  | "sent"
  | "converted"
  | "in_billing"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "voided"
  | "generated"
  | "issued";

export type ItemType = "product" | "service";
export type JobDetailPresetField = string;
export type JobDetailFieldType = "text" | "dimension";
export type ClientFeatureKey = "service_job_details" | "classic_v2_template";

export type StockMovementType =
  "manual_in" | "manual_out" | "auto_out" | "auto_in" | "return_in";

export type PaymentMethod = "cash" | "bank_transfer" | "cheque";

export type WhtRate = "0" | "1" | "2" | "3" | "5";

export type StoragePurpose =
  "logos" | "signatures" | "stamps" | "pdfs" | "exports" | "attachments";

export type WhtFormType =
  | "pnd1"
  | "pnd1_special"
  | "pnd2"
  | "pnd3"
  | "pnd2a"
  | "pnd3a"
  | "pnd53";

export interface Profile {
  id: string;
  auth_user_id?: string;
  role: UserRole;
  workspace_role?: ClientMemberRole | null;
  workspace_user_id?: string | null;
  workspace_permissions?: Partial<Record<string, boolean>> | null;
  created_at: string;
}

export interface ClientMember {
  id: string;
  workspace_user_id: string;
  member_user_id: string;
  role: ClientMemberRole;
  status: ClientMemberStatus;
  permissions: Partial<Record<string, boolean>> | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  user_id: string;
  bank_name: string;
  account_number: string;
  account_holder_name: string | null;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  company_name_th: string;
  company_name_en: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  contact_name: string | null;
  logo_url: string | null;
  logo_size: string | null;
  vat_registered: boolean;
  vat_rate: number;
  default_wht_rate: WhtRate;
  credit_term_days: number;
  stock_deduct_trigger: string;
  pdf_template: "modern" | "classic" | "classic_v2";
  classic_terms: string | null;
  bank_name: string | null;
  bank_account: string | null;
  signature_url: string | null;
  stamp_url: string | null;
  signature_scale?: string | null;
  stamp_scale?: string | null;
  show_signature_on_wht: boolean;
  show_stamp_on_wht: boolean;
  show_signature_on_docs?: Record<string, boolean> | null;
  show_stamp_on_docs?: Record<string, boolean> | null;
  delivery_note_show_full_totals?: boolean;
  show_logo: boolean;
  show_company_name: boolean;
  dev_mode_enabled: boolean;
  dev_effective_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientFeature {
  id: string;
  user_id: string;
  feature_key: ClientFeatureKey;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  user_id: string;
  new_deal_favorites: string[];
  created_at: string;
  updated_at: string;
}

export interface DocNumberSequence {
  id: string;
  user_id: string;
  doc_type: DocumentType;
  prefix: string;
  reset_yearly: boolean;
  last_year: number | null;
  last_month: number | null;
  last_sequence: number;
  start_sequence: number;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  code: string | null;
  is_active: boolean;
  is_favorite: boolean;
  avatar_initials: string | null;
  avatar_color: string | null;
  credit_term_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface WhtVendor {
  id: string;
  user_id: string;
  name: string;
  vendor_type: "company" | "individual";
  tax_id: string | null;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WhtStatus = "active" | "done";

export interface WhtRecord {
  id: string;
  user_id: string;
  vendor_id: string;
  form_type: WhtFormType;
  issue_date: string;
  amount: number;
  wht_rate: number;
  wht_amount: number;
  certificate_no: string | null;
  certificate_generated_at: string | null;
  description: string | null;
  note: string | null;
  status: WhtStatus;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  sku: string | null;
  item_type: ItemType;
  unit_price: number;
  has_job_details: boolean;
  base_unit: string;
  carton_unit: string | null;
  qty_per_carton: number | null;
  stock_count: number;
  avg_cost: number;
  stock_value: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemJobDetailPreset {
  id: string;
  user_id: string;
  item_id: string;
  field_key: JobDetailPresetField;
  value: string;
  sort_order: number;
  created_at: string;
}

export interface ItemJobDetailField {
  id: string;
  user_id: string;
  item_id: string;
  field_key: JobDetailPresetField;
  label: string;
  field_type: JobDetailFieldType;
  sort_order: number;
  is_enabled: boolean;
  is_custom: boolean;
  default_unit: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  item_id: string;
  user_id: string;
  movement_type: StockMovementType;
  qty_base: number;
  qty_carton: number | null;
  carton_unit: string | null;
  balance_after: number;
  unit_cost: number | null;
  movement_value: number | null;
  balance_value_after: number | null;
  reason: string | null;
  document_id: string | null;
  parent_movement_id: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  user_id: string;
  customer_id: string;
  title: string | null;
  deal_number: string | null;
  manual_stage?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  notes?: {
    content: string;
    user_id: string;
    author_name: string;
    author_role: string;
    created_at: string;
  }[];
}

export interface Document {
  id: string;
  user_id: string;
  deal_id: string | null;
  customer_id: string;
  doc_type: DocumentType;
  doc_number: string | null;
  status: DocumentStatus;
  issue_date: string;
  due_date: string | null;
  vat_registered: boolean;
  vat_rate: number;
  wht_rate: number;
  discount_percent: number;
  discount_amount: number;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  wht_amount: number;
  net_payable: number;
  note: string | null;
  payment_method: PaymentMethod | null;
  bank_account_id: string | null;
  wht_certificate_no: string | null;
  paid_at: string | null;
  amount_received: number | null;
  backdated_at: string | null;
  backdated_by_user_id: string | null;
  backdated_reason: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  copied_from_id: string | null;
  converted_from_id: string | null;
  hide_amounts_on_print?: boolean;
  is_blank_form?: boolean;
  show_full_totals?: boolean;
  show_dn_variance?: boolean;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  deal?: Deal;
  line_items?: DocumentLineItem[];
  billing_invoices?: BillingNoteInvoice[];
  receipt_invoices?: ReceiptInvoice[];
  invoice_delivery_notes?: InvoiceDeliveryNote[];
}

export interface StorageFile {
  id: string;
  user_id: string;
  document_id: string | null;
  r2_key: string;
  purpose: StoragePurpose;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentLineItem {
  id: string;
  document_id: string;
  user_id: string;
  item_id: string | null;
  item_name: string;
  line_note: string | null;
  item_sku: string | null;
  item_type: ItemType;
  unit: string;
  unit_price: number;
  quantity: number;
  base_quantity: number | null;
  discount_percent: number;
  discount_amount: number;
  qty_carton: number | null;
  carton_unit: string | null;
  source_document_id: string | null;
  source_line_item_id: string | null;
  source_delivered_qty: number | null;
  source_unit_price: number | null;
  line_total: number;
  hide_amounts_on_print: boolean;
  sort_order: number;
  created_at: string;
}

export interface BillingNoteInvoice {
  id: string;
  billing_note_id: string;
  invoice_id: string;
  user_id: string;
  invoice_number: string;
  issue_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  created_at: string;
}

export interface ReceiptInvoice {
  id: string;
  receipt_id: string;
  invoice_id: string;
  source_billing_note_id: string | null;
  user_id: string;
  invoice_number: string;
  issue_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  created_at: string;
}

export interface InvoiceDeliveryNote {
  id: string;
  invoice_id: string;
  delivery_note_id: string;
  user_id: string;
  delivery_note_number: string;
  issue_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  released_at: string | null;
  created_at: string;
}

export interface DealNote {
  id: string;
  deal_id: string;
  user_id: string;
  author_name: string;
  author_role: "owner" | "manager" | "officer";
  content: string;
  created_at: string;
}

export interface TaxResult {
  grossSubtotal: number;
  lineDiscountAmount: number;
  subtotalBeforeDiscount: number;
  discountAmount: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  whtAmount: number;
  netPayable: number;
}

export interface DealCardData {
  deal_id: string;
  customer_name: string;
  item_summary: string;
  amount: number;
  status: DocumentStatus;
  stage: "quote" | "invoice" | "collect" | "done";
  doc_type: DocumentType;
  document_id: string;
  doc_number: string | null;
  updated_at: string;
}

export interface SummaryMetrics {
  unpaid: number;
  receivedThisMonth: number;
  overdue: number;
}
