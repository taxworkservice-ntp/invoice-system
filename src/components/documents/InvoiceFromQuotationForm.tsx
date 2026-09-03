import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, FileStack, Trash2 } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { DocumentOptionsCard, DocumentOptionRow } from "./DocumentOptions";
import { FormStep } from "./FormStep";
import { FormActionBar } from "./FormActionBar";
import { LineGridHeaderRow, LINE_GRID_COLS, numericInputClass } from "./lineGrid";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { DateInput } from "../ui/DateInput";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { CustomerPickerModal } from "../customers/CustomerPickerModal";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useCustomers } from "../../hooks/useCustomers";
import { useCustomerReferenceHistory } from "../../hooks/useCustomerReferenceHistory";
import { useToast } from "../../hooks/useToast";
import { supabase } from "../../lib/supabase";
import { resolveDocNumber } from "../../lib/docNumber";
import { businessTodayString, localTodayString } from "../../lib/devDate";
import { calculateTax } from "../../lib/tax";
import { formatBuddhistDate } from "../../lib/dates";
import { formatCurrency } from "../../lib/format";
import { deductStockOnDocumentSent, restoreStockOnVoid } from "../../lib/stock";
import { WHT_RATE_OPTIONS, VAT_DEFAULT } from "../../constants";
import type { Customer, Document, DocumentLineItem, DocumentStatus, WhtRate } from "../../types";
import { EditableDocNumber } from "./EditableDocNumber";
import { PoTaskFields } from "./PoTaskFields";

const EPS = 1e-9;

function trimQty(value: number) {
  return String(Number((Number(value) || 0).toFixed(3)));
}
const MANUAL_MAX = 1e9;

type QtLineWithRemaining = DocumentLineItem & {
  quotedQty: number;
  billedQty: number;
  remaining: number;
};

type QuotationOption = Omit<Document, "line_items"> & {
  line_items: QtLineWithRemaining[];
  hasBillable: boolean;
};

type EditableInvoiceLine = {
  key: string;
  source_document_id: string;
  source_line_item_id: string;
  qtDocNumber: string;
  item_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  line_note: string;
  item_sku: string | null;
  item_type: string;
  discount_percent: number;
  discount_amount: number;
  qty_carton: number | null;
  carton_unit: string | null;
  base_quantity: number | null;
  quotedQty: number;
  billedQty: number;
  maxQty: number;
  qtUnitPrice: number;
};

function defaultQuotationStartString(today = localTodayString()) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 90);
  return localTodayString(date);
}

type QuotationDatePreset = "thisMonth" | "previousMonth" | "last90Days" | "all" | "custom";

function monthRange(today: string, offset: number) {
  const [year, month] = today.split("-").map(Number);
  const start = new Date(year, month - 1 + offset, 1);
  const end = new Date(year, month + offset, 0);
  return { from: localTodayString(start), to: localTodayString(end) };
}

function buildItemSummary(items: DocumentLineItem[]) {
  if (!items.length) return "ไม่มีรายการ";
  const summary = items.slice(0, 2).map((item) => `${item.item_name} × ${item.quantity}`).join(", ");
  return items.length > 2 ? `${summary} และอีก ${items.length - 2} รายการ` : summary;
}

