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
  stock_deduct_trigger: string;
  pdf_template: string;
  bank_name: string | null;
  bank_account: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  item_type: ItemType;
  unit_price: number;
  base_unit: string;
  carton_unit: string | null;
  qty_per_carton: number | null;
  stock_count: number;
  low_stock_threshold: number;
  is_active: boolean;
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
  reason: string | null;
  document_id: string | null;
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
}

export interface DocumentLineItem {
  id: string;
  document_id: string;
  user_id: string;
  item_id: string | null;
  item_name: string;
  item_type: ItemType;
  unit: string;
  unit_price: number;
  quantity: number;
  discount_percent: number;
  discount_amount: number;
  qty_carton: number | null;
  carton_unit: string | null;
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
