import ExcelJS from "exceljs";
import type { FinancialSummary, ARByCustomer, ARDetail, ARAgingBucket, TopCustomer, MonthlyRevenue, RevenueByType, Transaction, LineItemRow, DealNoteRow } from "../hooks/useReports";
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
    ["กำไรขั้นต้น", formatCurrency((summary?.revenue ?? 0) - cogs)],
    ["อัตรากำไรขั้นต้น", (summary?.revenue ?? 0) > 0 ? `${(((summary?.revenue ?? 0) - cogs) / (summary?.revenue ?? 1) * 100).toFixed(1)}%` : "0.0%"],
    ["เก็บแล้ว", formatCurrency(summary?.collected ?? 0)],
    ["หัก ณ ที่จ่าย", formatCurrency(summary?.whtWithheld ?? 0)],
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

  const headers = ["วันที่", "เลขที่", "เลขที่ดีล", "ประเภท", "ลูกค้า", "ก่อน VAT", "VAT", "ยอดรวม", "หัก ณ ที่จ่าย", "ยอดสุทธิ", "วันที่ชำระ", "สถานะ"];
  let row = 1;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyBody(cell, { bold: true });
    cell.value = h;
  });

  row = 2;
  for (const t of transactions) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = t.date || "-";
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = t.doc_number;
    applyBody(ws.getCell(row, 3));
    ws.getCell(row, 3).value = t.deal_number || "-";
    applyBody(ws.getCell(row, 4));
    ws.getCell(row, 4).value = t.doc_type;
    applyBody(ws.getCell(row, 5));
    ws.getCell(row, 5).value = t.customer_name;
    applyBody(ws.getCell(row, 6), { right: true });
    ws.getCell(row, 6).value = t.subtotal;
    ws.getCell(row, 6).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 7), { right: true });
    ws.getCell(row, 7).value = t.vat_amount;
    ws.getCell(row, 7).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 8), { right: true, bold: true });
    ws.getCell(row, 8).value = t.total_amount;
    ws.getCell(row, 8).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 9), { right: true, color: t.wht_amount > 0 ? RED_TEXT : undefined });
    ws.getCell(row, 9).value = t.wht_amount;
    ws.getCell(row, 9).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 10), { right: true, bold: true });
    ws.getCell(row, 10).value = t.net_payable;
    ws.getCell(row, 10).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 11));
    ws.getCell(row, 11).value = t.paid_at ? (() => { const d = new Date(t.paid_at!); return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`; })() : "-";
    applyBody(ws.getCell(row, 12), { color: t.is_paid ? GREEN_TEXT : undefined });
    ws.getCell(row, 12).value = t.status;
    row++;
  }

  setColumnWidths(ws, [12, 16, 14, 16, 22, 14, 14, 14, 12, 14, 12, 12]);
  return ws;
}

function buildWhtSheet(wb: ExcelJS.Workbook, opts: BuildOpts) {
  const ws = wb.addWorksheet("หัก ณ ที่จ่าย");
  const whtTransactions = opts.whtTransactions || [];

  if (whtTransactions.length === 0) {
    applyBody(ws.getCell(1, 1));
    ws.getCell(1, 1).value = "ไม่มีรายการหัก ณ ที่จ่ายในช่วงเวลานี้";
    setColumnWidths(ws, [40]);
    return ws;
  }

  const headers = ["วันที่", "เลขที่ดีล", "เลขที่เอกสาร", "ประเภท", "ลูกค้า", "เลขผู้เสียภาษี", "ที่อยู่", "ยอดรวม", "ก่อน VAT", "หัก ณ ที่จ่าย %", "หัก ณ ที่จ่าย", "ใบรับรองหัก ณ ที่จ่าย", "วันที่ชำระ"];
  let row = 1;
  headers.forEach((h, i) => {
    applyHeader(ws.getCell(row, i + 1));
    ws.getCell(row, i + 1).value = h;
  });

  row = 2;
  for (const t of whtTransactions) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = t.date || "-";
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = t.deal_number || "-";
    applyBody(ws.getCell(row, 3));
    ws.getCell(row, 3).value = t.doc_number;
    applyBody(ws.getCell(row, 4));
    ws.getCell(row, 4).value = t.doc_type;
    applyBody(ws.getCell(row, 5));
    ws.getCell(row, 5).value = t.customer_name;
    applyBody(ws.getCell(row, 6));
    ws.getCell(row, 6).value = t.customer_tax_id || "-";
    applyBody(ws.getCell(row, 7));
    ws.getCell(row, 7).value = t.customer_address || "-";
    applyBody(ws.getCell(row, 8), { right: true, bold: true });
    ws.getCell(row, 8).value = t.total_amount;
    ws.getCell(row, 8).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 9), { right: true });
    ws.getCell(row, 9).value = t.subtotal || 0;
    ws.getCell(row, 9).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 10), { right: true });
    ws.getCell(row, 10).value = t.wht_rate != null ? `${t.wht_rate}%` : "—";
    applyBody(ws.getCell(row, 11), { right: true, color: RED_TEXT });
    ws.getCell(row, 11).value = t.wht_amount;
    ws.getCell(row, 11).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 12));
    ws.getCell(row, 12).value = t.wht_certificate_no || "-";
    applyBody(ws.getCell(row, 13));
    ws.getCell(row, 13).value = t.paid_at ? (() => { const d = new Date(t.paid_at!); return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`; })() : "-";
    row++;
  }

  const totalWht = whtTransactions.reduce((s, t) => s + t.wht_amount, 0);
  applyBody(ws.getCell(row, 1), { bold: true });
  ws.getCell(row, 1).value = "รวม";
  applyBody(ws.getCell(row, 11), { right: true, bold: true, color: RED_TEXT });
  ws.getCell(row, 11).value = totalWht;
  ws.getCell(row, 11).numFmt = CURRENCY_FMT;

  setColumnWidths(ws, [12, 14, 16, 16, 22, 14, 22, 14, 14, 8, 14, 14, 12]);
  applyPageSetup(ws);
  return ws;
}