function getQuotationSubtotal(qt: QuotationOption) {
  const subtotal = Number(qt.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
  return qt.line_items.reduce((sum, l) => sum + Number(l.line_total || 0), 0);
}

function getQuotationTotal(qt: QuotationOption) {
  const total = Number(qt.total_amount);
  if (Number.isFinite(total) && total > 0) return total;
  return getQuotationSubtotal(qt);
}

function lineNetAmount(l: EditableInvoiceLine) {
  const base = (Number(l.unit_price) || 0) * (Number(l.quantity) || 0);
  const discount = l.discount_percent > 0 ? (base * l.discount_percent) / 100 : Number(l.discount_amount) || 0;
  return Math.max(0, base - discount);
}

export function InvoiceFromQuotationForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedQtId = searchParams.get("quotationId");
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;
  const { customers, loading: customersLoading, addCustomer } = useCustomers(userId);
  const toast = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<QuotationDatePreset>("all");
  const [dateExpanded, setDateExpanded] = useState(false);
  const [issueDate, setIssueDate] = useState(() => businessTodayString(clientProfile));
  const [whtRate, setWhtRate] = useState<WhtRate>("0");
  const [note, setNote] = useState("");
  // Optional PO reference + task name, printed on the tax invoice.
  const [customerPo, setCustomerPo] = useState("");
  const [taskName, setTaskName] = useState("");
  // Tracks the last value derived from the selected quotations so manual
  // edits survive selection changes while untouched fields keep following.
  const derivedPoTaskRef = useRef({ po: "", task: "" });

  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const referenceHistory = useCustomerReferenceHistory(selectedCustomerId || null);
  const [invoiceLines, setInvoiceLines] = useState<EditableInvoiceLine[]>([]);
  const [loadingQts, setLoadingQts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [showVariance, setShowVariance] = useState(false);
  // Ref mode: one printed line per source quotation instead of item detail.
  const [refOnlyMode, setRefOnlyMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("invoice-system.invoiceRefOnly") !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem("invoice-system.invoiceRefOnly", String(refOnlyMode));
  }, [refOnlyMode]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (clientProfile) {
      setWhtRate(clientProfile.default_wht_rate);
    }
  }, [clientProfile]);

  useEffect(() => {
    const realToday = businessTodayString(null);
    if (dateTo === realToday) setDateTo(businessToday);
    if (issueDate === realToday) setIssueDate(businessToday);
    if (dateFrom === defaultQuotationStartString(realToday)) {
      setDateFrom(defaultQuotationStartString(businessToday));
    }
  }, [businessToday, dateFrom, dateTo, issueDate]);

  useEffect(() => {
    if (!preselectedQtId || !userId) return;

    let cancelled = false;
    async function loadPreselectedQuotation() {
      const { data: qt } = await supabase
        .from("documents")
        .select("id, customer_id")
        .eq("id", preselectedQtId)
        .eq("user_id", userId)
        .eq("doc_type", "quotation")
        .eq("status", "sent")
        .maybeSingle();

      if (!cancelled && qt?.customer_id) {
        setSelectedCustomerId(qt.customer_id);
      }
    }

    loadPreselectedQuotation();
    return () => {
      cancelled = true;
    };
  }, [preselectedQtId, userId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const dateRangeSummary = (() => {
    if (datePreset === "all") return "ทั้งหมด (แสดงทุกใบเสนอราคา)";
    if (datePreset === "custom") return `ตั้งแต่ ${dateFrom || "-"} ถึง ${dateTo || "-"}`;
    const presetLabels: Record<Exclude<QuotationDatePreset, "all" | "custom">, string> = {
      thisMonth: "เดือนนี้",
      previousMonth: "เดือนก่อน",
      last90Days: "ย้อนหลัง 90 วัน",
    };
    return presetLabels[datePreset];
  })();

  useEffect(() => {
    if (!selectedCustomerId || !userId) {
      setQuotations([]);
      setSelectedIds(new Set());
      return;
    }

    let cancelled = false;
    async function loadQuotations() {
      setLoadingQts(true);
      setError("");

      let query = supabase
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .eq("customer_id", selectedCustomerId)
        .eq("doc_type", "quotation")
        .eq("status", "sent")
        .order("issue_date", { ascending: true });

      if (dateFrom) query = query.gte("issue_date", dateFrom);
      if (dateTo) query = query.lte("issue_date", dateTo);

      const { data: docs, error: docsError } = await query;

      if (docsError) {
        if (!cancelled) setError(docsError.message);
        if (!cancelled) setLoadingQts(false);
        return;
      }

      let docList = (docs || []) as QuotationOption[];
      if (preselectedQtId && !docList.some((doc) => doc.id === preselectedQtId)) {
        const { data: preselectedDoc } = await supabase
          .from("documents")
          .select("*")
          .eq("id", preselectedQtId)
          .eq("user_id", userId)
          .eq("customer_id", selectedCustomerId)
          .eq("doc_type", "quotation")
          .eq("status", "sent")
          .maybeSingle();
        if (preselectedDoc) {
          docList = [...docList, preselectedDoc as QuotationOption].sort((a, b) =>
            (a.issue_date || "").localeCompare(b.issue_date || ""),
          );
        }
      }
      const docIds = docList.map((doc) => doc.id);

      const { data: lineItems } = await Promise.resolve(
        docIds.length
          ? supabase.from("document_line_items").select("*").in("document_id", docIds).order("sort_order", { ascending: true })
          : Promise.resolve({ data: [] as DocumentLineItem[] }),
      );

      if (cancelled) return;

      // Quoted vs already-billed per quotation line (keyed by qt::line).
      const linesByDoc = new Map<string, DocumentLineItem[]>();
      ((lineItems || []) as DocumentLineItem[]).forEach((line) => {
        const current = linesByDoc.get(line.document_id) || [];
        current.push(line);
        linesByDoc.set(line.document_id, current);
      });

      // Billed quantity = sum of invoice line items that reference each quotation
      // line, excluding voided/draft invoices.
      const refPairs = ((lineItems || []) as DocumentLineItem[])
        .filter((l) => l.id)
        .map((l) => ({ qtId: l.document_id, lineId: l.id }));
      const qtLineIds = refPairs.map((p) => p.lineId);
      const qtIds = refPairs.map((p) => p.qtId);

      let billedByLine = new Map<string, number>();
      if (qtLineIds.length) {
        const { data: invLines } = await supabase
          .from("document_line_items")
          .select("source_document_id, source_line_item_id, quantity, document_id")
          .in("source_line_item_id", qtLineIds)
          .in("source_document_id", qtIds);
        const invIds = Array.from(new Set(((invLines || []) as any[]).map((r) => r.document_id).filter(Boolean)));
        let validInvIds = new Set<string>();
        if (invIds.length) {
          const { data: invDocs } = await supabase
            .from("documents")
            .select("id, doc_type, status")
            .in("id", invIds);
          validInvIds = new Set(
            ((invDocs || []) as { id: string; doc_type: string; status: string }[])
              .filter((d) => d.doc_type === "invoice" && d.status !== "voided" && d.status !== "draft")
              .map((d) => d.id),
          );
        }
        ((invLines || []) as any[]).forEach((r) => {
          if (!validInvIds.has(r.document_id)) return;
          const key = `${r.source_document_id}::${r.source_line_item_id}`;
          billedByLine.set(key, (billedByLine.get(key) || 0) + Number(r.quantity || 0));
        });
      }

      const options = docList
        .map((doc) => {
          const lines = (linesByDoc.get(doc.id) || []).map((line) => ({
            ...line,
            quotedQty: Number(line.quantity) || 0,
            billedQty: billedByLine.get(`${doc.id}::${line.id}`) || 0,
            remaining: (Number(line.quantity) || 0) - (billedByLine.get(`${doc.id}::${line.id}`) || 0),
          }));
          return {
            ...doc,
            line_items: lines,
            hasBillable: lines.some((l) => l.remaining > EPS),
          } as QuotationOption;
        })
        .filter((doc) => doc.hasBillable);

      if (cancelled) return;

      setQuotations(options);
      setSelectedIds(
        preselectedQtId && options.some((doc) => doc.id === preselectedQtId)
          ? new Set([preselectedQtId])
          : new Set(options.map((doc) => doc.id)),
      );
      setLoadingQts(false);
    }

    loadQuotations();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, preselectedQtId, selectedCustomerId, userId]);

  const selectedQuotations = useMemo(
    () => quotations.filter((doc) => selectedIds.has(doc.id)),
    [quotations, selectedIds],
  );

  // Flow-down: follow the first selected quotation's PO/task until the user
  // edits the field manually (manual edits survive selection changes).
  const selectedQtIdsKey = selectedQuotations.map((qt) => qt.id).join(",");
  useEffect(() => {
    const first = selectedQuotations[0];
    const po = first?.customer_po_number || "";
    const task = first?.task_name || "";
    setCustomerPo((current) =>
      current === derivedPoTaskRef.current.po || current === "" ? po : current,
    );
    setTaskName((current) =>
      current === derivedPoTaskRef.current.task || current === "" ? task : current,
    );
    derivedPoTaskRef.current = { po, task };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQtIdsKey]);

  // Rebuild editable invoice lines from the selected quotations, preserving
  // any manual edits the user already made to lines that are still present.
  useEffect(() => {
    setInvoiceLines((prev) => {
      // Keep any manually-added lines (not linked to a quotation) untouched.
      const manualLines = prev.filter((l) => !l.source_document_id);
      const prevByKey = new Map(
        prev.filter((l) => l.source_document_id).map((l) => [`${l.source_document_id}::${l.source_line_item_id}`, l]),
      );
      const next: EditableInvoiceLine[] = [...manualLines];
      for (const qt of selectedQuotations) {
        for (const l of qt.line_items) {
          if (l.remaining <= EPS) continue;
          const key = `${qt.id}::${l.id}`;
          const existing = prevByKey.get(key);
          if (existing) {
            next.push({ ...existing, maxQty: l.remaining, quantity: Math.min(existing.quantity, l.remaining) });
          } else {
            next.push({
              key,
              source_document_id: qt.id,
              source_line_item_id: l.id || "",
              qtDocNumber: qt.doc_number || qt.id.slice(0, 8),
              item_name: l.item_name,
              unit: l.unit || "ชิ้น",
              unit_price: Number(l.unit_price) || 0,
              quantity: l.remaining,
              line_note: l.line_note || "",
              item_sku: l.item_sku || null,
              item_type: l.item_type || "product",
              discount_percent: Number(l.discount_percent) || 0,
              discount_amount: Number(l.discount_amount) || 0,
              qty_carton: l.qty_carton ? Number(l.qty_carton) : null,
              carton_unit: l.carton_unit || null,
              base_quantity: l.base_quantity ? Number(l.base_quantity) : null,
              quotedQty: l.quotedQty,
              billedQty: l.billedQty,
              maxQty: l.remaining,
              qtUnitPrice: Number(l.unit_price) || 0,
            });
          }
        }
      }
      return next;
    });
  }, [selectedQuotations]);

  const selectedDealId = useMemo(() => {
    const dealIds = Array.from(new Set(selectedQuotations.map((doc) => doc.deal_id).filter(Boolean)));
    return dealIds.length === 1 ? dealIds[0] : null;
  }, [selectedQuotations]);

  const selectedDealIds = useMemo(
    () => Array.from(new Set(selectedQuotations.map((doc) => doc.deal_id).filter(Boolean))),
    [selectedQuotations],
  );

  const hasMixedDeals = selectedDealIds.length > 1;

  const taxSnapshot = useMemo(() => {
    if (selectedQuotations.length === 0) {
      return {
        vatRegistered: clientProfile?.vat_registered ?? false,
        vatRate: clientProfile?.vat_rate ?? VAT_DEFAULT,
        mixed: false,
      };
    }

    const first = selectedQuotations[0];
    const mixed = selectedQuotations.some(
      (doc) => doc.vat_registered !== first.vat_registered || Number(doc.vat_rate) !== Number(first.vat_rate),
    );

    return {
      vatRegistered: first.vat_registered,
      vatRate: first.vat_rate ?? VAT_DEFAULT,
      mixed,
    };
  }, [clientProfile?.vat_rate, clientProfile?.vat_registered, selectedQuotations]);

  const billableLines = useMemo(() => invoiceLines.filter((l) => l.quantity > EPS), [invoiceLines]);

  // Ref-mode summary: one row per source quotation with its billed total.
  const refGroups = useMemo(() => {
    const qtById = new Map(selectedQuotations.map((qt) => [qt.id, qt]));
    const groups: { key: string; label: string; dateLabel: string; total: number; lineCount: number }[] = [];
    for (const l of billableLines) {
      if (!l.source_document_id) continue;
      let group = groups.find((g) => g.key === l.source_document_id);
      if (!group) {
        const qt = qtById.get(l.source_document_id);
        group = {
          key: l.source_document_id,
          label: `ใบเสนอราคา ${l.qtDocNumber}`,
          dateLabel: qt?.issue_date ? formatBuddhistDate(qt.issue_date) : "",
          total: 0,
          lineCount: 0,
        };
        groups.push(group);
      }
      group.total += lineNetAmount(l);
      group.lineCount += 1;
    }
    return groups;
  }, [billableLines, selectedQuotations]);

  const tax = useMemo(() => {
    return calculateTax(
      billableLines.map((l) => ({
        unit_price: l.unit_price,
        quantity: l.quantity,
        discount_percent: l.discount_percent,
        discount_amount: l.discount_amount,
      })),
      taxSnapshot.vatRegistered,
      taxSnapshot.vatRate,
      parseFloat(whtRate),
    );
  }, [billableLines, taxSnapshot.vatRate, taxSnapshot.vatRegistered, whtRate]);

  const toggleQt = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateLine = (key: string, patch: Partial<EditableInvoiceLine>) => {
    setInvoiceLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addManualLine = () => {
    setInvoiceLines((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${prev.length}`,
        source_document_id: "",
        source_line_item_id: "",
        qtDocNumber: "รายการเพิ่มเติม",
        item_name: "",
        unit: "ชิ้น",
        unit_price: 0,
        quantity: 1,
        line_note: "",
        item_sku: null,
        item_type: "product",
        discount_percent: 0,
        discount_amount: 0,
        qty_carton: null,
        carton_unit: null,
        base_quantity: null,
        quotedQty: 0,
        billedQty: 0,
        maxQty: MANUAL_MAX,
        qtUnitPrice: 0,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setInvoiceLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    if (!userId || !selectedCustomer || selectedQuotations.length === 0) return;
    if (hasMixedDeals) {
      setError("กรุณาแยกออกบิลตามงานขาย ไม่สามารถรวมเอกสารจากหลายงานขายได้");
      return;
    }
    if (billableLines.length === 0) {
      setError("ยังไม่มีรายการที่จะออกบิล (ระบุจำนวนที่มากกว่า 0)");
      return;
    }

    // Guardrail: never bill more than the remaining (quoted - already billed) qty.
    for (const l of billableLines) {
      if (l.quantity > l.maxQty + EPS) {
        setError(`จำนวนที่จะออกบิลของ "${l.item_name}" มากกว่ายอดคงเหลือ (${l.maxQty})`);
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      const lineRecords: any[] = [];
      let sortIndex = 0;
      for (const qt of selectedQuotations) {
        const groupLines = invoiceLines.filter((il) => il.source_document_id === qt.id && il.quantity > EPS);

        if (refOnlyMode && groupLines.length > 0) {
          // Ref mode: one printed line per quotation carrying its billed total.
          const groupTotal = groupLines.reduce((sum, l) => sum + lineNetAmount(l), 0);
          lineRecords.push({
            item_id: null,
            item_name: `ใบเสนอราคา ${qt.doc_number || qt.id.slice(0, 8)}`,
            line_note: [
              qt.issue_date ? `วันที่เสนอราคา: ${formatBuddhistDate(qt.issue_date)}` : null,
              `รายการ ${groupLines.length} บรรทัด`,
            ]
              .filter(Boolean)
              .join(" · "),
            item_sku: null,
            item_type: "service",
            unit: "",
            unit_price: groupTotal,
            quantity: 1,
            base_quantity: null,
            discount_percent: 0,
            discount_amount: 0,
            qty_carton: null,
            carton_unit: null,
            line_total: groupTotal,
            source_document_id: qt.id,
            source_line_item_id: null,
            sort_order: sortIndex++,
          });
          continue;
        }

        lineRecords.push({
          item_id: null,
          item_name: `ใบเสนอราคา ${qt.doc_number || qt.id.slice(0, 8)}`,
          line_note: qt.issue_date ? `วันที่เสนอราคา: ${formatBuddhistDate(qt.issue_date)}` : null,
          item_sku: null,
          item_type: "service",
          unit: "",
          unit_price: 0,
          quantity: 0,
          base_quantity: null,
          discount_percent: 0,
          discount_amount: 0,
          qty_carton: null,
          carton_unit: null,
          line_total: 0,
          source_document_id: qt.id,
          source_line_item_id: null,
          sort_order: sortIndex++,
        });
        for (const l of invoiceLines.filter((il) => il.source_document_id === qt.id && il.quantity > EPS)) {
          lineRecords.push({
            item_id: null,
            item_name: l.item_name,
            line_note: l.line_note || null,
            item_sku: l.item_sku || null,
            item_type: l.item_type || "product",
            unit: l.unit || "ชิ้น",
            unit_price: Number(l.unit_price) || 0,
            quantity: Number(l.quantity) || 0,
            base_quantity: l.base_quantity,
            discount_percent: Number(l.discount_percent) || 0,
            discount_amount: Number(l.discount_amount) || 0,
            qty_carton: l.qty_carton,
            carton_unit: l.carton_unit || null,
            line_total: lineNetAmount(l),
            source_document_id: l.source_document_id,
            source_line_item_id: l.source_line_item_id || null,
            source_delivered_qty: l.quotedQty,
            source_unit_price: l.qtUnitPrice,
            sort_order: sortIndex++,
          });
        }
      }

      // Manual lines (not linked to any quotation) — e.g. freight / surcharges.
      for (const l of invoiceLines.filter((il) => !il.source_document_id && il.quantity > EPS)) {
        lineRecords.push({
          item_id: null,
          item_name: l.item_name,
          line_note: l.line_note || null,
          item_sku: l.item_sku || null,
          item_type: l.item_type || "product",
          unit: l.unit || "ชิ้น",
          unit_price: Number(l.unit_price) || 0,
          quantity: Number(l.quantity) || 0,
          base_quantity: l.base_quantity,
          discount_percent: Number(l.discount_percent) || 0,
          discount_amount: Number(l.discount_amount) || 0,
          qty_carton: l.qty_carton,
          carton_unit: l.carton_unit || null,
          line_total: lineNetAmount(l),
          source_document_id: null,
          source_line_item_id: null,
          sort_order: sortIndex++,
        });
      }

      // Transactional path: invoice + lines + source status flips + stock all
      // commit together or not at all (see create_invoice_from_sources).
      const { data: created, error: createError } = await supabase.rpc("create_invoice_from_sources", {
        p_user_id: userId,
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: selectedCustomer.id,
          deal_id: selectedDealId || selectedDealIds[0] || null,
          doc_number: docNumberOverride || null,
          issue_date: issueDate,
          vat_registered: taxSnapshot.vatRegistered,
          vat_rate: taxSnapshot.vatRate,
          wht_rate: parseFloat(whtRate),
          discount_percent: 0,
          discount_amount: tax.discountAmount,
          subtotal: tax.subtotal,
          vat_amount: tax.vatAmount,
          total_amount: tax.total,
          wht_amount: tax.whtAmount,
          net_payable: tax.netPayable,
          note: note || null,
          customer_po_number: customerPo.trim() || null,
          task_name: taskName.trim() || null,
          show_dn_variance: showVariance,
          converted_from_id: selectedQuotations[0]?.id || null,
          title: selectedCustomer.name,
        },
        p_lines: lineRecords,
        p_source_ids: selectedQuotations.map((qt) => qt.id),
      });
      const record = Array.isArray(created) ? created[0] : created;
      if (createError || !record?.document_id) throw createError || new Error("ไม่สามารถสร้างใบแจ้งหนี้ได้");

      const warnings = (record as any).warnings as any[] | null;
      (warnings || []).forEach((w) =>
        toast.info(`${w.itemName} สต็อกไม่พอ (มี ${w.available} ${w.unit} แต่ใช้ ${w.requested} ${w.unit})`)
      );

      toast.success("สร้างใบแจ้งหนี้จากใบเสนอราคาแล้ว");
      navigate(`/deals/${record.deal_id}`);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้");
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(selectedCustomer && selectedQuotations.length > 0 && billableLines.length > 0);

  return (
    <AppShell title="ออกใบแจ้งหนี้จากใบเสนอราคา" showBack>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {clientProfile?.vat_registered && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">โปรดยืนยันเวลาการออกใบกำกับภาษีกับบัญชีของคุณ</p>
            <p className="mt-0.5 text-xs leading-5">ระบบรองรับการรวมใบเสนอราคาหลายใบเพื่อออกใบกำกับภาษีภายหลัง แต่กิจการ VAT ควรตรวจสอบจุดรับรู้ภาษีให้ถูกต้อง</p>
          </div>
        </div>
      )}

      {taxSnapshot.mixed && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ใบเสนอราคาที่เลือกมีการตั้งค่าภาษีไม่ตรงกัน</p>
            <p className="mt-0.5 text-xs leading-5">ระบบจะใช้การตั้งค่าภาษีจากใบเสนอราคาใบแรกในรายการ โปรดตรวจสอบก่อนสร้างใบแจ้งหนี้</p>
          </div>
        </div>
      )}

      {hasMixedDeals && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <FileStack className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ใบเสนอราคาที่เลือกมาจากหลายงานขาย</p>
            <p className="mt-0.5 text-xs leading-5">ระบบจะรวมใบเสนอราคาทั้งหมดไว้ในงานขายเดียวกับใบแจ้งหนี้ เพื่อให้มองเห็นขั้นตอนเอกสารต่อเนื่องบนหน้าหลัก</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <FormStep number={1} title="ลูกค้าและรอบเอกสาร">
          {customersLoading ? (
            <Spinner />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">ลูกค้า</label>
                {selectedCustomer ? (
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-card-border bg-paper-soft p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-900">{selectedCustomer.name}</div>
                      {selectedCustomer.tax_id && <div className="mt-1 text-xs text-gray-500">เลขผู้เสียภาษี: {selectedCustomer.tax_id}</div>}
                      {selectedCustomer.address && <div className="mt-1 line-clamp-2 text-xs text-gray-500">{selectedCustomer.address}</div>}
                      {(!selectedCustomer.tax_id || !selectedCustomer.address) && (
                        <div className="mt-1 text-xs text-amber-600">ข้อมูลลูกค้ายังไม่ครบสำหรับเอกสารภาษี</div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setCustomerPickerOpen(true)}>เปลี่ยน</Button>
                  </div>
                ) : (
                  <Button variant="secondary" className="w-full justify-center" onClick={() => setCustomerPickerOpen(true)}>
                    เลือกลูกค้า
                  </Button>
                )}
                <CustomerPickerModal
                  open={customerPickerOpen}
                  customers={customers}
                  selectedCustomerId={selectedCustomerId}
                  taxSensitive
                  onClose={() => setCustomerPickerOpen(false)}
                  onSelect={(customer) => setSelectedCustomerId(customer.id)}
                  onCreate={async (customer) => addCustomer(customer)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">วันที่ใบแจ้งหนี้</label>
                <DateInput value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
              </div>
              <div className="sm:col-span-2 overflow-hidden rounded-xl border border-card-border bg-paper-soft">
                <button
                  type="button"
                  onClick={() => setDateExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div>
                    <div className="text-xs font-medium text-gray-700">ช่วงวันที่เสนอราคา</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{dateRangeSummary}</div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${dateExpanded ? "rotate-180" : ""}`} />
                </button>
                {dateExpanded && (
                  <div className="border-t border-card-border p-3">
                    <div className="mb-2 text-[11px] text-gray-500">ใช้กรองใบเสนอราคาที่พร้อมนำมาออกใบแจ้งหนี้</div>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ["thisMonth", "เดือนนี้"],
                        ["previousMonth", "เดือนก่อน"],
                        ["last90Days", "ย้อนหลัง 90 วัน"],
                        ["all", "ทั้งหมด"],
                      ] as const).map(([preset, label]) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setDatePreset(preset);
                            if (preset === "all") {
                              setDateFrom("");
                              setDateTo("");
                            } else if (preset === "last90Days") {
                              setDateFrom(defaultQuotationStartString(businessToday));
                              setDateTo(businessToday);
                            } else {
                              const range = monthRange(businessToday, preset === "previousMonth" ? -1 : 0);
                              setDateFrom(range.from);
                              setDateTo(preset === "thisMonth" ? businessToday : range.to);
                            }
                          }}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            datePreset === preset
                              ? "border-primary bg-primary text-white"
                              : "border-gray-200 bg-white text-gray-600 hover:border-primary/40"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">ตั้งแต่วันที่</label>
                        <DateInput
                          value={dateFrom}
                          onChange={(event) => {
                            setDatePreset("custom");
                            setDateFrom(event.target.value);
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">ถึงวันที่</label>
                        <DateInput
                          value={dateTo}
                          onChange={(event) => {
                            setDatePreset("custom");
                            setDateTo(event.target.value);
                          }}
                        />
                      </div>
                    </div>
                    {datePreset === "all" ? (
                      <div className="mt-2 text-[11px] text-gray-500">แสดงใบเสนอราคาที่พร้อมออกใบแจ้งหนี้ทั้งหมด</div>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="text-xs leading-5 text-gray-500 sm:col-span-2">
                ระบบแสดงเฉพาะรายการที่ยังไม่ถูกออกใบแจ้งหนี้ (คงเหลือหลังหักยอดที่ออกไปแล้ว) สามารถออกบิลทีละส่วนได้
              </p>
            </div>
          )}
        </FormStep>

        <FormStep
          number={2}
          title="เลือกใบเสนอราคา"
          description="เลือกใบเสนอราคาที่ต้องการออกบิล ระบบรองรับการออกบิลทีละส่วน (Partial)"
          right={
            quotations.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (selectedIds.size === quotations.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(quotations.map((qt) => qt.id)));
                }}
              >
                {selectedIds.size === quotations.length ? "ล้างที่เลือก" : "เลือกทั้งหมด"}
              </Button>
            ) : undefined
          }
        >
          {loadingQts ? (
            <Spinner />
          ) : !selectedCustomerId ? (
            <EmptyState title="เลือกลูกค้าก่อน" description="ระบบจะแสดงใบเสนอราคาที่ส่งแล้วและยังไม่ถูกนำไปออกใบแจ้งหนี้" />
          ) : quotations.length === 0 ? (
            <EmptyState title="ไม่พบใบเสนอราคาที่พร้อมออกใบแจ้งหนี้" description="ใบเสนอราคาทั้งหมดอาจถูกออกใบแจ้งหนี้ครบแล้ว หรือลองเปลี่ยนช่วงวันที่" />
          ) : (
            <div className="space-y-2">
              {quotations.map((qt) => (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() => toggleQt(qt.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedIds.has(qt.id)
                      ? "border-primary bg-blue-50"
                      : "border-card-border bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(qt.id)}
                      onChange={() => toggleQt(qt.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{qt.doc_number || "ไม่มีเลขเอกสาร"}</span>
                        <span className="text-xs text-gray-500">{formatBuddhistDate(qt.issue_date)}</span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-gray-500">
                        {buildItemSummary(qt.line_items.map((l) => ({ ...l, quantity: l.remaining })))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-gray-500">
                      <div>{qt.line_items.length} รายการ</div>
                      <div className="mt-1 font-medium text-gray-700">฿{formatCurrency(qt.line_items.reduce((sum, l) => sum + lineNetFromLine(l), 0))}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </FormStep>

        <FormStep
          number={3}
          title="รายการที่จะออกบิล"
          description={
            refOnlyMode
              ? "โหมดอ้างอิง — PDF แสดง 1 บรรทัดต่อใบเสนอราคา (เหมือนใบวางบิล)"
              : "รายการคัดลอกจากใบเสนอราคา สามารถแก้ไขจำนวน ราคา รายละเอียด และส่วนลดได้ก่อนสร้างใบแจ้งหนี้"
          }
          right={
            <div className="rounded-full bg-paper-warm px-2.5 py-1 text-xs text-ink-600">
              {selectedQuotations.length} ใบเสนอราคา / {invoiceLines.length} รายการต้นทาง
            </div>
          }
        >
          {billableLines.length === 0 ? (
            <EmptyState title="ยังไม่มีรายการที่จะออกบิล" description="เลือกใบเสนอราคาด้านบน จากนั้นปรับจำนวนที่ต้องการออกบิล (คงเหลือสามารถออกทีหลังได้)" />
          ) : (
            <div className="space-y-3">
              {refOnlyMode && refGroups.length > 0 && (
                <div className="space-y-2">
                  {refGroups.map((group) => (
                    <div
                      key={group.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-card-border bg-paper-soft px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-900">{group.label}</div>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {[group.dateLabel, `รายการ ${group.lineCount} บรรทัด`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                        ฿{formatCurrency(group.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-card-border">
                <div className="overflow-x-auto">
                  <div className="min-w-[620px]">
                    <LineGridHeaderRow />
                    <div className="divide-y divide-card-border">
                      {invoiceLines
                        .filter((l) => !refOnlyMode || !l.source_document_id)
                        .map((l) => {
                          const qtyChanged =
                            l.quotedQty > 0 && Math.abs(l.quantity - l.quotedQty) > EPS;
                          const priceChanged =
                            l.qtUnitPrice > 0 && Math.abs(l.unit_price - l.qtUnitPrice) > EPS;
                          return (
                            <div
                              key={l.key}
                              className={`grid ${LINE_GRID_COLS} items-start gap-x-2 px-3 py-2`}
                            >
                              <div className="min-w-0">
                                <input
                                  value={l.item_name}
                                  onChange={(event) =>
                                    updateLine(l.key, { item_name: event.target.value })
                                  }
                                  placeholder="ชื่อรายการ"
                                  className="w-full rounded-lg border border-transparent bg-gray-50 px-2 py-1.5 text-sm font-medium text-ink-900 outline-none transition-colors placeholder:font-normal placeholder:text-gray-400 hover:border-gray-200 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                                />
                                <input
                                  value={l.line_note}
                                  onChange={(event) =>
                                    updateLine(l.key, { line_note: event.target.value })
                                  }
                                  placeholder="+ รายละเอียด / สเปค"
                                  className="mt-1 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-500 outline-none transition-colors placeholder:text-gray-300 hover:bg-gray-50 focus:bg-gray-50 focus:text-ink-900"
                                />
                              </div>
                              <div>
                                <input
                                  type="number"
                                  min={0}
                                  max={l.maxQty}
                                  step="any"
                                  value={l.quantity}
                                  onChange={(event) =>
                                    updateLine(l.key, {
                                      quantity: Math.max(
                                        0,
                                        Math.min(Number(event.target.value) || 0, l.maxQty),
                                      ),
                                    })
                                  }
                                  className={numericInputClass(false)}
                                />
                                {qtyChanged && (
                                  <div className="mt-0.5 text-right text-[10px] leading-3 text-gray-400">
                                    QT: {trimQty(l.quotedQty)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <input
                                  value={l.unit}
                                  onChange={(event) =>
                                    updateLine(l.key, { unit: event.target.value })
                                  }
                                  className="w-full rounded-lg border border-card-border bg-white px-2 py-1.5 text-sm text-ink-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                              </div>
                              <div>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={l.unit_price}
                                  onChange={(event) =>
                                    updateLine(l.key, {
                                      unit_price: Number(event.target.value) || 0,
                                    })
                                  }
                                  className={numericInputClass(priceChanged)}
                                />
                                {priceChanged && (
                                  <div className="mt-0.5 text-right text-[10px] font-medium leading-3 text-amber-600">
                                    QT: {trimQty(l.qtUnitPrice)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="any"
                                  value={l.discount_percent}
                                  onChange={(event) =>
                                    updateLine(l.key, {
                                      discount_percent: Math.max(
                                        0,
                                        Math.min(100, Number(event.target.value) || 0),
                                      ),
                                      discount_amount: 0,
                                    })
                                  }
                                  className={numericInputClass(false)}
                                />
                              </div>
                              <div className="pt-1.5 text-right text-sm font-semibold tabular-nums text-ink-900">
                                {formatCurrency(lineNetAmount(l))}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeLine(l.key)}
                                aria-label="ลบรายการ"
                                className="mx-auto mt-1.5 text-gray-300 transition-colors hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <Button variant="secondary" className="w-full justify-center" onClick={addManualLine}>
                  + เพิ่มรายการเพิ่มเติม (ค่าขนส่ง / ส่วนต่าง)
                </Button>
              </div>
            </div>
          )}
        </FormStep>

        <DocumentOptionsCard number={4}>
          <DocumentOptionRow
            label="โหมดอ้างอิง"
            description="PDF แสดง 1 บรรทัดต่อใบเสนอราคา (เหมือนใบวางบิล) ปิดเพื่อแสดงรายการสินค้าแบบละเอียด"
            checked={refOnlyMode}
            onChange={setRefOnlyMode}
          />
          {!refOnlyMode && (
            <DocumentOptionRow
              label="แสดงส่วนต่างจากใบเสนอราคาในใบกำกับภาษี"
              badge="โหมดรายละเอียด"
              description="พิมพ์จำนวน/ราคาที่เปลี่ยนไปจากใบเสนอราคาต้นทาง เป็นหลักฐานประกอบใบกำกับภาษี"
              checked={showVariance}
              onChange={setShowVariance}
            />
          )}
        </DocumentOptionsCard>

        <FormStep number={5} title="สรุปและบันทึก">
          <div className="space-y-3">
            <Select label="ภาษีหัก ณ ที่จ่าย" value={whtRate} onChange={(event) => setWhtRate(event.target.value as WhtRate)}>
              {WHT_RATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <PoTaskFields
              taskName={taskName}
              onTaskNameChange={setTaskName}
              customerPo={customerPo}
              onCustomerPoChange={setCustomerPo}
              taskSuggestions={referenceHistory.taskValues}
              poSuggestions={referenceHistory.poValues}
              sourceHint={
                selectedQuotations[0]?.customer_po_number?.trim() || selectedQuotations[0]?.task_name?.trim()
                  ? `ใบเสนอราคา ${selectedQuotations[0]?.doc_number || ""}`
                  : null
              }
            />
            <Input label="หมายเหตุ" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น รวมใบเสนอราคาประจำเดือนนี้" />
            <div className="rounded-xl border border-card-border bg-paper-soft p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
                <FileStack className="h-3.5 w-3.5" />
                รวม {selectedQuotations.length} ใบเสนอราคา / {billableLines.length} รายการที่ออกบิล
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>รวมก่อนภาษี</span><span>฿{formatCurrency(tax.subtotal)}</span></div>
                {taxSnapshot.vatRegistered && <div className="flex justify-between"><span>VAT {taxSnapshot.vatRate}%</span><span>฿{formatCurrency(tax.vatAmount)}</span></div>}
                <div className="flex justify-between font-medium"><span>รวมทั้งสิ้น</span><span>฿{formatCurrency(tax.total)}</span></div>
                {tax.whtAmount > 0 && <div className="flex justify-between text-red-600"><span>หัก ณ ที่จ่าย {whtRate}%</span><span>-฿{formatCurrency(tax.whtAmount)}</span></div>}
                <div className="flex justify-between border-t border-line-strong pt-2 text-base font-semibold"><span>ยอดชำระสุทธิ</span><span>฿{formatCurrency(tax.netPayable)}</span></div>
              </div>
            </div>
            <EditableDocNumber
              value={docNumberOverride}
              onChange={setDocNumberOverride}
              placeholder="เลขที่ใบแจ้งหนี้ (เว้นว่าง = สร้างอัตโนมัติ)"
              autoGenerate={async () => userId ? await resolveDocNumber(userId, "invoice", issueDate) : ""}
              className="mb-3"
            />
          </div>
        </FormStep>

        <FormActionBar
          contextLabel={`${selectedCustomer?.name || ""} · ${billableLines.length} รายการ`}
          totalLabel="ยอดสุทธิ"
          total={tax.netPayable}
          primary={{
            label: "สร้างใบแจ้งหนี้",
            onClick: handleSave,
            loading: saving,
            disabled: !canSave || saving,
          }}
        />
      </div>
    </AppShell>
  );
}

function lineNetFromLine(l: QtLineWithRemaining) {
  const base = (Number(l.unit_price) || 0) * Math.max(0, l.remaining);
  return Math.max(0, base - (l.discount_percent > 0 ? (base * l.discount_percent) / 100 : Number(l.discount_amount) || 0));
}
