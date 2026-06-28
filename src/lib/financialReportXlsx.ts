import ExcelJS from "exceljs";
import type { FinancialSummary, ARByCustomer, Transaction } from "../hooks/useReports";
import { formatCurrency } from "./format";

// ============ Styling ============

const BRAND_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF378ADD" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FB" } };
const RED_TEXT = "FFC0392B";
const GREEN_TEXT = "FF1E5A38";
const CURRENCY_FMT = "#,##0.00";
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE8E6DF" } },
  left: { style: "thin", color: { argb: "FFE8E6DF" } },
  bottom: { style: "thin", color: { argb: "FFE8E6DF" } },
  right: { style: "thin", color: { argb: "FFE8E6DF" } },
};

function applyHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.fill = BRAND_FILL;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = THIN_BORDER;
}

function applyTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 16, color: { argb: "FF1A1A18" } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applySubtitle(cell: ExcelJS.Cell) {
  cell.font = { size: 11, color: { argb: "FF6B6B6B" } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applyBody(cell: ExcelJS.Cell, opts: { bold?: boolean; right?: boolean; color?: string } = {}) {
  cell.font = { size: 10, color: { argb: opts.color ?? "FF1A1A18" }, bold: opts.bold ?? false };
  cell.alignment = { vertical: "middle", horizontal: opts.right ? "right" : "left", wrapText: true };
  cell.border = THIN_BORDER;
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.columns = widths.map((w) => ({ width: w }));
}

function applyPageSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}

function buildSummarySheet(wb: ExcelJS.Workbook, opts: BuildOpts) {
  const ws = wb.addWorksheet("รายงานสรุป");
  const { summary, cogs, collectionRate, dateFrom } = opts;

  ws.mergeCells("A1:B1");
  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "รายงานการเงิน";

  ws.mergeCells("A2:B2");
  applySubtitle(ws.getCell("A2"));
  ws.getCell("A2").value = `ประจำเดือน ${dateFrom}`;

  const items: [string, string][] = [
    ["รายได้รวม", formatCurrency(summary?.revenue ?? 0)],
    ["กำไรสุทธิ", formatCurrency((summary?.revenue ?? 0) - cogs)],
    ["เก็บแล้ว", formatCurrency(summary?.collected ?? 0)],
    ["ค้างชำระ", formatCurrency(summary?.outstanding ?? 0)],
    ["VAT ที่เก็บ", formatCurrency(summary?.vatCollected ?? 0)],
    ["จำนวนเอกสาร", String(summary?.docCount ?? 0)],
    ["ต้นทุนขาย (COGS)", formatCurrency(cogs)],
    ["อัตราการเก็บเงิน", `${(collectionRate * 100).toFixed(1)}%`],
  ];

  let row = 4;
  for (const [label, value] of items) {
    applyBody(ws.getCell(`A${row}`), { bold: true });
    ws.getCell(`A${row}`).value = label;
    applyBody(ws.getCell(`B${row}`), { right: true });
    ws.getCell(`B${row}`).value = value;
    row++;
  }

  setColumnWidths(ws, [22, 18]);
  return ws;
}

function buildTransactionsSheet(wb: ExcelJS.Workbook, opts: BuildOpts) {
  const ws = wb.addWorksheet("รายการธุรกรรม");
  const { transactions } = opts;

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "รายการธุรกรรม";

  const headers = ["วันที่", "เลขที่", "ประเภท", "ลูกค้า", "ก่อน VAT", "VAT", "ยอดรวม", "WHT", "ยอดสุทธิ", "สถานะ"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  let totals = { subtotal: 0, vat: 0, total: 0, wht: 0, net: 0 };
  for (const t of transactions) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = t.date || "-";
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = t.doc_number;
    applyBody(ws.getCell(row, 3));
    ws.getCell(row, 3).value = t.doc_type;
    applyBody(ws.getCell(row, 4));
    ws.getCell(row, 4).value = t.customer_name;
    applyBody(ws.getCell(row, 5), { right: true });
    ws.getCell(row, 5).value = t.subtotal;
    ws.getCell(row, 5).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 6), { right: true });
    ws.getCell(row, 6).value = t.vat_amount;
    ws.getCell(row, 6).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 7), { right: true, bold: true });
    ws.getCell(row, 7).value = t.total_amount;
    ws.getCell(row, 7).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 8), { right: true, color: t.wht_amount > 0 ? RED_TEXT : undefined });
    ws.getCell(row, 8).value = t.wht_amount;
    ws.getCell(row, 8).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 9), { right: true, bold: true });
    ws.getCell(row, 9).value = t.net_payable;
    ws.getCell(row, 9).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 10), { color: t.is_paid ? GREEN_TEXT : undefined });
    ws.getCell(row, 10).value = t.status;

    totals.subtotal += t.subtotal;
    totals.vat += t.vat_amount;
    totals.total += t.total_amount;
    totals.wht += t.wht_amount;
    totals.net += t.net_payable;
    row++;
  }

  // Summary row
  const sRow = row;
  applyBody(ws.getCell(sRow, 1), { bold: true });
  ws.getCell(sRow, 1).value = "รวม";
  ws.mergeCells(sRow, 1, sRow, 4);
  applyBody(ws.getCell(sRow, 5), { right: true, bold: true });
  ws.getCell(sRow, 5).value = totals.subtotal;
  ws.getCell(sRow, 5).numFmt = CURRENCY_FMT;
  applyBody(ws.getCell(sRow, 6), { right: true, bold: true });
  ws.getCell(sRow, 6).value = totals.vat;
  ws.getCell(sRow, 6).numFmt = CURRENCY_FMT;
  applyBody(ws.getCell(sRow, 7), { right: true, bold: true });
  ws.getCell(sRow, 7).value = totals.total;
  ws.getCell(sRow, 7).numFmt = CURRENCY_FMT;
  applyBody(ws.getCell(sRow, 8), { right: true, bold: true, color: totals.wht > 0 ? RED_TEXT : undefined });
  ws.getCell(sRow, 8).value = totals.wht;
  ws.getCell(sRow, 8).numFmt = CURRENCY_FMT;
  applyBody(ws.getCell(sRow, 9), { right: true, bold: true });
  ws.getCell(sRow, 9).value = totals.net;
  ws.getCell(sRow, 9).numFmt = CURRENCY_FMT;

  setColumnWidths(ws, [12, 16, 16, 22, 14, 14, 14, 12, 14, 12]);
  applyPageSetup(ws);
  return ws;
}

