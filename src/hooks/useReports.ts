import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/fetchAllRows";
import type { Item } from "../types";
import {
  computeWorkspaceFinancials,
  deltaCaptionForRange,
  docTypeLabels as buildDocTypeLabels,
  getMonthRange,
  getRecognitionDate,
  getTransactionStatusLabel,
  isRecognizedSalesDocument,
  selectWhtReceipts,
  trendMonthsForPeriod,
} from "../lib/reports/financialModel";
import type {
  ARAgingBucket,
  ARByCustomer,
  ARDetail,
  FinancialSummary,
  MonthlyRevenue,
  RevenueByType,
  TopCustomer,
} from "../lib/reports/financialModel";

// The report row shapes stay here; the financial figures and their types are
// owned by the pure model and re-exported so existing importers are unchanged.
export { deltaCaptionForRange, getMonthRange };
export type {
  ARAgingBucket,
  ARByCustomer,
  ARDetail,
  FinancialSummary,
  MonthlyRevenue,
  RevenueByType,
  TopCustomer,
} from "../lib/reports/financialModel";

export interface Transaction {
  id: string;
  deal_id: string | null;
  deal_number: string | null;
  date: string;
  doc_number: string;
  doc_type: string;
  doc_type_raw: string;
  customer_name: string;
  customer_tax_id: string | null;
  customer_address: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  wht_amount: number;
  wht_rate: number | null;
  wht_certificate_no: string | null;
  net_payable: number;
  status: string;
  is_paid: boolean;
  paid_at: string | null;
}

export interface LineItemRow {
  docNumber: string;
  date: string;
  customerName: string;
  dealNumber: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  paidStatus: string;
}

export interface DealNoteRow {
  dealNumber: string | null;
  date: string;
  authorName: string;
  authorRole: string;
  content: string;
}

