import ExcelJS from "exceljs";
import type { Item } from "../types";
import type { StockSummary, StockMovementRow } from "../hooks/useReports";
import { formatMixedStock, formatMovementQty, round2 } from "./stock";
import { formatCurrency } from "./format";

interface BuildOpts {
  summary: StockSummary | null;
  valuation: Item[];
  lowStockItems: Item[];
  movements: StockMovementRow[];
  dateFrom: string;
  dateTo: string;
}

const BRAND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E5A38" },
};

const SUBTITLE_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F2EC" },
};

const DAY_SEP_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFAFAF8" },
};

const OUT_OF_STOCK_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFDECEA" },
};

const CURRENCY_FMT = "#,##0.00";
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE8E6DF" } },
  left: { style: "thin", color: { argb: "FFE8E6DF" } },
  bottom: { style: "thin", color: { argb: "FFE8E6DF" } },
  right: { style: "thin", color: { argb: "FFE8E6DF" } },
};

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

function formatThaiDateTime(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function applyHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cell.fill = BRAND_FILL;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = THIN_BORDER;
}

function applyTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 18, color: { argb: "FF1A1A18" } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applySubtitle(cell: ExcelJS.Cell) {
  cell.font = { size: 11, color: { argb: "FF6B6B6B" } };
  cell.fill = SUBTITLE_FILL;
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function applyBody(cell: ExcelJS.Cell, opts: { bold?: boolean; right?: boolean; fill?: ExcelJS.Fill } = {}) {
  cell.font = { size: 10, color: { argb: "FF1A1A18" }, bold: opts.bold ?? false };
  cell.alignment = {
    vertical: "middle",
    horizontal: opts.right ? "right" : "left",
    wrapText: true,
  };
  if (opts.fill) cell.fill = opts.fill;
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
  ws.headerFooter.oddHeader = "รายงานสต็อก";
  ws.headerFooter.oddFooter = "&Lหน้า &P จาก &N&Rสร้างเมื่อ " + formatThaiDateTime(new Date());
}

function writeTitleBlock(ws: ExcelJS.Worksheet, spanTo: number, dateFrom: string, dateTo: string) {
  const lastCol = String.fromCharCode(64 + spanTo);
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = "รายงานสต็อก";
  applyTitle(titleCell);
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastCol}2`);
  const subCell = ws.getCell("A2");
  subCell.value = `ช่วงวันที่ ${dateFrom} ถึง ${dateTo}`;
  applySubtitle(subCell);
  ws.getRow(2).height = 20;

  ws.mergeCells(`A3:${lastCol}3`);
  const tsCell = ws.getCell("A3");
  tsCell.value = `สร้างเมื่อ ${formatThaiDateTime(new Date())}`;
  tsCell.font = { size: 9, color: { argb: "FF9A9A9A" } };
  tsCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 18;
}

function buildSummarySheet(wb: ExcelJS.Workbook, opts: BuildOpts): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("สรุปภาพรวม", { views: [{ state: "frozen", ySplit: 4 }] });
  writeTitleBlock(ws, 2, opts.dateFrom, opts.dateTo);

  const kpis: Array<{ label: string; value: string; alert?: boolean }> = [
    { label: "สินค้าทั้งหมด", value: `${opts.summary?.totalItems ?? 0} รายการ` },
    {
      label: "มูลค่าสต็อก (ทุนเฉลี่ย)",
      value: `฿${formatCurrency(opts.summary?.totalValue ?? 0)}`,
    },
    {
      label: "สินค้าใกล้หมด",
      value: (opts.summary?.lowStockCount ?? 0).toString(),
      alert: (opts.summary?.lowStockCount ?? 0) > 0,
    },
    {
      label: "สินค้าหมด",
      value: (opts.summary?.outOfStockCount ?? 0).toString(),
      alert: (opts.summary?.outOfStockCount ?? 0) > 0,
    },
  ];

  const startRow = 5;
  kpis.forEach((kpi, i) => {
    const row = ws.getRow(startRow + i);
    row.height = 22;
    const labelCell = row.getCell(1);
    labelCell.value = kpi.label;
    applyBody(labelCell, { bold: true });
    labelCell.fill = SUBTITLE_FILL;
    labelCell.font = { size: 10, bold: true, color: { argb: "FF1A1A18" } };

    const valueCell = row.getCell(2);
    valueCell.value = kpi.value;
    valueCell.font = {
      size: 12,
      bold: true,
      color: { argb: kpi.alert ? "FFC0392B" : "FF1A1A18" },
    };
    valueCell.alignment = { vertical: "middle", horizontal: "right" };
    valueCell.border = THIN_BORDER;
  });

  setColumnWidths(ws, [28, 30]);
  applyPageSetup(ws);
  return ws;
}

function buildValuationSheet(wb: ExcelJS.Workbook, opts: BuildOpts): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("มูลค่าสต็อก", { views: [{ state: "frozen", ySplit: 5, xSplit: 1 }] });
  writeTitleBlock(ws, 6, opts.dateFrom, opts.dateTo);

  const headerRow = ws.getRow(5);
  const headers = ["รายการ", "SKU", "คงเหลือ", "ทุนเฉลี่ย/หน่วย", "ทุนเฉลี่ย/หน่วยรอง", "มูลค่า"];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeader(cell);
  });
  headerRow.height = 24;

  let totalValue = 0;
  opts.valuation.forEach((item, idx) => {
    const r = ws.getRow(6 + idx);
    const avgCost = Number(item.avg_cost || 0);
    const stockValue = round2(Number(item.stock_value || 0));
    totalValue += stockValue;

    r.getCell(1).value = item.name;
    r.getCell(2).value = item.sku || "";
    r.getCell(3).value = formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton);
    r.getCell(4).value = avgCost;
    r.getCell(4).numFmt = CURRENCY_FMT;
    if (item.carton_unit && item.qty_per_carton && item.qty_per_carton > 0) {
      r.getCell(5).value = `฿${formatCurrency(round2(avgCost * item.qty_per_carton))} / ${item.carton_unit}`;
    } else {
      r.getCell(5).value = "—";
    }
    r.getCell(6).value = stockValue;
    r.getCell(6).numFmt = CURRENCY_FMT;

    applyBody(r.getCell(1), { fill: idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } });
    applyBody(r.getCell(2), { fill: idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } });
    applyBody(r.getCell(3), { right: true, fill: idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } });
    applyBody(r.getCell(4), { right: true, fill: idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } });
    applyBody(r.getCell(5), { right: true, fill: idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } });
    applyBody(r.getCell(6), { right: true, bold: true, fill: idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } });
  });

  if (opts.valuation.length > 0) {
    const totalRow = ws.getRow(6 + opts.valuation.length);
    totalRow.getCell(1).value = "รวม";
    totalRow.getCell(1).font = { bold: true, size: 11 };
    totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    totalRow.getCell(1).fill = SUBTITLE_FILL;
    totalRow.getCell(1).border = THIN_BORDER;

    for (let c = 2; c <= 5; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = SUBTITLE_FILL;
      cell.border = THIN_BORDER;
    }
    const totalCell = totalRow.getCell(6);
    totalCell.value = round2(totalValue);
    totalCell.numFmt = CURRENCY_FMT;
    totalCell.font = { bold: true, size: 11, color: { argb: "FF1A1A18" } };
    totalCell.alignment = { vertical: "middle", horizontal: "right" };
    totalCell.fill = SUBTITLE_FILL;
    totalCell.border = THIN_BORDER;
    totalRow.height = 22;
  }

  setColumnWidths(ws, [32, 14, 22, 18, 24, 18]);
  applyPageSetup(ws);
  return ws;
}

function buildLowStockSheet(wb: ExcelJS.Workbook, opts: BuildOpts): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("สินค้าใกล้หมด", { views: [{ state: "frozen", ySplit: 5, xSplit: 1 }] });
  writeTitleBlock(ws, 6, opts.dateFrom, opts.dateTo);

  const headerRow = ws.getRow(5);
  const headers = ["สถานะ", "รายการ", "SKU", "คงเหลือ", "เกณฑ์แจ้ง", "มูลค่า"];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeader(cell);
  });
  headerRow.height = 24;

  opts.lowStockItems.forEach((item, idx) => {
    const r = ws.getRow(6 + idx);
    const isOut = item.stock_count <= 0;
    const status = isOut ? "หมด" : "ใกล้หมด";
    const value = round2(Number(item.stock_value || 0));

    r.getCell(1).value = status;
    r.getCell(2).value = item.name;
    r.getCell(3).value = item.sku || "";
    r.getCell(4).value = formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton);
    r.getCell(5).value = formatMixedStock(item.low_stock_threshold || 0, item.base_unit, item.carton_unit, item.qty_per_carton);
    r.getCell(6).value = value;
    r.getCell(6).numFmt = CURRENCY_FMT;

    const baseFill = isOut ? OUT_OF_STOCK_FILL : idx % 2 === 0 ? undefined : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF8" } } as ExcelJS.Fill;
    applyBody(r.getCell(1), { bold: true, fill: baseFill });
    r.getCell(1).font = { size: 10, bold: true, color: { argb: isOut ? "FFC0392B" : "FFB45309" } };
    r.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    applyBody(r.getCell(2), { fill: baseFill });
    applyBody(r.getCell(3), { fill: baseFill });
    applyBody(r.getCell(4), { right: true, fill: baseFill });
    applyBody(r.getCell(5), { right: true, fill: baseFill });
    applyBody(r.getCell(6), { right: true, bold: true, fill: baseFill });
  });

  if (opts.lowStockItems.length === 0) {
    const r = ws.getRow(6);
    r.getCell(1).value = "ไม่มีสินค้าใกล้หมดหรือหมดสต็อก";
    ws.mergeCells("A6:F6");
    const cell = r.getCell(1);
    cell.font = { size: 10, color: { argb: "FF9A9A9A" }, italic: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  setColumnWidths(ws, [14, 32, 14, 22, 22, 18]);
  applyPageSetup(ws);
  return ws;
}

function buildMovementsSheet(wb: ExcelJS.Workbook, opts: BuildOpts): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("ความเคลื่อนไหว", { views: [{ state: "frozen", ySplit: 5, xSplit: 2 }] });
  writeTitleBlock(ws, 11, opts.dateFrom, opts.dateTo);

  const headerRow = ws.getRow(5);
  const headers = [
    "วันที่",
    "รายการ",
    "SKU",
    "ประเภท",
    "จำนวน",
    "ต้นทุน/หน่วย",
    "มูลค่ารายการ",
    "คงเหลือ",
    "มูลค่าคงเหลือ",
    "เอกสารอ้างอิง",
    "หมายเหตุ",
  ];
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyHeader(cell);
  });
  headerRow.height = 28;

  let currentRow = 6;
  let lastDate = "";
  opts.movements.forEach((m) => {
    const dayLabel = formatThaiDate(m.date);
    if (dayLabel !== lastDate) {
      lastDate = dayLabel;
      const sepRow = ws.getRow(currentRow);
      sepRow.getCell(1).value = dayLabel;
      for (let c = 1; c <= 11; c++) {
        const c2 = sepRow.getCell(c);
        c2.fill = DAY_SEP_FILL;
        c2.font = { size: 9, bold: true, color: { argb: "FF6B6B6B" } };
        c2.alignment = { vertical: "middle", horizontal: "left" };
        c2.border = THIN_BORDER;
      }
      sepRow.height = 18;
      currentRow++;
    }

    const r = ws.getRow(currentRow);
    r.getCell(1).value = "";
    r.getCell(2).value = m.itemName;
    r.getCell(3).value = m.itemSku || "";
    r.getCell(4).value = m.type;
    r.getCell(5).value = formatMovementQty(m.qty, m.baseUnit, m.cartonUnit, m.qtyPerCarton);
    r.getCell(6).value = round2(Number(m.unitCost || 0));
    r.getCell(6).numFmt = CURRENCY_FMT;
    r.getCell(7).value = round2(Number(m.movementValue || 0));
    r.getCell(7).numFmt = CURRENCY_FMT;
    r.getCell(8).value = formatMovementQty(m.balance, m.baseUnit, m.cartonUnit, m.qtyPerCarton);
    r.getCell(9).value = round2(Number(m.balanceValue || 0));
    r.getCell(9).numFmt = CURRENCY_FMT;
    r.getCell(10).value = m.docNumber || "";
    r.getCell(11).value = m.reason || "";

    const qtyColor = m.qty < 0 ? "FFC0392B" : "FF1E5A38";
    applyBody(r.getCell(1), {});
    applyBody(r.getCell(2), {});
    applyBody(r.getCell(3), {});
    applyBody(r.getCell(4), {});
    const qtyCell = r.getCell(5);
    applyBody(qtyCell, { right: true, bold: true });
    qtyCell.font = { size: 10, bold: true, color: { argb: qtyColor } };
    applyBody(r.getCell(6), { right: true });
    applyBody(r.getCell(7), { right: true });
    const balCell = r.getCell(8);
    applyBody(balCell, { right: true });
    applyBody(r.getCell(9), { right: true });
    applyBody(r.getCell(10), {});
    applyBody(r.getCell(11), {});

    r.height = 20;
    currentRow++;
  });

  if (opts.movements.length === 0) {
    const r = ws.getRow(6);
    ws.mergeCells("A6:K6");
    const cell = r.getCell(1);
    cell.value = "ไม่มีความเคลื่อนไหวในช่วงวันที่ที่เลือก";
    cell.font = { size: 10, color: { argb: "FF9A9A9A" }, italic: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }

  setColumnWidths(ws, [12, 28, 12, 18, 18, 14, 16, 18, 16, 18, 28]);
  applyPageSetup(ws);
  return ws;
}

export async function buildStockReportXlsx(opts: BuildOpts): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Invoice System";
  wb.created = new Date();

  buildSummarySheet(wb, opts);
  buildValuationSheet(wb, opts);
  buildLowStockSheet(wb, opts);
  buildMovementsSheet(wb, opts);

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
