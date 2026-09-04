import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, ChevronDown, FileStack, Trash2 } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { DateInput } from "../ui/DateInput";
import { DocumentOptionsCard, DocumentOptionRow } from "./DocumentOptions";
import { FormStep } from "./FormStep";
import { FormActionBar } from "./FormActionBar";
import { LineGridHeaderRow, numericInputClass } from "./lineGrid";
import { useWorkspaceFeatures } from "../../hooks/useAuth";
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
const MANUAL_MAX = 1e9;

type DnLineWithRemaining = DocumentLineItem & {
  deliveredQty: number;
  billedQty: number;
  remaining: number;
};

type DeliveryNoteOption = Omit<Document, "line_items"> & {
  line_items: DnLineWithRemaining[];
  hasBillable: boolean;
};

type EditableInvoiceLine = {
  key: string;
  source_document_id: string;
  source_line_item_id: string;
  dnDocNumber: string;
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
  deliveredQty: number;
  billedQty: number;
  maxQty: number;
  dnUnitPrice: number;
};

function defaultDeliveryNoteStartString(today = localTodayString()) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 90);
  return localTodayString(date);
}

type DeliveryDatePreset = "thisMonth" | "previousMonth" | "last90Days" | "all" | "custom";

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

function getDeliveryNoteSubtotal(dn: DeliveryNoteOption) {
  const subtotal = Number(dn.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
  return dn.line_items.reduce((sum, l) => sum + Number(l.line_total || 0), 0);
}

function getDeliveryNoteTotal(dn: DeliveryNoteOption) {
  const total = Number(dn.total_amount);
  if (Number.isFinite(total) && total > 0) return total;
  return getDeliveryNoteSubtotal(dn);
}

function lineNetAmount(l: EditableInvoiceLine) {
  const base = (Number(l.unit_price) || 0) * (Number(l.quantity) || 0);
  const discount = l.discount_percent > 0 ? (base * l.discount_percent) / 100 : Number(l.discount_amount) || 0;
  return Math.max(0, base - discount);
}

function trimQty(value: number) {
  return String(Number((Number(value) || 0).toFixed(3)));
}

type InvoiceLineGroup = {
  key: string;
  kind: "dn" | "manual";
  title: string;
  dateLabel: string;
  deliveredTotal: number;
  remainingTotal: number;
  lines: EditableInvoiceLine[];
};

export function InvoiceFromDeliveryNotesForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedDnId = searchParams.get("dnId");
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const { hasFeature } = useWorkspaceFeatures(userId);
  const dnAppendixEnabled = hasFeature("dn_appendix");
  const todayString = () => businessToday;
  const { customers, loading: customersLoading, addCustomer } = useCustomers(userId);
  const toast = useToast();

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<DeliveryDatePreset>("all");
  const [dateExpanded, setDateExpanded] = useState(false);
  const [issueDate, setIssueDate] = useState(() => businessTodayString(clientProfile));
  const [whtRate, setWhtRate] = useState<WhtRate>("0");
  const [note, setNote] = useState("");
  // Optional PO reference + task name, printed on the invoice. Flow-down:
  // pre-filled from the selected DNs — first non-empty value wins; DNs that
  // disagree are flagged inline (PoTaskFields conflicts) instead of blanking.
  const [customerPo, setCustomerPo] = useState("");
  const [taskName, setTaskName] = useState("");
  // Tracks the last derived value so manual edits survive selection changes.
  const derivedPoTaskRef = useRef({ po: "", task: "" });

  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const referenceHistory = useCustomerReferenceHistory(selectedCustomerId || null);
  const [invoiceLines, setInvoiceLines] = useState<EditableInvoiceLine[]>([]);
  const [loadingDns, setLoadingDns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [showDnVariance, setShowDnVariance] = useState(false);
  const [error, setError] = useState("");
  // Ref mode: one printed line per source delivery note instead of item detail.
  // Default is detail (opt-in, remembered per browser) — ref-saved invoices
  // can never be expanded back into item lines at print time.
  const [refOnlyMode, setRefOnlyMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("invoice-system.invoiceRefOnly") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem("invoice-system.invoiceRefOnly", String(refOnlyMode));
  }, [refOnlyMode]);

  // Appendix: attach per-DN delivered-vs-billed breakdown after the invoice pages.
  const [dnAppendix, setDnAppendix] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("invoice-system.dnAppendix") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem("invoice-system.dnAppendix", String(dnAppendix));
  }, [dnAppendix]);

  useEffect(() => {
    if (clientProfile) {
      setWhtRate(clientProfile.default_wht_rate);
    }
  }, [clientProfile]);

  useEffect(() => {
    const realToday = businessTodayString(null);
    if (dateTo === realToday) setDateTo(businessToday);
    if (issueDate === realToday) setIssueDate(businessToday);
    if (dateFrom === defaultDeliveryNoteStartString(realToday)) {
      setDateFrom(defaultDeliveryNoteStartString(businessToday));
    }
  }, [businessToday, dateFrom, dateTo, issueDate]);

  useEffect(() => {
    if (!preselectedDnId || !userId) return;

    let cancelled = false;
    async function loadPreselectedDeliveryNote() {
      const { data: dn } = await supabase
        .from("documents")
        .select("id, customer_id")
        .eq("id", preselectedDnId)
        .eq("user_id", userId)
        .eq("doc_type", "delivery_note")
        .eq("status", "sent")
        .maybeSingle();

      if (!cancelled && dn?.customer_id) {
        setSelectedCustomerId(dn.customer_id);
      }
    }

    loadPreselectedDeliveryNote();
    return () => {
      cancelled = true;
    };
  }, [preselectedDnId, userId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  const dateRangeSummary = (() => {
    if (datePreset === "all") return "ทั้งหมด (แสดงทุกใบส่งของ)";
    if (datePreset === "custom") return `ตั้งแต่ ${dateFrom || "-"} ถึง ${dateTo || "-"}`;
    const presetLabels: Record<Exclude<DeliveryDatePreset, "all" | "custom">, string> = {
      thisMonth: "เดือนนี้",
      previousMonth: "เดือนก่อน",
      last90Days: "ย้อนหลัง 90 วัน",
    };
    return presetLabels[datePreset];
  })();

  useEffect(() => {
    if (!selectedCustomerId || !userId) {
      setDeliveryNotes([]);
      setSelectedIds(new Set());
      return;
    }

    let cancelled = false;
    async function loadDeliveryNotes() {
      setLoadingDns(true);
      setError("");

      let query = supabase
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .eq("customer_id", selectedCustomerId)
        .eq("doc_type", "delivery_note")
        .eq("status", "sent")
        .order("issue_date", { ascending: true });

      if (dateFrom) query = query.gte("issue_date", dateFrom);
      if (dateTo) query = query.lte("issue_date", dateTo);

      const { data: docs, error: docsError } = await query;

      if (docsError) {
        if (!cancelled) setError(docsError.message);
        if (!cancelled) setLoadingDns(false);
        return;
      }

      let docList = (docs || []) as DeliveryNoteOption[];
      if (preselectedDnId && !docList.some((doc) => doc.id === preselectedDnId)) {
        const { data: preselectedDoc } = await supabase
          .from("documents")
          .select("*")
          .eq("id", preselectedDnId)
          .eq("user_id", userId)
          .eq("customer_id", selectedCustomerId)
          .eq("doc_type", "delivery_note")
          .eq("status", "sent")
          .maybeSingle();
        if (preselectedDoc) {
          docList = [...docList, preselectedDoc as DeliveryNoteOption].sort((a, b) =>
            (a.issue_date || "").localeCompare(b.issue_date || ""),
          );
        }
      }
      const docIds = docList.map((doc) => doc.id);

      const [{ data: lineItems }, { data: activeLinks }] = await Promise.all([
        docIds.length
          ? supabase.from("document_line_items").select("*").in("document_id", docIds).order("sort_order", { ascending: true })
          : Promise.resolve({ data: [] as DocumentLineItem[] }),
        docIds.length
          ? supabase.from("invoice_delivery_notes").select("delivery_note_id, invoice_id").in("delivery_note_id", docIds).is("released_at", null)
          : Promise.resolve({ data: [] as { delivery_note_id: string; invoice_id: string }[] }),
      ]);

      if (cancelled) return;

      // Delivered vs already-billed per delivery-note line (keyed by dn::line).
      const linesByDoc = new Map<string, DocumentLineItem[]>();
      ((lineItems || []) as DocumentLineItem[]).forEach((line) => {
        const current = linesByDoc.get(line.document_id) || [];
        current.push(line);
        linesByDoc.set(line.document_id, current);
      });

      // Billed quantity = sum of invoice line items that reference each DN line,
      // excluding voided/draft invoices.
      const refPairs = ((lineItems || []) as DocumentLineItem[])
        .filter((l) => l.id)
        .map((l) => ({ dnId: l.document_id, lineId: l.id }));
      const dnLineIds = refPairs.map((p) => p.lineId);
      const dnIds = refPairs.map((p) => p.dnId);

      let billedByLine = new Map<string, number>();
      if (dnLineIds.length) {
        const { data: invLines } = await supabase
          .from("document_line_items")
          .select("source_document_id, source_line_item_id, quantity, document_id")
          .in("source_line_item_id", dnLineIds)
          .in("source_document_id", dnIds);
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

      void activeLinks;

      const options = docList
        .map((doc) => {
          const lines = (linesByDoc.get(doc.id) || []).map((line) => ({
            ...line,
            deliveredQty: Number(line.quantity) || 0,
            billedQty: billedByLine.get(`${doc.id}::${line.id}`) || 0,
            remaining: (Number(line.quantity) || 0) - (billedByLine.get(`${doc.id}::${line.id}`) || 0),
          }));
          return {
            ...doc,
            line_items: lines,
            hasBillable: lines.some((l) => l.remaining > EPS),
          } as DeliveryNoteOption;
        })
        .filter((doc) => doc.hasBillable);

      if (cancelled) return;

      setDeliveryNotes(options);
      setSelectedIds(
        preselectedDnId && options.some((doc) => doc.id === preselectedDnId)
          ? new Set([preselectedDnId])
          : new Set(options.map((doc) => doc.id)),
      );
      setLoadingDns(false);
    }

    loadDeliveryNotes();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, preselectedDnId, selectedCustomerId, userId]);

  const selectedDeliveryNotes = useMemo(
    () => deliveryNotes.filter((doc) => selectedIds.has(doc.id)),
    [deliveryNotes, selectedIds],
  );

  // Flow-down derivation: first non-empty value among the selected DNs wins
  // (a scratch DN left blank no longer blanks the whole invoice); DNs that
  // disagree with the chosen value are flagged for the inline amber warning.
  const poTaskDerivation = useMemo(() => {
    const withPo = selectedDeliveryNotes.filter((dn) => (dn.customer_po_number || "").trim());
    const chosenPo = withPo[0]?.customer_po_number?.trim() || "";
    const poConflicts = chosenPo
      ? selectedDeliveryNotes
          .filter((dn) => (dn.customer_po_number || "").trim() && (dn.customer_po_number || "").trim() !== chosenPo)
          .map((dn) => dn.doc_number || dn.id.slice(0, 8))
      : [];
    const withTask = selectedDeliveryNotes.filter((dn) => (dn.task_name || "").trim());
    const chosenTask = withTask[0]?.task_name?.trim() || "";
    const taskConflicts = chosenTask
      ? selectedDeliveryNotes
          .filter((dn) => (dn.task_name || "").trim() && (dn.task_name || "").trim() !== chosenTask)
          .map((dn) => dn.doc_number || dn.id.slice(0, 8))
      : [];
    const source = withPo[0] || withTask[0];
    return {
      chosenPo,
      chosenTask,
      poConflicts,
      taskConflicts,
      sourceHint: source ? `ใบส่งของ ${source.doc_number || source.id.slice(0, 8)}` : null,
    };
  }, [selectedDeliveryNotes]);

  // Follow the derived values (until the user edits the field manually).
  const selectedDnIdsKey = selectedDeliveryNotes.map((dn) => dn.id).join(",");
  useEffect(() => {
    setCustomerPo((current) =>
      current === derivedPoTaskRef.current.po || current === "" ? poTaskDerivation.chosenPo : current,
    );
    setTaskName((current) =>
      current === derivedPoTaskRef.current.task || current === "" ? poTaskDerivation.chosenTask : current,
    );
    derivedPoTaskRef.current = { po: poTaskDerivation.chosenPo, task: poTaskDerivation.chosenTask };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDnIdsKey]);

  // Rebuild editable invoice lines from the selected delivery notes, preserving
  // any manual edits the user already made to lines that are still present.
  useEffect(() => {
    setInvoiceLines((prev) => {
      // Keep any manually-added lines (not linked to a delivery note) untouched.
      const manualLines = prev.filter((l) => !l.source_document_id);
      const prevByKey = new Map(
        prev.filter((l) => l.source_document_id).map((l) => [`${l.source_document_id}::${l.source_line_item_id}`, l]),
      );
      const next: EditableInvoiceLine[] = [...manualLines];
      for (const dn of selectedDeliveryNotes) {
        for (const l of dn.line_items) {
          if (l.remaining <= EPS) continue;
          const key = `${dn.id}::${l.id}`;
          const existing = prevByKey.get(key);
          if (existing) {
            next.push({ ...existing, maxQty: l.remaining, quantity: Math.min(existing.quantity, l.remaining) });
          } else {
            next.push({
              key,
              source_document_id: dn.id,
              source_line_item_id: l.id || "",
              dnDocNumber: dn.doc_number || dn.id.slice(0, 8),
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
              deliveredQty: l.deliveredQty,
              billedQty: l.billedQty,
              maxQty: l.remaining,
              dnUnitPrice: Number(l.unit_price) || 0,
            });
          }
        }
      }
      return next;
    });
  }, [selectedDeliveryNotes]);

  const selectedDealId = useMemo(() => {
    const dealIds = Array.from(new Set(selectedDeliveryNotes.map((doc) => doc.deal_id).filter(Boolean)));
    return dealIds.length === 1 ? dealIds[0] : null;
  }, [selectedDeliveryNotes]);

  const selectedDealIds = useMemo(
    () => Array.from(new Set(selectedDeliveryNotes.map((doc) => doc.deal_id).filter(Boolean))),
    [selectedDeliveryNotes],
  );

  const hasMixedDeals = selectedDealIds.length > 1;

  const taxSnapshot = useMemo(() => {
    if (selectedDeliveryNotes.length === 0) {
      return {
        vatRegistered: clientProfile?.vat_registered ?? false,
        vatRate: clientProfile?.vat_rate ?? VAT_DEFAULT,
        mixed: false,
      };
    }

    const first = selectedDeliveryNotes[0];
    const mixed = selectedDeliveryNotes.some(
      (doc) => doc.vat_registered !== first.vat_registered || Number(doc.vat_rate) !== Number(first.vat_rate),
    );

    return {
      vatRegistered: first.vat_registered,
      vatRate: first.vat_rate ?? VAT_DEFAULT,
      mixed,
    };
  }, [clientProfile?.vat_rate, clientProfile?.vat_registered, selectedDeliveryNotes]);

  const billableLines = useMemo(() => invoiceLines.filter((l) => l.quantity > EPS), [invoiceLines]);

  // Ref-mode summary: one row per source delivery note with its billed total.
  const refGroups = useMemo(() => {
    const dnById = new Map(selectedDeliveryNotes.map((dn) => [dn.id, dn]));
    const groups: { key: string; label: string; dateLabel: string; total: number; lineCount: number }[] = [];
    for (const l of billableLines) {
      if (!l.source_document_id) continue;
      let group = groups.find((g) => g.key === l.source_document_id);
      if (!group) {
        const dn = dnById.get(l.source_document_id);
        group = {
          key: l.source_document_id,
          label: `ใบส่งของ ${l.dnDocNumber}`,
          dateLabel: dn?.issue_date ? formatBuddhistDate(dn.issue_date) : "",
          total: 0,
          lineCount: 0,
        };
        groups.push(group);
      }
      group.total += lineNetAmount(l);
      group.lineCount += 1;
    }
    return groups;
  }, [billableLines, selectedDeliveryNotes]);

  // Group editable lines under their source delivery note (manual lines last).
  const lineGroups = useMemo<InvoiceLineGroup[]>(() => {
    const dnById = new Map(selectedDeliveryNotes.map((dn) => [dn.id, dn] as const));
    const dnGroups: InvoiceLineGroup[] = [];
    let manualGroup: InvoiceLineGroup | null = null;

    for (const l of invoiceLines) {
      if (!l.source_document_id) {
        if (!manualGroup) {
          manualGroup = { key: "manual", kind: "manual", title: "รายการเพิ่มเติม", dateLabel: "", deliveredTotal: 0, remainingTotal: 0, lines: [] };
        }
        manualGroup.lines.push(l);
        continue;
      }
      let group = dnGroups.find((g) => g.key === l.source_document_id);
      if (!group) {
        const dn = dnById.get(l.source_document_id);
        group = {
          key: l.source_document_id,
          kind: "dn",
          title: `ใบส่งของ ${l.dnDocNumber}`,
          dateLabel: dn?.issue_date ? formatBuddhistDate(dn.issue_date) : "",
          deliveredTotal: (dn?.line_items || []).reduce((sum, li) => sum + li.deliveredQty, 0),
          remainingTotal: (dn?.line_items || []).reduce((sum, li) => sum + Math.max(0, li.remaining), 0),
          lines: [],
        };
        dnGroups.push(group);
      }
      group.lines.push(l);
    }

    const filledDnGroups = dnGroups.filter((g) => g.lines.length > 0);
    return manualGroup && manualGroup.lines.length > 0 ? [...filledDnGroups, manualGroup] : filledDnGroups;
  }, [invoiceLines, selectedDeliveryNotes]);

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

  const toggleDn = (id: string) => {
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
        dnDocNumber: "รายการเพิ่มเติม",
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
        deliveredQty: 0,
        billedQty: 0,
        maxQty: MANUAL_MAX,
        dnUnitPrice: 0,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setInvoiceLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    if (!userId || !selectedCustomer || selectedDeliveryNotes.length === 0) return;
    if (billableLines.length === 0) {
      setError("ยังไม่มีรายการที่จะออกบิล (ระบุจำนวนที่มากกว่า 0)");
      return;
    }

    // Guardrail: never bill more than the remaining (delivered - already billed) qty.
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
      for (const dn of selectedDeliveryNotes) {
        const groupLines = invoiceLines.filter((il) => il.source_document_id === dn.id && il.quantity > EPS);

        if (refOnlyMode && groupLines.length > 0) {
          // Ref mode: one printed line per delivery note carrying its billed total.
          const groupTotal = groupLines.reduce((sum, l) => sum + lineNetAmount(l), 0);
          lineRecords.push({
            item_id: null,
            item_name: `ใบส่งของ ${dn.doc_number || dn.id.slice(0, 8)}`,
            line_note: [
              dn.issue_date ? `วันที่ส่งของ: ${formatBuddhistDate(dn.issue_date)}` : null,
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
            source_document_id: dn.id,
            source_line_item_id: null,
            sort_order: sortIndex++,
          });
          continue;
        }

        lineRecords.push({
          item_id: null,
          item_name: `ใบส่งของ ${dn.doc_number || dn.id.slice(0, 8)}`,
          line_note: dn.issue_date ? `วันที่ส่งของ: ${formatBuddhistDate(dn.issue_date)}` : null,
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
          source_document_id: dn.id,
          source_line_item_id: null,
          sort_order: sortIndex++,
        });
        for (const l of invoiceLines.filter((il) => il.source_document_id === dn.id && il.quantity > EPS)) {
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
            source_delivered_qty: l.deliveredQty,
            source_unit_price: l.dnUnitPrice,
            sort_order: sortIndex++,
          });
        }
      }

      // Manual lines (not linked to any delivery note) — e.g. freight / surcharges.
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

      // Transactional path: invoice + lines + DN links + source status flips +
      // stock all commit together or not at all (see create_invoice_from_sources).
      const { data: created, error: createError } = await supabase.rpc("create_invoice_from_sources", {
        p_user_id: userId,
        p_document: {
          doc_type: "invoice",
          status: "sent",
          customer_id: selectedCustomer.id,
          deal_id: selectedDealId || null,
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
          dn_appendix: dnAppendix,
          show_dn_variance: showDnVariance,
          title: `ออกบิลรวม ${selectedCustomer.name}`,
        },
        p_lines: lineRecords,
        p_source_ids: selectedDeliveryNotes.map((dn) => dn.id),
      });
      const record = Array.isArray(created) ? created[0] : created;
      if (createError || !record?.document_id) throw createError || new Error("ไม่สามารถสร้างใบแจ้งหนี้ได้");

      const warnings = (record as any).warnings as any[] | null;
      (warnings || []).forEach((w) =>
        toast.info(`${w.itemName} สต็อกไม่พอ (มี ${w.available} ${w.unit} แต่ใช้ ${w.requested} ${w.unit})`)
      );

      toast.success("สร้างใบแจ้งหนี้จากใบส่งของแล้ว");
      navigate(`/deals/${record.deal_id}`);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้");
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(selectedCustomer && selectedDeliveryNotes.length > 0 && billableLines.length > 0);

  return (
    <AppShell title="ออกใบแจ้งหนี้จากใบส่งของ" showBack>
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
            <p className="mt-0.5 text-xs leading-5">ระบบรองรับการรวมใบส่งของหลายใบเพื่อออกใบกำกับภาษีภายหลัง แต่กิจการ VAT ควรตรวจสอบจุดรับรู้ภาษีให้ถูกต้อง</p>
          </div>
        </div>
      )}

      {taxSnapshot.mixed && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ใบส่งของที่เลือกมีการตั้งค่าภาษีไม่ตรงกัน</p>
            <p className="mt-0.5 text-xs leading-5">ระบบจะใช้การตั้งค่าภาษีจากใบส่งของใบแรกในรายการ โปรดตรวจสอบก่อนสร้างใบแจ้งหนี้</p>
          </div>
        </div>
      )}

      {hasMixedDeals && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <FileStack className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ใบส่งของที่เลือกมาจากหลายงานขาย</p>
            <p className="mt-0.5 text-xs leading-5">
              ระบบจะรวมออกเป็นใบแจ้งหนี้เดียวในงานขายใหม่ ใบส่งของทุกใบยังคงอยู่กับงานขายเดิมของตัวเอง
              และสามารถแยกออกจากใบแจ้งหนี้ย้อนหลังได้
            </p>
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
              <div className="sm:col-span-2 rounded-xl border border-card-border bg-paper-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    วันที่ใบแจ้งหนี้
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[180px]">
                    <DateInput
                      id="invoice-issue-date"
                      value={issueDate}
                      onChange={(event) => setIssueDate(event.target.value)}
                      aria-label="วันที่ใบแจ้งหนี้"
                    />
                  </div>
                </div>
                {issueDate && (
                  <p className="mt-1 text-xs font-medium text-ink-600">{formatBuddhistDate(issueDate)}</p>
                )}
                <p className="mt-1 text-[11px] leading-4 text-gray-500">ใช้เป็นวันที่ออกใบแจ้งหนี้/ใบกำกับภาษี และวันที่ในเลขที่เอกสาร</p>
              </div>
              <div className="sm:col-span-2 overflow-hidden rounded-xl border border-card-border bg-paper-soft">
                <button
                  type="button"
                  onClick={() => setDateExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div>
                    <div className="text-xs font-medium text-gray-700">ช่วงวันที่ส่งของ</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{dateRangeSummary}</div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${dateExpanded ? "rotate-180" : ""}`} />
                </button>
                {dateExpanded && (
                  <div className="border-t border-card-border p-3">
                    <div className="mb-2 text-[11px] text-gray-500">ใช้กรองใบส่งของที่พร้อมนำมาออกใบแจ้งหนี้</div>
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
                              setDateFrom(defaultDeliveryNoteStartString(businessToday));
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
                      <div className="mt-2 text-[11px] text-gray-500">แสดงใบส่งของที่พร้อมออกใบแจ้งหนี้ทั้งหมด</div>
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
          title="เลือกใบส่งของ"
          description="เลือกใบส่งของที่ต้องการออกบิล ระบบรองรับการออกบิลทีละส่วน (Partial)"
          right={
            deliveryNotes.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (selectedIds.size === deliveryNotes.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(deliveryNotes.map((dn) => dn.id)));
                }}
              >
                {selectedIds.size === deliveryNotes.length ? "ล้างที่เลือก" : "เลือกทั้งหมด"}
              </Button>
            ) : undefined
          }
        >
          {loadingDns ? (
            <Spinner />
          ) : !selectedCustomerId ? (
            <EmptyState title="เลือกลูกค้าก่อน" description="ระบบจะแสดงใบส่งของที่ส่งแล้วและยังไม่ถูกนำไปออกใบแจ้งหนี้" />
          ) : deliveryNotes.length === 0 ? (
            <EmptyState title="ไม่พบใบส่งของที่พร้อมออกใบแจ้งหนี้" description="ใบส่งของทั้งหมดอาจถูกออกใบแจ้งหนี้ครบแล้ว หรือลองเปลี่ยนช่วงวันที่" />
          ) : (
            <div className="space-y-2">
              {deliveryNotes.map((dn) => (
                <button
                  key={dn.id}
                  type="button"
                  onClick={() => toggleDn(dn.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedIds.has(dn.id)
                      ? "border-primary bg-blue-50"
                      : "border-card-border bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(dn.id)}
                      onChange={() => toggleDn(dn.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{dn.doc_number || "ไม่มีเลขเอกสาร"}</span>
                        <span className="text-xs text-gray-500">{formatBuddhistDate(dn.issue_date)}</span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-gray-500">
                        {buildItemSummary(dn.line_items.map((l) => ({ ...l, quantity: l.remaining })))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-gray-500">
                      <div>{dn.line_items.length} รายการ</div>
                      <div className="mt-1 font-medium text-gray-700">฿{formatCurrency(dn.line_items.reduce((sum, l) => sum + lineNetFromLine(l), 0))}</div>
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
              ? "โหมดอ้างอิง — PDF แสดง 1 บรรทัดต่อใบส่งของ (เหมือนใบวางบิล)"
              : "รายการคัดลอกจากใบส่งของ สามารถแก้ไขจำนวน ราคา รายละเอียด และส่วนลดได้ก่อนสร้างใบแจ้งหนี้"
          }
          right={
            <div className="rounded-full bg-paper-warm px-2.5 py-1 text-xs text-ink-600">
              {selectedDeliveryNotes.length} ใบส่งของ / {invoiceLines.length} รายการต้นทาง
            </div>
          }
        >
          {billableLines.length === 0 ? (
            <EmptyState title="ยังไม่มีรายการที่จะออกบิล" description="เลือกใบส่งของด้านบน จากนั้นปรับจำนวนที่ต้องการออกบิล (คงเหลือสามารถออกทีหลังได้)" />
          ) : (
            <div className="space-y-4">
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
              {lineGroups
                .filter((group) => !refOnlyMode || group.kind === "manual")
                .map((group) => (
                <div
                  key={group.key}
                  className={`overflow-hidden rounded-xl border ${
                    group.kind === "manual" ? "border-dashed border-gray-300" : "border-card-border"
                  }`}
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 ${
                      group.kind === "manual" ? "bg-paper-warm/60" : "bg-paper-soft"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          group.kind === "manual" ? "bg-gray-200 text-ink-600" : "bg-primary/10 text-primary"
                        }`}
                      >
                        {group.title}
                      </span>
                      {group.dateLabel && <span className="truncate text-[11px] text-gray-500">{group.dateLabel}</span>}
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-gray-500">
                      {group.kind === "dn"
                        ? `ส่งแล้ว ${trimQty(group.deliveredTotal)} / คงเหลือ ${trimQty(group.remainingTotal)} · ${group.lines.length} รายการ`
                        : `${group.lines.length} รายการ`}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[620px]">
                      <LineGridHeaderRow />
                      <div className="divide-y divide-card-border">
                        {group.lines.map((l) => {
                          const qtyChanged = l.deliveredQty > 0 && Math.abs(l.quantity - l.deliveredQty) > EPS;
                          const priceChanged = l.dnUnitPrice > 0 && Math.abs(l.unit_price - l.dnUnitPrice) > EPS;
                          return (
                            <div
                              key={l.key}
                              className="grid grid-cols-[minmax(180px,1fr)_78px_58px_98px_62px_100px_30px] items-start gap-x-2 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <input
                                  value={l.item_name}
                                  onChange={(event) => updateLine(l.key, { item_name: event.target.value })}
                                  placeholder="ชื่อรายการ"
                                  className="w-full rounded-lg border border-transparent bg-gray-50 px-2 py-1.5 text-sm font-medium text-ink-900 outline-none transition-colors placeholder:font-normal placeholder:text-gray-400 hover:border-gray-200 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                                />
                                <input
                                  value={l.line_note}
                                  onChange={(event) => updateLine(l.key, { line_note: event.target.value })}
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
                                      quantity: Math.max(0, Math.min(Number(event.target.value) || 0, l.maxQty)),
                                    })
                                  }
                                  className={numericInputClass(false)}
                                />
                                {qtyChanged && (
                                  <div className="mt-0.5 text-right text-[10px] leading-3 text-gray-400">
                                    DN: {trimQty(l.deliveredQty)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <input
                                  value={l.unit}
                                  onChange={(event) => updateLine(l.key, { unit: event.target.value })}
                                  className="w-full rounded-lg border border-card-border bg-white px-2 py-1.5 text-sm text-ink-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                              </div>
                              <div>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={l.unit_price}
                                  onChange={(event) => updateLine(l.key, { unit_price: Number(event.target.value) || 0 })}
                                  className={numericInputClass(priceChanged)}
                                />
                                {priceChanged && (
                                  <div className="mt-0.5 text-right text-[10px] font-medium leading-3 text-amber-600">
                                    DN: {trimQty(l.dnUnitPrice)}
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
                                      discount_percent: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
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
              ))}
              <Button variant="secondary" className="w-full justify-center" onClick={addManualLine}>
                + เพิ่มรายการเพิ่มเติม (ค่าขนส่ง / ส่วนต่าง)
              </Button>
            </div>
          )}
        </FormStep>

        <DocumentOptionsCard number={4}>
          <DocumentOptionRow
            label="โหมดอ้างอิง"
            description="PDF แสดง 1 บรรทัดต่อใบส่งของ (เหมือนใบวางบิล) ปิดเพื่อแสดงรายการสินค้าแบบละเอียด"
            checked={refOnlyMode}
            onChange={setRefOnlyMode}
          />
          {!refOnlyMode && (
            <DocumentOptionRow
              label="แสดงส่วนต่างจากใบส่งของในใบกำกับภาษี"
              badge="โหมดรายละเอียด"
              description="พิมพ์จำนวน/ราคาที่เปลี่ยนไปจากใบส่งของต้นทาง เป็นหลักฐานประกอบใบกำกับภาษี"
              checked={showDnVariance}
              onChange={setShowDnVariance}
            />
          )}
          {dnAppendixEnabled && selectedDeliveryNotes.length > 0 && (
            <DocumentOptionRow
              label="แนบภาคผนวกรายละเอียดการส่งของ"
              badge="ใบส่งของ"
              description="PDF แสดงรายการแบบกระชับ และแนบตารางเปรียบเทียบ ส่งแล้ว vs เรียกเก็บ ตามใบส่งของท้ายเอกสาร"
              checked={dnAppendix}
              onChange={setDnAppendix}
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
              sourceHint={poTaskDerivation.sourceHint}
              poConflicts={poTaskDerivation.poConflicts}
              taskConflicts={poTaskDerivation.taskConflicts}
            />
            <Input label="หมายเหตุ" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น รวมใบส่งของประจำเดือนนี้" />
            <div className="rounded-xl border border-card-border bg-paper-soft p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
                <FileStack className="h-3.5 w-3.5" />
                รวม {selectedDeliveryNotes.length} ใบส่งของ / {billableLines.length} รายการที่ออกบิล
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

function lineNetFromLine(l: DnLineWithRemaining) {
  const base = (Number(l.unit_price) || 0) * Math.max(0, l.remaining);
  return Math.max(0, base - (l.discount_percent > 0 ? (base * l.discount_percent) / 100 : Number(l.discount_amount) || 0));
}
