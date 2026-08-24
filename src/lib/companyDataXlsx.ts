import ExcelJS from "exceljs";
import { DOC_TYPE_LABELS } from "../constants";
import type {
  BillingNoteInvoice,
  ClientProfile,
  Customer,
  Deal,
  Document,
  DocumentLineItem,
  Item,
  StockMovement,
} from "../types";

interface CompanyDataExport {
  profile: ClientProfile | null;
  customers: Customer[];
  items: Item[];
  deals: Deal[];
  documents: Document[];
  lineItems: DocumentLineItem[];
  billingLinks: BillingNoteInvoice[];
  stockMovements: StockMovement[];
}

const BLUE = "FF378ADD";
const BORDER = { style: "thin" as const, color: { argb: "FFE8E6DF" } };

function addSheet<T extends object>(workbook: ExcelJS.Workbook, name: string, columns: { key: keyof T; header: string; width: number }[], rows: T[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((column) => ({ key: String(column.key), header: column.header, width: column.width }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(1).eachCell((cell) => { cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }; });
  rows.forEach((row) => sheet.addRow(row));
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + Math.min(columns.length, 26))}1` };
  return sheet;
}

export async function buildCompanyDataWorkbook(data: CompanyDataExport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Invoice System";
  workbook.created = new Date();

  addSheet(workbook, "ข้อมูลบริษัท", [
    { key: "field", header: "ข้อมูล", width: 28 },
    { key: "value", header: "ค่า", width: 48 },
  ], [
    { field: "ชื่อบริษัท", value: data.profile?.company_name_th || "" },
    { field: "ชื่อบริษัท (อังกฤษ)", value: data.profile?.company_name_en || "" },
    { field: "เลขผู้เสียภาษี", value: data.profile?.tax_id || "" },
    { field: "ที่อยู่", value: data.profile?.address || "" },
    { field: "โทรศัพท์", value: data.profile?.phone || "" },
    { field: "ผู้ติดต่อ", value: data.profile?.contact_name || "" },
    { field: "จด VAT", value: data.profile?.vat_registered ? "ใช่" : "ไม่ใช่" },
    { field: "วันที่ส่งออก", value: new Date().toISOString() },
  ]);

  addSheet(workbook, "ลูกค้า", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "code", header: "รหัสลูกค้า", width: 16 },
    { key: "name", header: "ชื่อลูกค้า", width: 30 }, { key: "tax_id", header: "เลขผู้เสียภาษี", width: 20 },
    { key: "contact_name", header: "ผู้ติดต่อ", width: 22 }, { key: "phone", header: "โทรศัพท์", width: 18 },
    { key: "email", header: "อีเมล", width: 28 }, { key: "address", header: "ที่อยู่", width: 45 },
    { key: "is_active", header: "ใช้งาน", width: 12 }, { key: "created_at", header: "สร้างเมื่อ", width: 24 },
  ], data.customers.map((row) => ({ ...row, is_active: row.is_active ? "ใช่" : "ไม่ใช่" })));

  addSheet(workbook, "สินค้าและบริการ", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "sku", header: "SKU", width: 18 },
    { key: "name", header: "ชื่อสินค้า/บริการ", width: 32 }, { key: "item_type", header: "ประเภท", width: 16 },
    { key: "unit_price", header: "ราคาต่อหน่วย", width: 16 }, { key: "base_unit", header: "หน่วย", width: 14 },
    { key: "stock_count", header: "สต็อกคงเหลือ", width: 16 }, { key: "avg_cost", header: "ต้นทุนเฉลี่ย", width: 16 },
    { key: "is_active", header: "ใช้งาน", width: 12 },
  ], data.items.map((row) => ({ ...row, is_active: row.is_active ? "ใช่" : "ไม่ใช่" })));

  addSheet(workbook, "งานขาย", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "deal_number", header: "เลขที่งานขาย", width: 18 },
    { key: "customer_id", header: "รหัสลูกค้า", width: 38 }, { key: "title", header: "ชื่องาน", width: 32 },
    { key: "is_active", header: "ยังดำเนินการ", width: 16 }, { key: "created_at", header: "สร้างเมื่อ", width: 24 },
    { key: "updated_at", header: "แก้ไขล่าสุด", width: 24 },
  ], data.deals.map((row) => ({ ...row, is_active: row.is_active ? "ใช่" : "ไม่ใช่" })));

  addSheet(workbook, "เอกสาร", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "deal_id", header: "รหัสงานขาย", width: 38 },
    { key: "customer_id", header: "รหัสลูกค้า", width: 38 }, { key: "doc_type", header: "ประเภทเอกสาร", width: 20 },
    { key: "doc_number", header: "เลขที่เอกสาร", width: 20 }, { key: "status", header: "สถานะ", width: 16 },
    { key: "issue_date", header: "วันที่เอกสาร", width: 16 }, { key: "due_date", header: "ครบกำหนด", width: 16 },
    { key: "subtotal", header: "ก่อน VAT", width: 16 }, { key: "vat_amount", header: "VAT", width: 16 },
    { key: "total_amount", header: "รวมทั้งสิ้น", width: 16 }, { key: "wht_amount", header: "หัก ณ ที่จ่าย", width: 16 },
    { key: "net_payable", header: "ยอดสุทธิ", width: 16 }, { key: "amount_received", header: "รับแล้ว", width: 16 },
    { key: "payment_method", header: "วิธีรับเงิน", width: 18 }, { key: "paid_at", header: "รับเงินเมื่อ", width: 24 },
    { key: "note", header: "หมายเหตุ", width: 40 },
  ], data.documents.map((row) => ({
    ...row,
    doc_type: DOC_TYPE_LABELS[row.doc_type]?.th || row.doc_type,
  })));

  addSheet(workbook, "รายการเอกสาร", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "document_id", header: "รหัสเอกสาร", width: 38 },
    { key: "item_id", header: "รหัสสินค้า", width: 38 }, { key: "item_name", header: "รายการ", width: 32 },
    { key: "item_sku", header: "SKU", width: 18 }, { key: "item_type", header: "ประเภท", width: 16 },
    { key: "unit", header: "หน่วย", width: 14 }, { key: "quantity", header: "จำนวน", width: 14 },
    { key: "unit_price", header: "ราคาต่อหน่วย", width: 16 }, { key: "discount_amount", header: "ส่วนลด", width: 16 },
    { key: "line_total", header: "รวมรายการ", width: 16 }, { key: "line_note", header: "หมายเหตุรายการ", width: 40 },
    { key: "hide_amounts_on_print", header: "ซ่อนราคาในเอกสาร", width: 20 },
  ], data.lineItems);

  addSheet(workbook, "ใบวางบิลที่เชื่อมโยง", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "billing_note_id", header: "รหัสใบวางบิล", width: 38 },
    { key: "invoice_id", header: "รหัสใบแจ้งหนี้", width: 38 }, { key: "invoice_number", header: "เลขที่ใบแจ้งหนี้", width: 22 },
    { key: "issue_date", header: "วันที่ใบแจ้งหนี้", width: 18 }, { key: "subtotal", header: "ก่อน VAT", width: 16 },
    { key: "vat_amount", header: "VAT", width: 16 }, { key: "total_amount", header: "รวมทั้งสิ้น", width: 16 },
  ], data.billingLinks);

  addSheet(workbook, "สต็อกเคลื่อนไหว", [
    { key: "id", header: "รหัสระบบ", width: 38 }, { key: "item_id", header: "รหัสสินค้า", width: 38 },
    { key: "movement_type", header: "ประเภทการเคลื่อนไหว", width: 24 }, { key: "qty_base", header: "จำนวนหน่วยหลัก", width: 18 },
    { key: "qty_carton", header: "จำนวนลัง", width: 16 }, { key: "balance_after", header: "คงเหลือหลังรายการ", width: 20 },
    { key: "unit_cost", header: "ต้นทุนต่อหน่วย", width: 18 }, { key: "movement_value", header: "มูลค่า", width: 16 },
    { key: "reason", header: "เหตุผล", width: 40 }, { key: "document_id", header: "รหัสเอกสาร", width: 38 },
    { key: "created_at", header: "วันที่ทำรายการ", width: 24 },
  ], data.stockMovements);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
