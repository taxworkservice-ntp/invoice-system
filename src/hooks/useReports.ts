import { useState, useEffect, useCallback } from "react";
import { STATUS_LABELS } from "../constants";
import { supabase } from "../lib/supabase";
import type { Document, DocumentLineItem, Item, StockMovement } from "../types";

export interface FinancialSummary {
  revenue: number;
  collected: number;
  whtWithheld: number;
  outstanding: number;
  vatCollected: number;
  docCount: number;
}

export interface RevenueByType {
  docType: string;
  label: string;
  count: number;
  total: number;
}

export interface MonthlyRevenue {
  month: string;
  year: number;
  total: number;
}

export interface TopCustomer {
  customerId: string;
  name: string;
  total: number;
  count: number;
}

export interface ARAgingBucket {
  label: string;
  total: number;
  count: number;
}

export interface ARByCustomer {
  customerId: string;
  name: string;
  total: number;
  count: number;
  oldestDue: string | null;
  daysOverdue: number;
}


export interface Transaction {
  id: string;
  deal_id: string | null;
  date: string;
  doc_number: string;
  doc_type: string;
  customer_name: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  wht_amount: number;
  net_payable: number;
  status: string;
  is_paid: boolean;
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

function getMonthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  const start = `${year}-${m}-01`;
  const end = `${year}-${m}-${new Date(year, month, 0).getDate()}`;
  return { start, end };
}

function getMonthsBack(count: number) {
  const months: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

function isRecognizedSalesDocument(doc: any, vatRegistered: boolean) {
  if (vatRegistered) {
    if (doc.doc_type === "tax_invoice_receipt" && (doc.status === "issued" || doc.status === "paid")) {
      return true;
    }
    if (doc.doc_type === "invoice" && !["draft", "voided", "converted"].includes(doc.status)) {
      return true;
    }
    return false;
  }
  return doc.doc_type === "receipt" && (doc.status === "generated" || doc.status === "paid" || doc.status === "issued");
}

function getRecognitionDate(doc: any) {
  if (doc.doc_type === "tax_invoice_receipt" || doc.doc_type === "invoice") {
    return (doc.issue_date || doc.paid_at || "").slice(0, 10);
  }
  return (doc.paid_at || doc.issue_date || "").slice(0, 10);
}

function getTransactionStatusLabel(doc: any) {
  if (doc.doc_type === "receipt" || doc.doc_type === "tax_invoice_receipt") {
    return STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] || doc.status;
  }

  const statusLabels: Record<string, string> = {
    paid: "ชำระแล้ว",
    generated: "รอชำระ",
    issued: "รอชำระ",
    sent: "รอชำระ",
    overdue: "เกินกำหนด",
  };

  return statusLabels[doc.status as string] || STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] || doc.status;
}