function buildARSheet(wb: ExcelJS.Workbook, opts: BuildOpts) {
  const ws = wb.addWorksheet("ลูกหนี้คงค้าง");
  const { arDetails } = opts;
  const details = arDetails || [];

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "ลูกหนี้คงค้าง (รายเอกสาร)";

  const headers = ["ลูกค้า", "เลขที่ดีล", "เลขที่เอกสาร", "ประเภท", "ยอดค้าง", "วันครบกำหนด", "ค้าง (วัน)"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  let total = 0;
  for (const d of details) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = d.customerName;
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = d.dealNumber || "-";
    applyBody(ws.getCell(row, 3));
    ws.getCell(row, 3).value = d.docNumber;
    applyBody(ws.getCell(row, 4));
    ws.getCell(row, 4).value = d.docType;
    applyBody(ws.getCell(row, 5), { right: true, color: RED_TEXT });
    ws.getCell(row, 5).value = d.netPayable;
    ws.getCell(row, 5).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 6));
    ws.getCell(row, 6).value = d.dueDate || "-";
    applyBody(ws.getCell(row, 7), { right: true });
    ws.getCell(row, 7).value = d.daysOverdue;
    total += d.netPayable;
    row++;
  }

  applyBody(ws.getCell(row, 1), { bold: true });
  ws.getCell(row, 1).value = "รวม";
  applyBody(ws.getCell(row, 5), { right: true, bold: true, color: RED_TEXT });
  ws.getCell(row, 5).value = total;
  ws.getCell(row, 5).numFmt = CURRENCY_FMT;

  setColumnWidths(ws, [24, 14, 16, 18, 14, 14, 12]);
  applyPageSetup(ws);
  return ws;
}