export interface StockSummary {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface StockMovementRow {
  id: string;
  date: string;
  itemName: string;
  itemSku: string | null;
  type: string;
  typeKey: string;
  qty: number;
  balance: number;
  unitCost: number | null;
  movementValue: number | null;
  balanceValue: number | null;
  reason: string | null;
  docNumber: string | null;
  baseUnit: string;
  cartonUnit: string | null;
  qtyPerCarton: number | null;
}

export function useFinancialReport(userId: string | undefined, from: string, to: string) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [byType, setByType] = useState<RevenueByType[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRevenue[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyRevenue[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [arAging, setArAging] = useState<ARAgingBucket[]>([]);
  const [arByCustomer, setArByCustomer] = useState<ARByCustomer[]>([]);
  const [cogs, setCogs] = useState(0);
  const [collectionRate, setCollectionRate] = useState(0);
  const [revenueDelta, setRevenueDelta] = useState<number | null>(null);
  const [customerCreditTotal, setCustomerCreditTotal] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [whtTransactions, setWhtTransactions] = useState<Transaction[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [arDetails, setArDetails] = useState<ARDetail[]>([]);
  const [dealNotes, setDealNotes] = useState<DealNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const start = from;
      const end = to;

      const { data: clientProfile } = await supabase
        .from("client_profiles")
        .select("vat_registered")
        .eq("user_id", userId)
        .maybeSingle();
      const vatRegistered = Boolean(clientProfile?.vat_registered);

      // Paged: an unpaged select is capped at 1000 rows, which would silently
      // turn the cumulative AR and the 12-month trend into partial sums.
      const allDocs = await fetchAllRows<any>((from, to) =>
        supabase
          .from("documents")
          .select(
            "id, deal_id, doc_number, doc_type, status, subtotal, vat_amount, total_amount, net_payable, amount_received, wht_amount, wht_rate, wht_certificate_no, paid_at, issue_date, due_date, customer_id, customer:customer_id(name, tax_id, address)",
          )
          .eq("user_id", userId)
          .neq("doc_type", "delivery_note")
          .neq("status", "draft")
          .neq("status", "voided")
          .neq("status", "converted")
          .order("id")
          .range(from, to),
      );

      const docs = allDocs as any[];

      // Adjustment notes change revenue/VAT/outstanding:
      // credit notes (ใบลดหนี้) are negative, debit notes (ใบเพิ่มหนี้) positive.
      const activeCreditNotes = docs.filter((d) => d.doc_type === "credit_note");
      const activeDebitNotes = docs.filter((d) => d.doc_type === "debit_note");

      // Paged as well — a workspace with many billing notes would otherwise
      // stop excluding the bundled invoices and double-count its AR.
      const bnLinks = await fetchAllRows<{ invoice_id: string }>((from, to) =>
        supabase.from("billing_note_invoices").select("invoice_id").order("id").range(from, to),
      );
      const invoiceIdsInBn = new Set(bnLinks.map((l) => l.invoice_id));

      const recognizedSalesDocs = docs.filter((d) => isRecognizedSalesDocument(d));

      const paidThisPeriod = recognizedSalesDocs.filter((d) => {
        const recognitionDate = getRecognitionDate(d);
        return recognitionDate >= start && recognitionDate <= end;
      });

      const dealIds = [...new Set(docs.map((d: any) => d.deal_id).filter(Boolean))] as string[];
      const dealMap = new Map<string, { deal_number: string | null; notes: any[] }>();
      if (dealIds.length > 0) {
        const dealsData = await fetchAllRows<any>((from, to) =>
          supabase
            .from("deals")
            .select("id, deal_number, notes")
            .in("id", dealIds)
            .order("id")
            .range(from, to),
        );
        for (const deal of dealsData) {
          dealMap.set(deal.id, { deal_number: deal.deal_number || null, notes: deal.notes || [] });
        }
      }

      const paidDocIds = paidThisPeriod.map((d: any) => d.id);
      let allLineItems: LineItemRow[] = [];
      if (paidDocIds.length > 0) {
        const liData = await fetchAllRows<any>((from, to) =>
          supabase
            .from("document_line_items")
            .select("*")
            .in("document_id", paidDocIds)
            .order("sort_order", { ascending: true })
            .order("id")
            .range(from, to),
        );
        allLineItems = liData.map((li: any) => ({
          docNumber: paidThisPeriod.find((d: any) => d.id === li.document_id)?.doc_number || "-",
          date: getRecognitionDate(paidThisPeriod.find((d: any) => d.id === li.document_id) || {}),
          customerName:
            paidThisPeriod.find((d: any) => d.id === li.document_id)?.customer?.name || "ไม่ระบุ",
          dealNumber: (() => {
            const doc = paidThisPeriod.find((d: any) => d.id === li.document_id);
            if (!doc?.deal_id) return null;
            return dealMap.get(doc.deal_id)?.deal_number || null;
          })(),
          itemName: li.item_name,
          quantity: li.quantity,
          unit: li.unit,
          unitPrice: li.unit_price,
          discountPercent: li.discount_percent,
          lineTotal: li.line_total,
          paidStatus: (() => {
            const doc = paidThisPeriod.find((d: any) => d.id === li.document_id);
            return doc?.status === "paid" ? "ชำระแล้ว" : "รอชำระ";
          })(),
        }));
      }
      setLineItems(allLineItems);

      const dealNotesData: DealNoteRow[] = [];
      const dealIdsWithActivity = new Set(
        paidThisPeriod.map((d: any) => d.deal_id).filter(Boolean),
      );
      for (const dealId of dealIdsWithActivity) {
        const deal = dealMap.get(dealId);
        if (!deal || deal.notes.length === 0) continue;
        for (const note of deal.notes) {
          dealNotesData.push({
            dealNumber: deal.deal_number || null,
            date: note.created_at || "",
            authorName: note.author_name || "",
            authorRole: note.author_role || "",
            content: note.content || "",
          });
        }
      }
      dealNotesData.sort((a, b) => b.date.localeCompare(a.date));
      setDealNotes(dealNotesData);

      // Every report figure comes from the pure model, so the screen and the
      // Excel export are derived from one implementation and the numbers are
      // unit-testable. The trend window ends at the *selected* month rather
      // than today, so the chart and the export follow the chosen period.
      const model = computeWorkspaceFinancials({
        docs,
        invoiceIdsInBillingNote: invoiceIdsInBn,
        start,
        end,
        trendMonths: trendMonthsForPeriod(end, 12),
        dealNumberByDealId: new Map(
          [...dealMap.entries()].map(([id, deal]) => [id, deal.deal_number] as const),
        ),
        vatRegistered,
      });

      setSummary(model.summary);
      setByType(model.byType);
      setMonthly(model.trend.slice(-6));
      setMonthlyTrend(model.trend);
      setTopCustomers(model.topCustomers);
      setArAging(model.arAging);
      setArByCustomer(model.arByCustomer);
      setArDetails(model.arDetails);
      setRevenueDelta(model.revenueDelta);
      setCollectionRate(model.collectionRate);
      setCustomerCreditTotal(model.customerCreditTotal);

      // Shared by the transaction register and the WHT sheet below.
      const docTypeLabels = buildDocTypeLabels(vatRegistered);
      const whtDocs = selectWhtReceipts(docs, start, end);

      // Transaction-level detail table (reuses docTypeLabels above).
      const txns: Transaction[] = paidThisPeriod.map((d: any) => ({
        id: d.id,
        deal_id: d.deal_id || null,
        deal_number: d.deal_id ? dealMap.get(d.deal_id)?.deal_number || null : null,
        date: getRecognitionDate(d),
        doc_number: d.doc_number || "-",
        doc_type: docTypeLabels[d.doc_type as string] || d.doc_type,
        doc_type_raw: d.doc_type,
        customer_name: d.customer?.name || "ไม่ระบุ",
        customer_tax_id: d.customer?.tax_id || null,
        customer_address: d.customer?.address || null,
        subtotal: d.subtotal || 0,
        vat_amount: d.vat_amount || 0,
        total_amount: d.total_amount || 0,
        wht_amount: d.wht_amount || 0,
        wht_rate: d.wht_rate ?? null,
        wht_certificate_no: d.wht_certificate_no || null,
        net_payable: d.net_payable || 0,
        status: getTransactionStatusLabel(d),
        is_paid: d.status === "paid" || (d.doc_type === "receipt" && d.status !== "overdue"),
        paid_at: d.paid_at || null,
      }));

      // Adjustment notes dated in this period appear as their own register
      // rows so the book reconciles with the adjusted summary figures:
      // credit notes negative, debit notes positive.
      const sign = (docType: string) => (docType === "credit_note" ? -1 : 1);
      const adjustmentTxns: Transaction[] = [...activeCreditNotes, ...activeDebitNotes]
        .filter((d: any) => {
          const adjDate = (d.issue_date || "").slice(0, 10);
          return adjDate >= start && adjDate <= end;
        })
        .map((d: any) => {
          const sgn = sign(d.doc_type as string);
          return {
            id: d.id,
            deal_id: d.deal_id || null,
            deal_number: d.deal_id ? dealMap.get(d.deal_id)?.deal_number || null : null,
            date: (d.issue_date || "").slice(0, 10),
            doc_number: d.doc_number || "-",
            doc_type: docTypeLabels[d.doc_type as string] || d.doc_type,
            doc_type_raw: d.doc_type,
            customer_name: d.customer?.name || "ไม่ระบุ",
            customer_tax_id: d.customer?.tax_id || null,
            customer_address: d.customer?.address || null,
            subtotal: sgn * (d.subtotal || 0),
            vat_amount: sgn * (d.vat_amount || 0),
            total_amount: sgn * (d.total_amount || 0),
            wht_amount: sgn * (d.wht_amount || 0),
            wht_rate: d.wht_rate ?? null,
            wht_certificate_no: d.wht_certificate_no || null,
            net_payable: sgn * (d.net_payable || 0),
            status: d.doc_type === "credit_note" ? "ลดหนี้" : "เพิ่มหนี้",
            is_paid: true,
            paid_at: d.paid_at || null,
          } as Transaction;
        });
      txns.push(...adjustmentTxns);
      txns.sort((a, b) => a.date.localeCompare(b.date));
      setTransactions(txns);

      // WHT sheet follows the selected period like every other export table;
      // the row set is shared with the `whtActual` summary figure.
      const whtTransactions: Transaction[] = whtDocs.map((d: any) => ({
        id: d.id,
        deal_id: d.deal_id || null,
        deal_number: d.deal_id ? dealMap.get(d.deal_id)?.deal_number || null : null,
        date: d.issue_date?.slice(0, 10) || d.created_at?.slice(0, 10) || "-",
        doc_number: d.doc_number || "-",
        doc_type: docTypeLabels[d.doc_type as string] || d.doc_type,
        doc_type_raw: d.doc_type,
        customer_name: d.customer?.name || "ไม่ระบุ",
        customer_tax_id: d.customer?.tax_id || null,
        customer_address: d.customer?.address || null,
        subtotal: d.subtotal || 0,
        vat_amount: d.vat_amount || 0,
        total_amount: d.total_amount || 0,
        wht_amount: d.wht_amount || 0,
        wht_rate: d.wht_rate ?? null,
        wht_certificate_no: d.wht_certificate_no || null,
        net_payable: d.net_payable || 0,
        status: getTransactionStatusLabel(d),
        is_paid: true,
        paid_at: d.paid_at || null,
      }));
      setWhtTransactions(whtTransactions);

      // COGS from stock auto_out. `created_at` is timestamptz, so the window is
      // expressed in Bangkok time (+07:00) — a bare date would shift the first
      // and last 7 hours of the period into the neighbouring month.
      const { data: cogsRows } = await supabase
        .from("stock_movements")
        .select("qty_base, unit_cost")
        .eq("user_id", userId)
        .eq("movement_type", "auto_out")
        .gte("created_at", `${start}T00:00:00+07:00`)
        .lte("created_at", `${end}T23:59:59.999+07:00`);

      const cogsTotal = (cogsRows || []).reduce((sum: number, row: any) => {
        return sum + Math.abs(row.qty_base || 0) * (row.unit_cost || 0);
      }, 0);
      setCogs(cogsTotal);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    summary,
    byType,
    monthly,
    monthlyTrend,
    topCustomers,
    arAging,
    arByCustomer,
    cogs,
    collectionRate,
    revenueDelta,
    transactions,
    whtTransactions,
    lineItems,
    arDetails,
    dealNotes,
    customerCreditTotal,
    loading,
    error,
    refetch: fetchData,
  };
}

export function useStockReport(userId: string | undefined, dateFrom: string, dateTo: string) {
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [lowStockItems, setLowStockItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [valuation, setValuation] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchAllRows<any>((from, to) =>
        supabase
          .from("items")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("id")
          .range(from, to),
      );

      const allItems = items as Item[];
      const activeItems = allItems.filter((i) => i.item_type === "product");
      const totalValue = activeItems.reduce((sum, i) => sum + (i.stock_value || 0), 0);
      const lowStock = activeItems.filter(
        (i) => i.stock_count > 0 && i.stock_count <= (i.low_stock_threshold || 5),
      );
      const outOfStock = activeItems.filter((i) => i.stock_count <= 0);

      setSummary({
        totalItems: activeItems.length,
        totalValue,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
      });

      setLowStockItems([...lowStock, ...outOfStock].slice(0, 50));

      setValuation(
        activeItems
          .filter((i) => (i.stock_count || 0) > 0 || (i.stock_value || 0) > 0)
          .sort((a, b) => (b.stock_value || 0) - (a.stock_value || 0))
          .slice(0, 20),
      );

      const { data: movementsData } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("user_id", userId)
        // Bangkok-time window (see the COGS note above) — `created_at` is UTC.
        .gte("created_at", `${dateFrom}T00:00:00+07:00`)
        .lte("created_at", `${dateTo}T23:59:59.999+07:00`)
        .order("created_at", { ascending: false })
        .limit(200);

      const itemMap = new Map(allItems.map((i) => [i.id, i]));
      const docIds = [
        ...new Set((movementsData || []).map((m: any) => m.document_id).filter(Boolean)),
      ];
      const docMap = new Map<string, string>();
      if (docIds.length > 0) {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, doc_number")
          .in("id", docIds);
        for (const d of (docs || []) as any[]) {
          docMap.set(d.id, d.doc_number || "-");
        }
      }

      const typeLabels: Record<string, string> = {
        manual_in: "รับสินค้าเข้า",
        auto_out: "ตัดสต็อกจากเอกสาร",
        manual_out: "ตัดสต็อกด้วยตนเอง",
        auto_in: "คืนสต็อกจากเอกสาร",
        return_in: "คืนสต็อก",
      };

      setMovements(
        ((movementsData || []) as any[]).map((m) => {
          const item = itemMap.get(m.item_id);
          return {
            id: m.id,
            date: m.created_at,
            itemName: item?.name || "ไม่พบสินค้า",
            itemSku: item?.sku || null,
            type: typeLabels[m.movement_type] || m.movement_type,
            typeKey: m.movement_type,
            qty: m.qty_base,
            balance: m.balance_after,
            unitCost: m.unit_cost ?? null,
            movementValue: m.movement_value ?? null,
            balanceValue: m.balance_value_after ?? null,
            reason: m.reason,
            docNumber: m.document_id ? docMap.get(m.document_id) || null : null,
            baseUnit: item?.base_unit || "ชิ้น",
            cartonUnit: item?.carton_unit || null,
            qtyPerCarton: item?.qty_per_carton || null,
          };
        }),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { summary, lowStockItems, movements, valuation, loading, error, refetch: fetchData };
}

const TYPE_LABELS_EXPORT: Record<string, string> = {
  manual_in: "รับสินค้าเข้า",
  auto_out: "ตัดสต็อกจากเอกสาร",
  manual_out: "ตัดสต็อกด้วยตนเอง",
  auto_in: "คืนสต็อกจากเอกสาร",
  return_in: "คืนสต็อก",
};

export interface FullStockReport {
  summary: StockSummary;
  lowStockItems: Item[];
  movements: StockMovementRow[];
  valuation: Item[];
}

export async function fetchFullStockReport(
  userId: string,
  dateFrom: string,
  dateTo: string,
): Promise<FullStockReport> {
  const items = await fetchAllRows<any>((from, to) =>
    supabase
      .from("items")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("id")
      .range(from, to),
  );

  const allItems = items as Item[];
  const activeItems = allItems.filter((i) => i.item_type === "product");
  const totalValue = activeItems.reduce((sum, i) => sum + (i.stock_value || 0), 0);
  const lowStock = activeItems.filter(
    (i) => i.stock_count > 0 && i.stock_count <= (i.low_stock_threshold || 5),
  );
  const outOfStock = activeItems.filter((i) => i.stock_count <= 0);

  const summary: StockSummary = {
    totalItems: activeItems.length,
    totalValue,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
  };

  const lowStockItems = [...lowStock, ...outOfStock];

  const valuation = activeItems
    .filter((i) => (i.stock_count || 0) > 0 || (i.stock_value || 0) > 0)
    .sort((a, b) => (b.stock_value || 0) - (a.stock_value || 0));

  const movementsData = await fetchAllRows<any>((from, to) =>
    supabase
      .from("stock_movements")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", `${dateFrom}T00:00:00+07:00`)
      .lte("created_at", `${dateTo}T23:59:59.999+07:00`)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const docIds = [...new Set(movementsData.map((m: any) => m.document_id).filter(Boolean))];
  const docMap = new Map<string, string>();
  if (docIds.length > 0) {
    const docs = await fetchAllRows<any>((from, to) =>
      supabase
        .from("documents")
        .select("id, doc_number")
        .in("id", docIds)
        .order("id")
        .range(from, to),
    );
    for (const d of docs) {
      docMap.set(d.id, d.doc_number || "-");
    }
  }

  const movements: StockMovementRow[] = movementsData.map((m) => {
    const item = itemMap.get(m.item_id);
    return {
      id: m.id,
      date: m.created_at,
      itemName: item?.name || "ไม่พบสินค้า",
      itemSku: item?.sku || null,
      type: TYPE_LABELS_EXPORT[m.movement_type] || m.movement_type,
      typeKey: m.movement_type,
      qty: m.qty_base,
      balance: m.balance_after,
      unitCost: m.unit_cost ?? null,
      movementValue: m.movement_value ?? null,
      balanceValue: m.balance_value_after ?? null,
      reason: m.reason,
      docNumber: m.document_id ? docMap.get(m.document_id) || null : null,
      baseUnit: item?.base_unit || "ชิ้น",
      cartonUnit: item?.carton_unit || null,
      qtyPerCarton: item?.qty_per_carton || null,
    };
  });

  return { summary, lowStockItems, movements, valuation };
}
