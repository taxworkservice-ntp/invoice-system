import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Deal, Customer, Document, SummaryMetrics, DealCardData, DocumentStatus } from "../types";

export function useDeals(userId: string | undefined) {
  const [meta, setMeta] = useState<SummaryMetrics>({ unpaid: 0, receivedThisMonth: 0, overdue: 0 });
  const [activeDeals, setActiveDeals] = useState<DealCardData[]>([]);
  const [recentDeals, setRecentDeals] = useState<DealCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const [{ data: docs, error }, { data: paidMonth }] = await Promise.all([
      supabase
        .from("documents")
        .select("id, deal_id, doc_type, doc_number, status, net_payable, customer_id, created_at, updated_at, customer:customer_id(name)")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("documents")
        .select("net_payable")
        .eq("user_id", userId)
        .eq("status", "paid")
        .gte("updated_at", monthStart),
    ]);

    if (error) {
      setLoading(false);
      return;
    }

    const docsWithCustomers = (docs || []) as unknown as Array<Document & { customer: { name: string } }>;

    const unpaid = docsWithCustomers
      .filter((d) => d.status === "sent")
      .reduce((s, d) => s + d.net_payable, 0);

    const received = (paidMonth || []).reduce((s: number, d: { net_payable: number }) => s + (d.net_payable || 0), 0);

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
        amount: d.net_payable,
        status: d.status,
        stage,
        doc_type: d.doc_type,
        document_id: d.id,
        doc_number: d.doc_number,
        updated_at: d.updated_at,
      });
    }

    const dealGroups = Array.from(dealMap.values()).map((value) =>
      [...value.docs].sort((a, b) => a.updated_at.localeCompare(b.updated_at))
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

function getStage(docType: string, status: string): "quote" | "invoice" | "collect" | "done" {
  if (docType === "quotation") return "quote";
  if (docType === "tax_invoice_receipt") return "done";
  if (docType === "invoice" && status !== "paid") return "invoice";
  if (docType === "billing_note" && status !== "paid") return "collect";
  if (status === "paid" || status === "generated") return "done";
  if (docType === "receipt" || docType === "delivery_note" || docType === "credit_note") return "done";
  return "invoice";
}

function isResolvedDoc(doc: DealCardData) {
  return ["paid", "voided", "converted", "generated", "issued"].includes(doc.status);
}

function getLatestUnresolvedDoc(docs: DealCardData[]) {
  return [...docs].reverse().find((doc) => !isResolvedDoc(doc));
}

function getCompletionDoc(docs: DealCardData[]) {
  const nonVoided = docs.filter((doc) => doc.status !== "voided");

  const receipt = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "receipt" && ["generated", "issued", "paid"].includes(doc.status));
  if (receipt) return receipt;

  const combined = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "tax_invoice_receipt" && ["issued", "paid"].includes(doc.status));
  if (combined) return combined;

  const paidBilling = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "billing_note" && doc.status === "paid");
  if (paidBilling) return paidBilling;

  const paidInvoice = [...nonVoided]
    .reverse()
    .find((doc) => doc.doc_type === "invoice" && doc.status === "paid");
  if (paidInvoice) return paidInvoice;

  return null;
}

function isDealResolved(docs: DealCardData[]) {
  return Boolean(getCompletionDoc(docs)) || docs.every((doc) => isResolvedDoc(doc));
}
