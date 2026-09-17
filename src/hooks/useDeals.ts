import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { isReceivableDoc, receivableAmount } from "../lib/receivable";
import { fetchAllRows } from "../lib/fetchAllRows";
import type { Document, SummaryMetrics, DealCardData } from "../types";

export function useDeals(userId: string | undefined) {
  const [meta, setMeta] = useState<SummaryMetrics>({ unpaid: 0, receivedThisMonth: 0, overdue: 0 });
  const [activeDeals, setActiveDeals] = useState<DealCardData[]>([]);
  const [recentDeals, setRecentDeals] = useState<DealCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Bangkok-time month boundary for "received this month".
    const nowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
      new Date(),
    );
    const monthStart = `${nowStr.slice(0, 7)}-01`;

    // Every document of the workspace, paged — an unpaged select would be
    // silently capped at 1000 rows and quietly drop deals.
    let docs: Array<Record<string, unknown>> = [];
    let paidMonth: Array<{ net_payable: number }> = [];
    try {
      const [fetchedDocs, paidResult] = await Promise.all([
        fetchAllRows<Record<string, unknown>>((from, to) =>
          supabase
            .from("documents")
            .select(
              "id, deal_id, doc_type, doc_number, status, total_amount, net_payable, amount_received, customer_id, created_at, updated_at, customer:customer_id(name)",
            )
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .order("id")
            .range(from, to),
        ),
        supabase
          .from("documents")
          .select("net_payable")
          .eq("user_id", userId)
          .eq("status", "paid")
          .neq("doc_type", "credit_note")
          .gte("updated_at", monthStart),
      ]);
      if (paidResult.error) throw new Error(paidResult.error.message);
      docs = fetchedDocs;
      paidMonth = (paidResult.data || []) as Array<{ net_payable: number }>;
    } catch {
      setLoading(false);
      return;
    }

    const docsWithCustomers = docs as unknown as Array<Document & { customer: { name: string } }>;

    // Outstanding AR: open invoices / billing notes net of what has been
    // received, plus their adjustment notes. Previously this only counted
    // status `sent` and ignored receipts, so overdue and partially-paid
    // invoices were missing from the figure.
    const unpaid = docsWithCustomers
      .filter(isReceivableDoc)
      .reduce((sum, d) => sum + receivableAmount(d), 0);

    const received = paidMonth.reduce(
      (s: number, d: { net_payable: number }) => s + (d.net_payable || 0),
      0,
    );

    const overdueCount = docsWithCustomers.filter((d) => d.status === "overdue").length;

    setMeta({
      unpaid,
      receivedThisMonth: received,
      overdue: overdueCount,
    });

    const dealMap = new Map<string, { docs: DealCardData[]; maxDate: string }>();
    for (const d of docsWithCustomers) {
      const dealId = d.deal_id || d.id;
      const stage = getStage(d.doc_type, d.status);
      if (!dealMap.has(dealId) || d.updated_at > dealMap.get(dealId)!.maxDate) {
        dealMap.set(dealId, { docs: [], maxDate: d.updated_at });
      }
      dealMap.get(dealId)!.docs.push({
        deal_id: dealId,
        customer_name: (d as any).customer?.name || "",
        item_summary: "",
        amount: d.total_amount || d.net_payable,
        status: d.status,
        stage,
        doc_type: d.doc_type,
        document_id: d.id,
        doc_number: d.doc_number,
        updated_at: d.updated_at,
      });
    }

    const dealGroups = Array.from(dealMap.values()).map((value) =>
      [...value.docs].sort((a, b) => a.updated_at.localeCompare(b.updated_at)),
    );

    const active = dealGroups
      .filter((docs) => !isDealResolved(docs))
      .map((docs) => getLatestUnresolvedDoc(docs) || docs[docs.length - 1])
      .filter((doc): doc is DealCardData => Boolean(doc))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

    const recent = dealGroups
      .map((docs) => getCompletionDoc(docs))
      .filter((doc): doc is DealCardData => Boolean(doc))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);

    setActiveDeals(active);
    setRecentDeals(recent);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { meta, activeDeals, recentDeals, loading, refetch: fetch };
}

function hasPartial(docs: DealCardData[]) {
  return docs.some((doc) => doc.status === "partially_paid");
}

function getStage(docType: string, status: string): "quote" | "invoice" | "collect" | "done" {
  if (docType === "quotation") return "quote";
  if (docType === "credit_note") return status === "draft" ? "collect" : "done";
  if (docType === "invoice" && status !== "paid" && status !== "partially_paid") return "invoice";
  if (docType === "billing_note" && status !== "paid" && status !== "partially_paid")
    return "collect";
  if (status === "paid" || status === "generated") return "done";
  if (status === "partially_paid") return "collect";
  if (docType === "receipt") return status === "draft" ? "collect" : "done";
  if (docType === "delivery_note") return status === "draft" ? "collect" : "done";
  return "invoice";
}

function isResolvedDoc(doc: DealCardData) {
  return ["paid", "voided", "converted", "generated", "issued"].includes(doc.status);
}

function getCompletionDoc(docs: DealCardData[]) {
  const nonVoided = docs.filter((doc) => doc.status !== "voided");
  const isPartial = hasPartial(nonVoided);

  const receipt = [...nonVoided]
    .reverse()
    .find(
      (doc) => doc.doc_type === "receipt" && ["generated", "issued", "paid"].includes(doc.status),
    );
  if (receipt && !isPartial) return receipt;

  const paidBilling = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "billing_note" && doc.status === "paid");
  if (paidBilling && !isPartial) return paidBilling;

  const paidInvoice = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "invoice" && doc.status === "paid");
  if (paidInvoice && !isPartial) return paidInvoice;

  return null;
}

function getLatestUnresolvedDoc(docs: DealCardData[]) {
  return [...docs].reverse().find((doc) => !isResolvedDoc(doc));
}

function isDealResolved(docs: DealCardData[]) {
  return Boolean(getCompletionDoc(docs)) || docs.every((doc) => isResolvedDoc(doc));
}