function buildLineItemsSheet(wb: ExcelJS.Workbook, lineItems: LineItemRow[]) {
  const ws = wb.addWorksheet("รายการบรรทัด");

  const headers = ["เลขที่ดีล", "เลขที่", "วันที่", "ลูกค้า", "รายการ", "จำนวน", "หน่วย", "หน่วยละ", "ส่วนลด%", "จำนวนเงิน", "สถานะชำระ"];
  let row = 1;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyBody(cell, { bold: true });
    cell.value = h;
  });

  row = 2;
  for (const li of lineItems) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = li.dealNumber || "-";
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = li.docNumber;
    applyBody(ws.getCell(row, 3));
    ws.getCell(row, 3).value = li.date || "-";
    applyBody(ws.getCell(row, 4));
    ws.getCell(row, 4).value = li.customerName;
    applyBody(ws.getCell(row, 5));
    ws.getCell(row, 5).value = li.itemName;
    applyBody(ws.getCell(row, 6), { right: true });
    ws.getCell(row, 6).value = li.quantity;
    ws.getCell(row, 6).numFmt = "#,##0.##";
    applyBody(ws.getCell(row, 7));
    ws.getCell(row, 7).value = li.unit;
    applyBody(ws.getCell(row, 8), { right: true });
    ws.getCell(row, 8).value = li.unitPrice;
    ws.getCell(row, 8).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 9), { right: true });
    ws.getCell(row, 9).value = li.discountPercent;
    applyBody(ws.getCell(row, 10), { right: true, bold: true });
    ws.getCell(row, 10).value = li.lineTotal;
    ws.getCell(row, 10).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 11), { color: li.paidStatus === "ชำระแล้ว" ? GREEN_TEXT : undefined });
    ws.getCell(row, 11).value = li.paidStatus;
    row++;
  }

  setColumnWidths(ws, [14, 16, 12, 22, 28, 10, 8, 14, 10, 14, 12]);
  return ws;
}

function buildDealNotesSheet(wb: ExcelJS.Workbook, dealNotes: DealNoteRow[]) {
  const ws = wb.addWorksheet("บันทึกภายใน");

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "บันทึกภายใน (Deal Notes)";

  if (dealNotes.length === 0) {
    applyBody(ws.getCell("A3"));
    ws.getCell("A3").value = "ไม่มีบันทึกในช่วงเวลานี้";
    setColumnWidths(ws, [30]);
    return ws;
  }

  const headers = ["เลขที่ดีล", "วันที่", "ผู้เขียน", "บทบาท", "บันทึก"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  for (const n of dealNotes) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = n.dealNumber || "-";
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = n.date ? new Date(n.date).toLocaleDateString("th-TH") : "-";
    applyBody(ws.getCell(row, 3));
    ws.getCell(row, 3).value = n.authorName;
    applyBody(ws.getCell(row, 4));
    ws.getCell(row, 4).value = n.authorRole;
    applyBody(ws.getCell(row, 5));
    ws.getCell(row, 5).value = n.content;
    row++;
  }

  setColumnWidths(ws, [14, 14, 16, 12, 50]);
  applyPageSetup(ws);
  return ws;
}

function buildARAgingSheet(wb: ExcelJS.Workbook, arAging: ARAgingBucket[]) {
  const ws = wb.addWorksheet("อายุลูกหนี้");
  const buckets = arAging || [];

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "อายุลูกหนี้คงค้าง (AR Aging)";

  const headers = ["ช่วงอายุ", "จำนวนบิล", "ยอดค้าง"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  let totalBills = 0;
  let totalAmount = 0;
  for (const b of buckets) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = b.label;
    applyBody(ws.getCell(row, 2), { right: true });
    ws.getCell(row, 2).value = b.count;
    applyBody(ws.getCell(row, 3), { right: true, color: RED_TEXT });
    ws.getCell(row, 3).value = b.total;
    ws.getCell(row, 3).numFmt = CURRENCY_FMT;
    totalBills += b.count;
    totalAmount += b.total;
    row++;
  }

  applyBody(ws.getCell(row, 1), { bold: true });
  ws.getCell(row, 1).value = "รวม";
  applyBody(ws.getCell(row, 2), { right: true, bold: true });
  ws.getCell(row, 2).value = totalBills;
  applyBody(ws.getCell(row, 3), { right: true, bold: true, color: RED_TEXT });
  ws.getCell(row, 3).value = totalAmount;
  ws.getCell(row, 3).numFmt = CURRENCY_FMT;

  setColumnWidths(ws, [16, 12, 16]);
  return ws;
}

function buildTopCustomersSheet(wb: ExcelJS.Workbook, topCustomers: TopCustomer[]) {
  const ws = wb.addWorksheet("ยอดขายตามลูกค้า");

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "10 ลูกค้าสูงสุด (ตามยอดขาย)";

  const headers = ["ลูกค้า", "จำนวนเอกสาร", "ยอดรวม"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  for (const c of topCustomers) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = c.name;
    applyBody(ws.getCell(row, 2), { right: true });
    ws.getCell(row, 2).value = c.count;
    applyBody(ws.getCell(row, 3), { right: true, bold: true });
    ws.getCell(row, 3).value = c.total;
    ws.getCell(row, 3).numFmt = CURRENCY_FMT;
    row++;
  }

  setColumnWidths(ws, [30, 14, 18]);
  return ws;
}

