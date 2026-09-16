import { buildCsvBlob } from "./download";
import type { Transaction } from "../../hooks/useReports";
import type { Item } from "../../types";
import { DOC_TYPE_LABELS } from "../../constants";

export interface DocumentCsvRow {
  doc_number: string | null;
  doc_type: string;
  status: string;
  customer_name?: string | null;
  issue_date: string | null;
  due_date?: string | null;
  subtotal?: number | null;
  vat_amount?: number | null;
  wht_amount?: number | null;
  total_amount?: number | null;
  net_payable?: number | null;
  paid_at?: string | null;
}

function docTypeLabel(type: string): string {
  return DOC_TYPE_LABELS[type as keyof typeof DOC_TYPE_LABELS]?.th ?? type;
}

/** One row per document — mirrors the Documents page CSV. */
export function documentsCsvBlob(docs: readonly DocumentCsvRow[]): Blob {
  return buildCsvBlob(
    ["เลขที่เอกสาร", "ประเภท", "สถานะ", "ลูกค้า", "วันที่ออก", "วันครบกำหนด", "ก่อน VAT", "VAT", "หัก ณ ที่จ่าย", "ยอดรวม", "ยอดสุทธิ", "ชำระเมื่อ"],
    docs.map((doc) => [
      doc.doc_number ?? "",
      docTypeLabel(doc.doc_type),
      doc.status,
      doc.customer_name ?? "",
      doc.issue_date ?? "",
      doc.due_date ?? "",
      doc.subtotal ?? "",
      doc.vat_amount ?? "",
      doc.wht_amount ?? "",
      doc.total_amount ?? "",
      doc.net_payable ?? "",
      doc.paid_at ?? "",
    ]),
  );
}

/** Financial report — primary table (transactions). */
export function financialTransactionsCsvBlob(transactions: readonly Transaction[]): Blob {
  return buildCsvBlob(
    ["วันที่", "เลขที่เอกสาร", "ประเภท", "ลูกค้า", "เลขผู้เสียภาษี", "ก่อน VAT", "VAT", "ยอดรวม", "หัก ณ ที่จ่าย", "อัตรา WHT", "เลขที่ใบหัก", "ยอดสุทธิ", "สถานะ", "ชำระเมื่อ"],
    transactions.map((t) => [
      t.date,
      t.doc_number,
      t.doc_type,
      t.customer_name,
      t.customer_tax_id ?? "",
      t.subtotal,
      t.vat_amount,
      t.total_amount,
      t.wht_amount,
      t.wht_rate ?? "",
      t.wht_certificate_no ?? "",
      t.net_payable,
      t.status,
      t.paid_at ?? "",
    ]),
  );
}

/** Stock report — primary table (valuation). */
export function stockValuationCsvBlob(valuation: readonly Item[]): Blob {
  return buildCsvBlob(
    ["รหัส", "สินค้า", "หน่วย", "คงเหลือ", "ต้นทุนเฉลี่ย", "มูลค่าคงเหลือ", "จุดแจ้งเตือน"],
    valuation.map((item) => [
      item.sku ?? "",
      item.name,
      item.base_unit ?? "ชิ้น",
      item.stock_count ?? 0,
      item.avg_cost ?? 0,
      item.stock_value ?? 0,
      item.low_stock_threshold ?? "",
    ]),
  );
}
