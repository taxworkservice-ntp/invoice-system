import ExcelJS from "exceljs";
import { buildCsvBlob } from "./download";

export interface SalesTaxRow {
  date: string;
  docNumber: string;
  customerName: string;
  customerTaxId: string;
  subtotal: number;
  vatAmount: number;
  total: number;
}

/** WHT we withhold from vendors/contractors (what we file on ภ.ง.ด.3/53). */
export interface WhtPayableRow {
  date: string;
  certificateNo: string;
  vendorName: string;
  vendorTaxId: string;
  /** Raw form type: "pnd3" | "pnd53" | other. */
  formType: string;
  amount: number;
  whtRate: number;
  whtAmount: number;
}

export interface TaxPackInput {
  periodLabel: string;
  sales: SalesTaxRow[];
  inputVat: number;
  inputVatNote?: string;
  whtRows: WhtPayableRow[];
}

const PND_FORM_LABELS: Record<string, string> = {
  pnd3: "ภ.ง.ด.3",
  pnd53: "ภ.ง.ด.53",
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF378ADD" },
};

function styleHeader(row: ExcelJS.Row, columns: number) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > columns) return;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function setColumns(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.columns = widths.map((width) => ({ width }));
}

/**
 * One workbook with the three attachments a Thai SME needs for a filing month:
 * รายงานภาษีขาย · ภ.พ.30 worksheet (output − manual input VAT) · ภ.ง.ด.3/53.
 */
export async function buildTaxPackXlsx(input: TaxPackInput): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "invoice-system";
  wb.created = new Date();

  const outputVat = input.sales.reduce((sum, row) => sum + row.vatAmount, 0);
  const salesBase = input.sales.reduce((sum, row) => sum + row.subtotal, 0);
  const netPayable = outputVat - input.inputVat;

  // --- รายงานภาษีขาย ---
  const salesSheet = wb.addWorksheet("รายงานภาษีขาย");
  setColumns(salesSheet, [6, 12, 22, 30, 18, 15, 15, 15]);
  salesSheet.mergeCells("A1:H1");
  salesSheet.getCell("A1").value = `รายงานภาษีขาย — ${input.periodLabel}`;
  salesSheet.getCell("A1").font = { bold: true, size: 12 };
  salesSheet.addRow([]);
  const salesHeader = salesSheet.addRow(["ลำดับ", "วันที่", "เลขที่เอกสาร", "ลูกค้า", "เลขผู้เสียภาษี", "มูลค่าก่อน VAT", "ภาษีมูลค่าเพิ่ม", "รวมทั้งสิ้น"]);
  styleHeader(salesHeader, 8);
  input.sales.forEach((row, index) => {
    salesSheet.addRow([index + 1, row.date, row.docNumber, row.customerName, row.customerTaxId, row.subtotal, row.vatAmount, row.total]);
  });
  const salesTotal = salesSheet.addRow(["", "", "", "", "รวม", salesBase, outputVat, salesBase + outputVat]);
  salesTotal.font = { bold: true };

  // --- ภ.พ.30 worksheet ---
  const pp30 = wb.addWorksheet("ภ.พ.30");
  setColumns(pp30, [50, 18]);
  pp30.mergeCells("A1:B1");
  pp30.getCell("A1").value = `แบบ ภ.พ.30 (ใบกำกับภาษี) — ${input.periodLabel}`;
  pp30.getCell("A1").font = { bold: true, size: 12 };
  pp30.addRow([]);
  styleHeader(pp30.addRow(["รายการ", "จำนวนเงิน (บาท)"]), 2);
  pp30.addRow(["ยอดขายในเดือน (ฐานภาษี)", salesBase]);
  pp30.addRow(["(1) ภาษีขาย", outputVat]);
  pp30.addRow(["(2) ภาษีซื้อ (กรอกด้วยตนเอง)", input.inputVat]);
  const netRow = pp30.addRow(["(3) ภาษีที่ต้องชำระ / ชำระเกิน (1 − 2)", netPayable]);
  netRow.font = { bold: true };
  if (input.inputVatNote) pp30.addRow(["หมายเหตุภาษีซื้อ", input.inputVatNote]);
  pp30.addRow([]);
  pp30.addRow(["หมายเหตุ", "ระบบไม่มีบัญชีภาษีซื้อ — กรุณากรอกภาษีซื้อจากใบกำกับภาษีซื้อด้วยตนเอง"]);

  // --- ภ.ง.ด.3/53 ---
  const whtSheet = wb.addWorksheet("ภ.ง.ด.3-53");
  setColumns(whtSheet, [6, 12, 20, 30, 18, 12, 15, 10, 15]);
  whtSheet.mergeCells("A1:I1");
  whtSheet.getCell("A1").value = `ภาษีหัก ณ ที่จ่ายที่นำส่ง — ${input.periodLabel}`;
  whtSheet.getCell("A1").font = { bold: true, size: 12 };
  whtSheet.addRow([]);
  styleHeader(whtSheet.addRow(["ลำดับ", "วันที่", "เลขที่ใบรับรอง", "ผู้ถูกหักเงิน", "เลขผู้เสียภาษี", "แบบ", "ยอดจ่าย", "อัตรา %", "ภาษีหัก ณ ที่จ่าย"]), 9);
  input.whtRows.forEach((row, index) => {
    whtSheet.addRow([
      index + 1,
      row.date,
      row.certificateNo,
      row.vendorName,
      row.vendorTaxId,
      PND_FORM_LABELS[row.formType] ?? row.formType,
      row.amount,
      row.whtRate,
      row.whtAmount,
    ]);
  });
  const whtTotal = whtSheet.addRow(["", "", "", "", "", "รวม", input.whtRows.reduce((s, r) => s + r.amount, 0), "", input.whtRows.reduce((s, r) => s + r.whtAmount, 0)]);
  whtTotal.font = { bold: true };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function salesTaxCsvBlob(sales: readonly SalesTaxRow[]): Blob {
  return buildCsvBlob(
    ["ลำดับ", "วันที่", "เลขที่เอกสาร", "ลูกค้า", "เลขผู้เสียภาษี", "มูลค่าก่อน VAT", "ภาษีมูลค่าเพิ่ม", "รวมทั้งสิ้น"],
    sales.map((row, index) => [index + 1, row.date, row.docNumber, row.customerName, row.customerTaxId, row.subtotal, row.vatAmount, row.total]),
  );
}