function buildMonthlyTrendSheet(wb: ExcelJS.Workbook, monthly: MonthlyRevenue[]) {
  const ws = wb.addWorksheet("แนวโน้มรายได้");

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "รายได้ 6 เดือนย้อนหลัง";

  const headers = ["ปี พ.ศ.", "เดือน", "ยอดรวม", "เปลี่ยนแปลง (%)"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  const MONTH_NAMES = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];

  row = 4;
  for (let i = 0; i < monthly.length; i++) {
    const m = monthly[i];
    const buddhistYear = m.year + 543;
    const monthIdx = parseInt(m.month, 10) - 1;
    const monthName = MONTH_NAMES[monthIdx] || m.month;

    let changeStr = "-";
    if (i > 0) {
      const prev = monthly[i - 1].total;
      if (prev > 0) {
        const pct = ((m.total - prev) / prev) * 100;
        changeStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      }
    }

    applyBody(ws.getCell(row, 1), { right: true });
    ws.getCell(row, 1).value = buddhistYear;
    applyBody(ws.getCell(row, 2));
    ws.getCell(row, 2).value = monthName;
    applyBody(ws.getCell(row, 3), { right: true, bold: true });
    ws.getCell(row, 3).value = m.total;
    ws.getCell(row, 3).numFmt = CURRENCY_FMT;
    applyBody(ws.getCell(row, 4), { right: true, color: changeStr.startsWith("+") ? GREEN_TEXT : changeStr.startsWith("-") ? RED_TEXT : undefined });
    ws.getCell(row, 4).value = changeStr;
    row++;
  }

  setColumnWidths(ws, [10, 10, 16, 16]);
  return ws;
}

function buildRevenueByTypeSheet(wb: ExcelJS.Workbook, byType: RevenueByType[]) {
  const ws = wb.addWorksheet("รายได้ตามประเภท");

  applyTitle(ws.getCell("A1"));
  ws.getCell("A1").value = "รายได้แยกตามประเภทเอกสาร";

  const headers = ["ประเภท", "จำนวน", "ยอดรวม"];
  let row = 3;
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    applyHeader(cell);
    cell.value = h;
  });

  row = 4;
  for (const t of byType) {
    applyBody(ws.getCell(row, 1));
    ws.getCell(row, 1).value = t.docType;
    applyBody(ws.getCell(row, 2), { right: true });
    ws.getCell(row, 2).value = t.count;
    applyBody(ws.getCell(row, 3), { right: true, bold: true });
    ws.getCell(row, 3).value = t.total;
    ws.getCell(row, 3).numFmt = CURRENCY_FMT;
    row++;
  }

  setColumnWidths(ws, [22, 12, 16]);
  return ws;
}

// ============ Build Opts & Export ============

interface BuildOpts {
  summary: FinancialSummary | null;
  transactions: Transaction[];
  whtTransactions: Transaction[];
  arByCustomer: ARByCustomer[];
  arDetails?: ARDetail[];
  arAging?: ARAgingBucket[];
  topCustomers?: TopCustomer[];
  monthly?: MonthlyRevenue[];
  byType?: RevenueByType[];
  lineItems?: LineItemRow[];
  dealNotes?: DealNoteRow[];
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
  buildWhtSheet(wb, opts);
  buildARSheet(wb, opts);
  if (opts.arAging && opts.arAging.length > 0) {
    buildARAgingSheet(wb, opts.arAging);
  }
  if (opts.topCustomers && opts.topCustomers.length > 0) {
    buildTopCustomersSheet(wb, opts.topCustomers);
  }
  if (opts.monthly && opts.monthly.length > 0) {
    buildMonthlyTrendSheet(wb, opts.monthly);
  }
  if (opts.byType && opts.byType.length > 0) {
    buildRevenueByTypeSheet(wb, opts.byType);
  }
  if (opts.lineItems && opts.lineItems.length > 0) {
    buildLineItemsSheet(wb, opts.lineItems);
  }
  if (opts.dealNotes) {
    buildDealNotesSheet(wb, opts.dealNotes);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