export function useFinancialReport(userId: string | undefined, year: number, month: number) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [byType, setByType] = useState<RevenueByType[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRevenue[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [arAging, setArAging] = useState<ARAgingBucket[]>([]);
  const [arByCustomer, setArByCustomer] = useState<ARByCustomer[]>([]);
  const [cogs, setCogs] = useState(0);
  const [collectionRate, setCollectionRate] = useState(0);
  const [revenueDelta, setRevenueDelta] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getMonthRange(year, month);

      const { data: clientProfile } = await supabase
        .from("client_profiles")
        .select("vat_registered")
        .eq("user_id", userId)
        .maybeSingle();
      const vatRegistered = Boolean(clientProfile?.vat_registered);

      const { data: allDocs } = await supabase
        .from("documents")
        .select("id, deal_id, doc_number, doc_type, status, subtotal, vat_amount, total_amount, net_payable, amount_received, wht_amount, paid_at, issue_date, due_date, customer_id, customer:customer_id(name)")
        .eq("user_id", userId)
        .neq("doc_type", "delivery_note")
        .neq("doc_type", "credit_note")
        .neq("status", "draft")
        .neq("status", "voided")
        .neq("status", "converted");

      const docs = (allDocs || []) as any[];

      const { data: bnLinks } = await supabase
        .from("billing_note_invoices")
        .select("invoice_id");
      const invoiceIdsInBn = new Set((bnLinks || []).map((l: any) => l.invoice_id));

      const recognizedSalesDocs = docs.filter((d) => isRecognizedSalesDocument(d, vatRegistered));

      const tirDealIds = vatRegistered
        ? new Set(
            docs
              .filter(
                (d) =>
                  d.doc_type === "tax_invoice_receipt" &&
                  (d.status === "issued" || d.status === "paid"),
              )
              .map((d) => d.deal_id as string)
              .filter(Boolean),
          )
        : new Set<string>();

      const dedupedSalesDocs = recognizedSalesDocs.filter((d) => {
        if (d.doc_type === "invoice" && d.deal_id && tirDealIds.has(d.deal_id)) return false;
        return true;
      });

      const paidThisPeriod = dedupedSalesDocs.filter((d) => {
        const recognitionDate = getRecognitionDate(d);
        return recognitionDate >= start && recognitionDate <= end;
      });

      const revenue = paidThisPeriod.reduce((sum, d) => sum + (d.total_amount || d.net_payable || 0), 0);
      const collected = paidThisPeriod.reduce((sum, d) => sum + (d.amount_received || d.net_payable || 0), 0);
      const whtWithheld = paidThisPeriod.reduce((sum, d) => sum + (d.wht_amount || 0), 0);
      const vatCollected = paidThisPeriod.reduce((sum, d) => sum + (d.vat_amount || 0), 0);

      const isArDoc = (d: any) =>
        (d.status === "sent" || d.status === "overdue" ||
          (d.doc_type === "tax_invoice_receipt" && d.status === "issued"));

      const outstanding = docs
        .filter(
          (d) =>
            isArDoc(d) &&
            !(d.doc_type === "invoice" && invoiceIdsInBn.has(d.id)),
        )
        .reduce((sum, d) => sum + (d.net_payable || 0), 0);

      setSummary({
        revenue,
        collected,
        whtWithheld,
        outstanding,
        vatCollected,
        docCount: paidThisPeriod.length,
      });

      const typeMap = new Map<string, { count: number; total: number }>();
      for (const d of paidThisPeriod) {
        const t = d.doc_type as string;
        const existing = typeMap.get(t) || { count: 0, total: 0 };
        existing.count++;
        existing.total += d.total_amount || d.net_payable || 0;
        typeMap.set(t, existing);
      }
      setByType(
        Array.from(typeMap.entries())
          .map(([docType, { count, total }]) => ({ docType, label: "", count, total }))
          .sort((a, b) => b.total - a.total)
      );

      const months = getMonthsBack(6);
      const monthlyData: MonthlyRevenue[] = [];
      for (const m of months) {
        const { start: ms, end: me } = getMonthRange(m.year, m.month);
        const inMonth = dedupedSalesDocs.filter((d) => {
          const recognitionDate = getRecognitionDate(d);
          return recognitionDate >= ms && recognitionDate <= me;
        });
        monthlyData.push({
          month: `${m.month}`.padStart(2, "0"),
          year: m.year,
          total: inMonth.reduce((sum, d) => sum + (d.total_amount || d.net_payable || 0), 0),
        });
      }
      setMonthly(monthlyData);

      const custMap = new Map<string, { name: string; total: number; count: number }>();
      for (const d of paidThisPeriod) {
        const cid = d.customer_id as string;
        const cname = d.customer?.name || "ไม่ระบุ";
        const existing = custMap.get(cid) || { name: cname, total: 0, count: 0 };
        existing.total += d.total_amount || d.net_payable || 0;
        existing.count++;
        custMap.set(cid, existing);
      }
      setTopCustomers(
        Array.from(custMap.entries())
          .map(([customerId, { name, total, count }]) => ({ customerId, name, total, count }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10)
      );

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const overdueDocs = docs.filter(
        (d) =>
          isArDoc(d) &&
          !(d.doc_type === "invoice" && invoiceIdsInBn.has(d.id))
      );
      const buckets: ARAgingBucket[] = [
        { label: "1-30 วัน", total: 0, count: 0 },
        { label: "31-60 วัน", total: 0, count: 0 },
        { label: "61-90 วัน", total: 0, count: 0 },
        { label: "90+ วัน", total: 0, count: 0 },
      ];
      for (const d of overdueDocs) {
        if (!d.due_date) {
          buckets[buckets.length - 1].total += d.net_payable || 0;
          buckets[buckets.length - 1].count++;
          continue;
        }
        const due = new Date(d.due_date);
        const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) continue;
        const idx = diffDays <= 30 ? 0 : diffDays <= 60 ? 1 : diffDays <= 90 ? 2 : 3;
        buckets[idx].total += d.net_payable || 0;
        buckets[idx].count++;
      }
      setArAging(buckets);

      // Customer-level AR
      const arMap = new Map<string, { customerId: string; name: string; total: number; count: number; oldestDue: string | null }>();
      for (const d of overdueDocs) {
        if (!d.customer_id) continue;
        const cid = d.customer_id as string;
        const cname = d.customer?.name || "ไม่ระบุ";
        const existing = arMap.get(cid) || { customerId: cid, name: cname, total: 0, count: 0, oldestDue: d.due_date || null };
        existing.total += d.net_payable || 0;
        existing.count++;
        if (d.due_date && (!existing.oldestDue || d.due_date < existing.oldestDue)) {
          existing.oldestDue = d.due_date;
        }
        arMap.set(cid, existing);
      }
      setArByCustomer(
        Array.from(arMap.values())
          .map((c) => {
            const daysOverdue = c.oldestDue
              ? Math.floor((today.getTime() - new Date(c.oldestDue).getTime()) / (1000 * 60 * 60 * 24))
              : 0;
            return { ...c, daysOverdue: daysOverdue > 0 ? daysOverdue : 0 };
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 20)
      );

      // Transaction-level detail table
      const docTypeLabels: Record<string, string> = {
        invoice: vatRegistered ? "ใบกำกับภาษี" : "ใบแจ้งหนี้",
        tax_invoice_receipt: "ใบกำกับภาษี/ใบเสร็จรับเงิน",
        billing_note: "ใบวางบิล",
        receipt: "ใบเสร็จรับเงิน",
      };
      const txns: Transaction[] = paidThisPeriod.map((d: any) => ({
        id: d.id,
        deal_id: d.deal_id || null,
        date: getRecognitionDate(d),
        doc_number: d.doc_number || "-",
        doc_type: docTypeLabels[d.doc_type as string] || d.doc_type,
        customer_name: d.customer?.name || "ไม่ระบุ",
        subtotal: d.subtotal || 0,
        vat_amount: d.vat_amount || 0,
        total_amount: d.total_amount || 0,
        wht_amount: d.wht_amount || 0,
        net_payable: d.net_payable || 0,
        status: getTransactionStatusLabel(d),
        is_paid: d.status === "paid" || d.doc_type === "receipt" || d.doc_type === "tax_invoice_receipt",
      }));
      setTransactions(txns);

      // MoM revenue delta
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const prevMonthData = monthlyData.find((m) => parseInt(m.month, 10) === prevM && m.year === prevY);
      setRevenueDelta(prevMonthData && prevMonthData.total > 0 ? ((revenue - prevMonthData.total) / prevMonthData.total) * 100 : null);

      // COGS from stock auto_out
      const { data: cogsRows } = await supabase
        .from("stock_movements")
        .select("qty_base, unit_cost")
        .eq("user_id", userId)
        .eq("movement_type", "auto_out")
        .gte("created_at", start)
        .lte("created_at", end + "T23:59:59");

      const cogsTotal = (cogsRows || []).reduce((sum: number, row: any) => {
        return sum + Math.abs(row.qty_base || 0) * (row.unit_cost || 0);
      }, 0);
      setCogs(cogsTotal);

      // Collection rate
      const rate = collected + outstanding > 0 ? collected / (collected + outstanding) : 0;
      setCollectionRate(rate);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { summary, byType, monthly, topCustomers, arAging, arByCustomer, cogs, collectionRate, revenueDelta, transactions, loading, error, refetch: fetchData };
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
      const { data: items } = await supabase
        .from("items")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      const allItems = (items || []) as Item[];
      const activeItems = allItems.filter((i) => i.item_type === "product");
      const totalValue = activeItems.reduce((sum, i) => sum + (i.stock_value || 0), 0);
      const lowStock = activeItems.filter((i) => i.stock_count > 0 && i.stock_count <= (i.low_stock_threshold || 5));
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
          .slice(0, 20)
      );

      const { data: movementsData } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(200);

      const itemMap = new Map(allItems.map((i) => [i.id, i]));
      const docIds = [...new Set((movementsData || []).map((m: any) => m.document_id).filter(Boolean))];
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
        })
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
  const { data: items } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  const allItems = (items || []) as Item[];
  const activeItems = allItems.filter((i) => i.item_type === "product");
  const totalValue = activeItems.reduce((sum, i) => sum + (i.stock_value || 0), 0);
  const lowStock = activeItems.filter((i) => i.stock_count > 0 && i.stock_count <= (i.low_stock_threshold || 5));
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

  let movementsData: any[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo + "T23:59:59")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    movementsData = movementsData.concat(batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  const docIds = [...new Set(movementsData.map((m: any) => m.document_id).filter(Boolean))];
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
