export type UserRole = "admin" | "client";

export type DocumentType =
  | "quotation"
  | "invoice"
  | "tax_invoice_receipt"
  | "billing_note"
  | "receipt"
  | "delivery_note"
  | "credit_note";

export type DocumentStatus =
  | "draft"
  | "sent"
  | "converted"
  | "in_billing"
  | "paid"
  | "overdue"
  | "voided"
  | "generated"
  | "issued";

export type ItemType = "product" | "service";

export type StockMovementType =
  | "manual_in"
  | "manual_out"
  | "auto_out"
  | "auto_in"
  | "return_in";

export type PaymentMethod = "cash" | "bank_transfer" | "cheque";

export type WhtRate = "0" | "1" | "2" | "3" | "5";

export type StoragePurpose = "logos" | "signatures" | "stamps" | "pdfs" | "exports" | "attachments";

export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
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
  pdf_template: "modern" | "classic";
  classic_terms: string | null;
  bank_name: string | null;
  bank_account: string | null;
  signature_url: string | null;
  stamp_url: string | null;
  dev_mode_enabled: boolean;
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
  is_active: boolean;
  is_favorite: boolean;
  avatar_initials: string | null;
  avatar_color: string | null;
  credit_term_days: number | null;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
  customer?: Customer;
  deal?: Deal;
  line_items?: DocumentLineItem[];
  billing_invoices?: BillingNoteInvoice[];
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
  line_total: number;
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