function buildARSheet(wb: ExcelJS.Workbook, opts: BuildOpts) {
  const ws = wb.addWorksheet("ลูกค้าค้างชำระ");
  const { arByCustomer } = opts;

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "ลูกค้าค้างชำระ";

  const headers = ["ชื่อ", "ยอดค้าง", "จำนวนบิล", "ค้างนานสุด (วัน)"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  let total = 0;
  for (const c of arByCustomer) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = c.name;
    applyBody(ws.getCell(row, 2), { right: true, color: RED_TEXT });
    ws.getCell(row, 2).value = c.total;
    ws.getCell(row, 2).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 3), { right: true });
    ws.getCell(row, 3).value = c.count;
    applyBody(ws.getCell(row, 4), { right: true });
    ws.getCell(row, 4).value = c.daysOverdue;
    total += c.total;
    row++;
  }

  // Summary row
  applyBody(ws.getCell(row, 1), { bold: true });
  ws.getCell(row, 1).value = "รวม";
  applyBody(ws.getCell(row, 2), { right: true, bold: true, color: RED_TEXT });
  ws.getCell(row, 2).value = total;
  ws.getCell(row, 2).numFmt = CURRENCY_FMT;

  setColumnWidths(ws, [30, 18, 14, 18]);
  applyPageSetup(ws);
  return ws;
}

// ============ Build Opts & Export ============

interface BuildOpts {
  summary: FinancialSummary | null;
  transactions: Transaction[];
  arByCustomer: ARByCustomer[];
  cogs: number;
  collectionRate: number;
  dateFrom: string;
}

export async function buildFinancialReportXlsx(opts: BuildOpts): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Invoice System";
  wb.created = new Date();

  buildSummarySheet(wb, opts);
  buildTransactionsSheet(wb, opts);
  buildARSheet(wb, opts);

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