export function pp30CsvBlob(input: Pick<TaxPackInput, "sales" | "inputVat" | "periodLabel">): Blob {
  const outputVat = input.sales.reduce((sum, row) => sum + row.vatAmount, 0);
  const salesBase = input.sales.reduce((sum, row) => sum + row.subtotal, 0);
  return buildCsvBlob(
    ["รายการ", "จำนวนเงิน (บาท)"],
    [
      ["รอบ", input.periodLabel],
      ["ยอดขายในเดือน (ฐานภาษี)", salesBase],
      ["(1) ภาษีขาย", outputVat],
      ["(2) ภาษีซื้อ (กรอกด้วยตนเอง)", input.inputVat],
      ["(3) ภาษีที่ต้องชำระ / ชำระเกิน (1 − 2)", outputVat - input.inputVat],
    ],
  );
}

export function whtPayableCsvBlob(rows: readonly WhtPayableRow[]): Blob {
  return buildCsvBlob(
    ["ลำดับ", "วันที่", "เลขที่ใบรับรอง", "ผู้ถูกหักเงิน", "เลขผู้เสียภาษี", "แบบ", "ยอดจ่าย", "อัตรา %", "ภาษีหัก ณ ที่จ่าย"],
    rows.map((row, index) => [
      index + 1,
      row.date,
      row.certificateNo,
      row.vendorName,
      row.vendorTaxId,
      PND_FORM_LABELS[row.formType] ?? row.formType,
      row.amount,
      row.whtRate,
      row.whtAmount,
    ]),
  );
}
