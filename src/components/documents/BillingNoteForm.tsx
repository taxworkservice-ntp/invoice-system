import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, MoreHorizontal, TriangleAlert } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { DateInput } from "../ui/DateInput";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { CustomerPickerModal } from "../customers/CustomerPickerModal";
import { FormStep } from "./FormStep";
import { FormActionBar } from "./FormActionBar";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useCustomers } from "../../hooks/useCustomers";
import { useToast } from "../../hooks/useToast";
import { supabase } from "../../lib/supabase";
import { formatBuddhistDate } from "../../lib/dates";
import { assertDocNumberAvailable, resolveDocNumber } from "../../lib/docNumber";
import { addDaysString, businessTodayString } from "../../lib/devDate";
import { deleteDocumentFiles } from "../../lib/r2";
import { WHT_RATE_OPTIONS } from "../../constants";
import type {
  BillingNoteInvoice,
  Customer,
  Deal,
  Document,
  DocumentLineItem,
  DocumentStatus,
  WhtRate,
} from "../../types";
import {
  EditableDocNumber,
  EditableDocNumberInline,
} from "./EditableDocNumber";

type InvoiceOption = Document & {
  line_items: DocumentLineItem[];
  deal?: Pick<Deal, "id" | "title"> | null;
  itemSummary: string;
  linkedBillingNoteId?: string | null;
  linkedBillingNoteStatus?: DocumentStatus | null;
  isLockedByOtherBillingNote?: boolean;
  isVoidedLinked?: boolean;
};

type FormErrors = Partial<
  Record<"customer" | "invoices" | "dueDate" | "general", string>
>;

function resolveCreditTermDays(
  customer: Customer | null | undefined,
  clientProfileDays: number | null | undefined,
): number {
  return customer?.credit_term_days ?? clientProfileDays ?? 7;
}

function buildItemSummary(items: DocumentLineItem[]) {
  if (!items.length) return "ไม่มีรายการ";
  const summary = items
    .slice(0, 2)
    .map((item) => `${item.item_name} × ${item.quantity}`)
    .join(", ");
  return items.length > 2
    ? `${summary} และอีก ${items.length - 2} รายการ`
    : summary;
}

function uniqueStrings(values: (string | null | undefined)[]) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function staticSkeletonLine(className: string) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

interface BillingNoteFormProps {
  dealId?: string;
  documentId?: string;
}

export function BillingNoteForm({ dealId, documentId }: BillingNoteFormProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;
  const {
    customers,
    loading: customersLoading,
    addCustomer,
  } = useCustomers(userId);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "preview" | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");

  const [existingDocument, setExistingDocument] = useState<Document | null>(
    null,
  );
  const [currentDocumentId, setCurrentDocumentId] = useState<
    string | undefined
  >(documentId);
  const [currentDeal, setCurrentDeal] = useState<
    (Pick<Deal, "id" | "title"> & { customer?: Customer | null }) | null
  >(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [issueDate, setIssueDate] = useState(() => businessTodayString(clientProfile));
  const [dueDate, setDueDate] = useState(() => addDaysString(businessTodayString(clientProfile), 7));

  useEffect(() => {
    if (documentId) return;
    const realToday = businessTodayString(null);
    if (issueDate === realToday) {
      setIssueDate(businessToday);
      setDueDate(addDaysString(businessToday, resolveCreditTermDays(selectedCustomer, clientProfile?.credit_term_days)));
    }
  }, [businessToday, clientProfile?.credit_term_days, documentId, issueDate, selectedCustomer]);

  useEffect(() => {
    if (clientProfile && !documentId) {
      const days = resolveCreditTermDays(
        selectedCustomer,
        clientProfile.credit_term_days,
      );
      setDueDate(addDaysString(issueDate, days));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProfile, selectedCustomer]);

  const [note, setNote] = useState("");
  const [whtRate, setWhtRate] = useState<WhtRate>("0");

  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(
    new Set(),
  );
  const [savedInvoiceIds, setSavedInvoiceIds] = useState<Set<string>>(
    new Set(),
  );
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [otherDealsExpanded, setOtherDealsExpanded] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showVoidedWarning, setShowVoidedWarning] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const initialHydratedRef = useRef(false);
  const customerLocked = Boolean(dealId || existingDocument);
  const readOnly = existingDocument?.status === "paid";
  const isDraft = !existingDocument || existingDocument.status === "draft";

  const selectedCustomerId = selectedCustomer?.id || null;

  const selectedInvoices = useMemo(
    () =>
      invoiceOptions.filter((invoice) => selectedInvoiceIds.has(invoice.id)),
    [invoiceOptions, selectedInvoiceIds],
  );

  const availableCurrentDealInvoices = useMemo(() => {
    if (!dealId) return [];
    return invoiceOptions.filter((invoice) => invoice.deal_id === dealId);
  }, [dealId, invoiceOptions]);

  const otherDealInvoices = useMemo(() => {
    if (!dealId) return invoiceOptions;
    return invoiceOptions.filter((invoice) => invoice.deal_id !== dealId);
  }, [dealId, invoiceOptions]);

  const otherDealInvoiceGroups = useMemo(() => {
    const grouped = new Map<
      string,
      { dealId: string; label: string; invoices: InvoiceOption[] }
    >();
    for (const invoice of otherDealInvoices) {
      const key = invoice.deal_id || `no-deal-${invoice.id}`;
      const label =
        invoice.deal?.title || selectedCustomer?.name || "งานขายไม่มีชื่อ";
      const group = grouped.get(key) || { dealId: key, label, invoices: [] };
      group.invoices.push(invoice);
      grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [otherDealInvoices, selectedCustomer?.name]);

  const totals = useMemo(() => {
    const subtotal = selectedInvoices.reduce(
      (sum, invoice) => sum + invoice.subtotal,
      0,
    );
    const vatAmount = selectedInvoices.reduce(
      (sum, invoice) => sum + invoice.vat_amount,
      0,
    );
    const totalAmount = selectedInvoices.reduce(
      (sum, invoice) => sum + invoice.total_amount,
      0,
    );
    const whtPercent = parseFloat(whtRate);
    const whtAmount = Math.round(subtotal * whtPercent) / 100;
    const netPayable = Math.round((totalAmount - whtAmount) * 100) / 100;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      whtAmount: Math.round(whtAmount * 100) / 100,
      netPayable,
    };
  }, [selectedInvoices, whtRate]);

  const pastDueDate = dueDate
    ? new Date(dueDate) < new Date(todayString())
    : false;

  const loadInvoiceOptions = useCallback(
    async (
      customerId: string,
      currentDocId?: string,
      currentDealId?: string,
    ) => {
      if (!userId) return;
      setLoadingInvoices(true);

      const currentLinksPromise = currentDocId
        ? supabase
            .from("billing_note_invoices")
            .select("*")
            .eq("billing_note_id", currentDocId)
        : Promise.resolve({ data: [] as BillingNoteInvoice[], error: null });

      const { data: currentLinks } = await currentLinksPromise;
      const currentLinkIds = new Set(
        (currentLinks || []).map((link) => link.invoice_id),
      );

      const { data: invoiceDocs, error: invoiceError } = await supabase
        .from("documents")
        .select("*, deal:deal_id(id, title)")
        .eq("user_id", userId)
        .eq("customer_id", customerId)
        .eq("doc_type", "invoice")
        .in("status", ["sent", "in_billing", "voided", "paid"])
        .order("issue_date", { ascending: true });

      if (invoiceError) {
        setLoadingInvoices(false);
        throw invoiceError;
      }

      const invoiceIds = (invoiceDocs || []).map((invoice: any) => invoice.id);
      const linkedInvoiceIds = [...currentLinkIds].filter(
        (id) => !invoiceIds.includes(id),
      );
      const allInvoiceIds = uniqueStrings([...invoiceIds, ...linkedInvoiceIds]);

      const missingInvoicesPromise = linkedInvoiceIds.length
        ? supabase
            .from("documents")
            .select("*, deal:deal_id(id, title)")
            .in("id", linkedInvoiceIds)
        : Promise.resolve({ data: [] as any[], error: null });

      const [missingInvoicesResult, lineItemsResult, allLinksResult] =
        await Promise.all([
          missingInvoicesPromise,
          allInvoiceIds.length
            ? supabase
                .from("document_line_items")
                .select("*")
                .in("document_id", allInvoiceIds)
                .order("sort_order", { ascending: true })
            : Promise.resolve({ data: [] as DocumentLineItem[], error: null }),
          allInvoiceIds.length
            ? supabase
                .from("billing_note_invoices")
                .select("invoice_id, billing_note_id")
                .in("invoice_id", allInvoiceIds)
            : Promise.resolve({
                data: [] as { invoice_id: string; billing_note_id: string }[],
                error: null,
              }),
        ]);

      const allInvoicesRaw = [
        ...((invoiceDocs || []) as any[]),
        ...((missingInvoicesResult.data || []) as any[]),
      ];
      const lineItemsByInvoice = new Map<string, DocumentLineItem[]>();
      ((lineItemsResult.data || []) as DocumentLineItem[]).forEach(
        (lineItem) => {
          const existing = lineItemsByInvoice.get(lineItem.document_id) || [];
          existing.push(lineItem);
          lineItemsByInvoice.set(lineItem.document_id, existing);
        },
      );

      const billingNoteIds = uniqueStrings(
        (allLinksResult.data || []).map((link) => link.billing_note_id),
      );
      const { data: billingNoteDocs } = billingNoteIds.length
        ? await supabase
            .from("documents")
            .select("id, status")
            .in("id", billingNoteIds)
        : { data: [] as Pick<Document, "id" | "status">[] };

      const billingNoteStatusMap = new Map<string, DocumentStatus>();
      ((billingNoteDocs || []) as Pick<Document, "id" | "status">[]).forEach(
        (billingDoc) => {
          billingNoteStatusMap.set(billingDoc.id, billingDoc.status);
        },
      );

      const linkByInvoiceId = new Map<
        string,
        { billingNoteId: string; status: DocumentStatus | null }[]
      >();
      (
        (allLinksResult.data || []) as {
          invoice_id: string;
          billing_note_id: string;
        }[]
      ).forEach((link) => {
        const existing = linkByInvoiceId.get(link.invoice_id) || [];
        existing.push({
          billingNoteId: link.billing_note_id,
          status: billingNoteStatusMap.get(link.billing_note_id) || null,
        });
        linkByInvoiceId.set(link.invoice_id, existing);
      });

      const options: InvoiceOption[] = allInvoicesRaw
        .map((invoice) => {
          const lineItems = lineItemsByInvoice.get(invoice.id) || [];
          const links = linkByInvoiceId.get(invoice.id) || [];
          const activeOtherLink = links.find(
            (link) =>
              link.billingNoteId !== currentDocId && link.status !== "voided",
          );
          const isCurrentLinked = currentLinkIds.has(invoice.id);

          return {
            ...(invoice as Document),
            line_items: lineItems,
            itemSummary: buildItemSummary(lineItems),
            linkedBillingNoteId: activeOtherLink?.billingNoteId || null,
            linkedBillingNoteStatus: activeOtherLink?.status || null,
            isLockedByOtherBillingNote: Boolean(activeOtherLink),
            isVoidedLinked: isCurrentLinked && invoice.status === "voided",
          } satisfies InvoiceOption;
        })
        .filter((invoice) => {
          if (invoice.isLockedByOtherBillingNote) return false;
          if (invoice.status === "sent") return true;
          if (currentLinkIds.has(invoice.id)) return true;
          return false;
        });

      setInvoiceOptions(options);

      if (!initialHydratedRef.current) {
        if (currentDocId) {
          const validLinkedIds = options
            .filter(
              (invoice) =>
                currentLinkIds.has(invoice.id) && invoice.status !== "voided",
            )
            .map((invoice) => invoice.id);
          setSelectedInvoiceIds(new Set(validLinkedIds));
          setSavedInvoiceIds(new Set(validLinkedIds));
          setShowVoidedWarning(
            options.some((invoice) => invoice.isVoidedLinked),
          );
        } else if (currentDealId) {
          setSelectedInvoiceIds(
            new Set(
              options
                .filter(
                  (invoice) =>
                    invoice.deal_id === currentDealId &&
                    invoice.status === "sent",
                )
                .map((invoice) => invoice.id),
            ),
          );
        }
        initialHydratedRef.current = true;
      } else if (currentDocId) {
        setShowVoidedWarning(options.some((invoice) => invoice.isVoidedLinked));
      }

      setLoadingInvoices(false);
    },
    [userId],
  );

  const loadInitialData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      if (documentId) {
        const { data: docData, error: docError } = await supabase
          .from("documents")
          .select("*, customer:customer_id(*), deal:deal_id(id, title)")
          .eq("id", documentId)
          .single();

        if (docError) throw docError;
        const document = docData as unknown as Document & {
          deal?: Pick<Deal, "id" | "title"> | null;
        };
        if (document.doc_type !== "billing_note") {
          navigate(`/documents/${document.id}`, { replace: true });
          return;
        }

        setExistingDocument(document);
        setCurrentDocumentId(document.id);
        setSelectedCustomer(document.customer || null);
        setIssueDate(document.issue_date);
        setDueDate(
          document.due_date ||
            addDaysString(
              document.issue_date,
              resolveCreditTermDays(
                document.customer,
                clientProfile?.credit_term_days,
              ),
            ),
        );
        setNote(document.note || "");
        setWhtRate(
          String(
            document.wht_rate || clientProfile?.default_wht_rate || "0",
          ) as WhtRate,
        );
        setCurrentDeal(
          document.deal
            ? {
                id: document.deal.id,
                title: document.deal.title,
                customer: document.customer,
              }
            : null,
        );

        if (document.customer_id) {
          await loadInvoiceOptions(
            document.customer_id,
            document.id,
            document.deal_id || undefined,
          );
        }
      } else if (dealId) {
        const { data: dealData, error: dealError } = await supabase
          .from("deals")
          .select("*, customers(*)")
          .eq("id", dealId)
          .single();

        if (dealError) throw dealError;
        const customer = (dealData as any).customers as Customer | null;
        setCurrentDeal({
          id: (dealData as any).id,
          title: (dealData as any).title,
          customer,
        });
        if (customer) {
          setSelectedCustomer(customer);
          await loadInvoiceOptions(customer.id, undefined, dealId);
        }
        setWhtRate(clientProfile?.default_wht_rate || "0");
      } else {
        setWhtRate(clientProfile?.default_wht_rate || "0");
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "โหลดข้อมูลฟอร์มไม่สำเร็จ",
      );
      navigate("/documents", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [
    clientProfile?.default_wht_rate,
    dealId,
    documentId,
    loadInvoiceOptions,
    navigate,
    toast,
    userId,
  ]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Warn before reload/close while the form has unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const requestBack = useCallback(() => {
    if (isDirty && isDraft && !readOnly) setLeaveConfirmOpen(true);
    else navigate(-1);
  }, [isDirty, isDraft, navigate, readOnly]);

  useEffect(() => {
    if (
      loading ||
      !selectedCustomerId ||
      documentId ||
      dealId ||
      !initialHydratedRef.current
    )
      return;
    loadInvoiceOptions(selectedCustomerId, currentDocumentId, undefined).catch(
      (err: unknown) => {
        toast.error(
          err instanceof Error ? err.message : "โหลดใบแจ้งหนี้ไม่สำเร็จ",
        );
      },
    );
  }, [
    currentDocumentId,
    dealId,
    documentId,
    loadInvoiceOptions,
    loading,
    selectedCustomerId,
    toast,
  ]);

  const validate = useCallback(() => {
    const nextErrors: FormErrors = {};
    if (!selectedCustomerId) nextErrors.customer = "กรุณาเลือกลูกค้า";
    if (!dueDate) nextErrors.dueDate = "กรุณาระบุวันครบกำหนด";
    else if (dueDate < issueDate)
      nextErrors.dueDate = "วันครบกำหนดต้องไม่ก่อนวันที่ออกใบวางบิล";
    if (selectedInvoiceIds.size === 0)
      nextErrors.invoices = "กรุณาเลือกอย่างน้อย 1 ใบแจ้งหนี้";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [dueDate, issueDate, selectedCustomerId, selectedInvoiceIds.size]);

  const handleSelectCustomer = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setIsDirty(true);
      setErrors((prev) => ({ ...prev, customer: "" }));
      setInvoiceOptions([]);
      setSelectedInvoiceIds(new Set());
      setSavedInvoiceIds(new Set());
      initialHydratedRef.current = true;
      loadInvoiceOptions(customer.id).catch((err: unknown) => {
        toast.error(
          err instanceof Error ? err.message : "โหลดใบแจ้งหนี้ไม่สำเร็จ",
        );
      });
    },
    [loadInvoiceOptions, toast],
  );

  const persistBillingNote = useCallback(
    async (options?: {
      assignDocNumber?: boolean;
      showToast?: boolean;
      navigateToDetail?: boolean;
    }) => {
      if (!userId || !selectedCustomerId) return null;
      if (!validate()) return null;

      const previouslySavedIds = [...savedInvoiceIds];
      const currentlySelectedIds = [...selectedInvoiceIds];
      const deselectedIds = previouslySavedIds.filter(
        (id) => !selectedInvoiceIds.has(id),
      );
      const selectedInvoicesNow = invoiceOptions.filter((invoice) =>
        selectedInvoiceIds.has(invoice.id),
      );
      if (!selectedInvoicesNow.length) return null;

      let resolvedDealId = dealId || currentDeal?.id || null;
      if (!resolvedDealId) {
        const { data: createdDeal, error: dealError } = await supabase
          .from("deals")
          .insert({
            user_id: userId,
            customer_id: selectedCustomerId,
            title: null,
          })
          .select("id, title")
          .single();

        if (dealError || !createdDeal) {
          const message =
            dealError?.message || "ไม่สามารถสร้างดีลสำหรับใบวางบิลได้";
          setErrors((prev) => ({ ...prev, general: message }));
          toast.error(message);
          return null;
        }

        resolvedDealId = createdDeal.id;
        setCurrentDeal({ id: createdDeal.id, title: createdDeal.title });
      }

      const payload: Partial<Document> = {
        id: currentDocumentId,
        user_id: userId,
        deal_id: resolvedDealId,
        customer_id: selectedCustomerId,
        doc_type: "billing_note",
        doc_number: docNumberOverride || existingDocument?.doc_number || null,
        status: existingDocument?.status === "paid" ? "paid" : "draft",
        issue_date: issueDate,
        due_date: dueDate,
        vat_registered: selectedInvoicesNow.some(
          (invoice) => invoice.vat_registered,
        ),
        vat_rate: clientProfile?.vat_rate ?? 7,
        wht_rate: parseFloat(whtRate),
        subtotal: totals.subtotal,
        vat_amount: totals.vatAmount,
        total_amount: totals.totalAmount,
        wht_amount: totals.whtAmount,
        net_payable: totals.netPayable,
        note: note || null,
      };

      if (docNumberOverride.trim()) {
        await assertDocNumberAvailable(userId, docNumberOverride.trim(), currentDocumentId);
        payload.doc_number = docNumberOverride.trim();
      }

      if (options?.assignDocNumber && !payload.doc_number) {
        payload.doc_number = await resolveDocNumber(
          userId,
          "billing_note",
          issueDate,
        );
      }

      try {
        const { data: savedDoc, error: docError } = payload.id
          ? await supabase
              .from("documents")
              .update(payload)
              .eq("id", payload.id)
              .select("*")
              .single()
          : await supabase
              .from("documents")
              .insert(payload)
              .select("*")
              .single();

        if (docError || !savedDoc)
          throw docError || new Error("ไม่สามารถบันทึกใบวางบิลได้");

        await supabase
          .from("billing_note_invoices")
          .delete()
          .eq("billing_note_id", savedDoc.id);

        const linkRows = selectedInvoicesNow.map((invoice) => ({
          billing_note_id: savedDoc.id,
          invoice_id: invoice.id,
          user_id: userId,
          invoice_number: invoice.doc_number || "",
          issue_date: invoice.issue_date || null,
          subtotal: invoice.subtotal,
          vat_amount: invoice.vat_amount,
          total_amount: invoice.total_amount,
        }));

        const { error: linkError } = await supabase
          .from("billing_note_invoices")
          .insert(linkRows);
        if (linkError) {
          // Roll back the orphaned billing-note document if its links were
          // rejected (e.g. the DB guard blocked a duplicate active link).
          await supabase.from("documents").delete().eq("id", savedDoc.id);
          throw linkError;
        }

        if (currentlySelectedIds.length > 0) {
          const { error: selectedStatusError } = await supabase
            .from("documents")
            .update({ status: "in_billing" as DocumentStatus })
            .in("id", currentlySelectedIds);
          if (selectedStatusError) throw selectedStatusError;

          const { error: moveError } = await supabase
            .from("documents")
            .update({ deal_id: resolvedDealId })
            .in("id", currentlySelectedIds);
          if (moveError) throw moveError;
        }

        const restorableDeselectedIds = deselectedIds.filter((id) => {
          const invoice = invoiceOptions.find((option) => option.id === id);
          return invoice?.status === "in_billing";
        });

        if (restorableDeselectedIds.length > 0) {
          const { error: deselectError } = await supabase
            .from("documents")
            .update({ status: "sent" as DocumentStatus })
            .in("id", restorableDeselectedIds);
          if (deselectError) throw deselectError;
        }

        setExistingDocument(savedDoc as Document);
        setCurrentDocumentId(savedDoc.id);
        setSavedInvoiceIds(new Set(currentlySelectedIds));
        setErrors({});
        setIsDirty(false);

        if (options?.showToast) {
          toast.success(
            options.navigateToDetail ? "บันทึกใบวางบิลแล้ว" : "บันทึกร่างแล้ว",
          );
        }

        if (options?.navigateToDetail) {
          const targetDealId = savedDoc.deal_id || resolvedDealId;
          if (targetDealId) navigate(`/deals/${targetDealId}`);
          else navigate(`/documents/${savedDoc.id}`);
        }

        return savedDoc as Document;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "บันทึกใบวางบิลไม่สำเร็จ";
        toast.error(message);
        setErrors((prev) => ({ ...prev, general: message }));
        return null;
      }
    },
    [
      clientProfile?.vat_rate,
      currentDeal?.id,
      currentDocumentId,
      dueDate,
      existingDocument?.doc_number,
      existingDocument?.status,
      invoiceOptions,
      issueDate,
      navigate,
      note,
      savedInvoiceIds,
      selectedCustomerId,
      selectedInvoiceIds,
      toast,
      totals.netPayable,
      totals.subtotal,
      totals.totalAmount,
      totals.vatAmount,
      totals.whtAmount,
      userId,
      validate,
      whtRate,
      dealId,
    ],
  );

  const handleSaveDraft = async () => {
    setSaving("draft");
    await persistBillingNote({ showToast: true });
    setSaving(null);
  };

  const handleSaveAndPreview = async () => {
    setSaving("preview");
    await persistBillingNote({
      assignDocNumber: true,
      showToast: true,
      navigateToDetail: true,
    });
    setSaving(null);
  };

  const handleDeleteDraft = async () => {
    if (!currentDocumentId) return;
    setDeleting(true);
    try {
      const selectedIds = [...savedInvoiceIds];
      if (selectedIds.length > 0) {
        await supabase
          .from("documents")
          .update({ status: "sent" as DocumentStatus })
          .in("id", selectedIds);
      }
      await supabase
        .from("billing_note_invoices")
        .delete()
        .eq("billing_note_id", currentDocumentId);
      await deleteDocumentFiles(currentDocumentId);
      await supabase.from("documents").delete().eq("id", currentDocumentId);
      toast.success("ลบร่างใบวางบิลแล้ว");
      if (dealId) navigate(`/deals/${dealId}`);
      else navigate("/documents");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "ลบร่างไม่สำเร็จ");
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  const toggleInvoice = (invoiceId: string) => {
    if (readOnly) return;
    const invoice = invoiceOptions.find((option) => option.id === invoiceId);
    if (
      !invoice ||
      invoice.isLockedByOtherBillingNote ||
      invoice.isVoidedLinked
    )
      return;
    setIsDirty(true);
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
    setErrors((prev) => ({ ...prev, invoices: "" }));
  };

  const topAction =
    currentDocumentId && isDraft ? (
      <button
        onClick={() => setDeleteModalOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">ลบร่าง</span>
      </button>
    ) : undefined;

  if (loading || customersLoading) {
    return (
      <AppShell title="ใบวางบิล" showBack onBack={requestBack} action={topAction}>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index}>
              <div className="space-y-3">
                {staticSkeletonLine("h-4 w-24")}
                {staticSkeletonLine("h-10 w-full")}
                {staticSkeletonLine("h-3 w-32")}
              </div>
            </Card>
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="ใบวางบิล" showBack onBack={requestBack} action={topAction}>
      <div className="space-y-4 pb-24">
        {showVoidedWarning && (
          <div className="rounded-card border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">
                  ใบแจ้งหนี้ที่เชื่อมอยู่ถูกยกเลิกแล้ว
                </div>
                <div className="mt-1 text-xs text-yellow-700">
                  กรุณาตรวจสอบรายการที่เลือกก่อนส่งอีกครั้ง
                </div>
              </div>
            </div>
          </div>
        )}

        {existingDocument?.status === "paid" && (
          <div className="rounded-card border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="font-medium">ชำระแล้ว — เอกสารนี้ปิดแล้ว</div>
          </div>
        )}

        {errors.general && (
          <div className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {errors.general}
          </div>
        )}

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-gray-900">ใบวางบิล</div>
              <div className="mt-1 text-sm text-gray-500">
                {selectedCustomer?.name || "ยังไม่ได้เลือกลูกค้า"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge status={existingDocument?.status || "draft"} />
              <EditableDocNumberInline
                value={existingDocument?.doc_number || "-"}
                onSave={async (newValue) => {
                  if (!currentDocumentId || !userId) return;
                  await assertDocNumberAvailable(userId, newValue, currentDocumentId);
                  const { error } = await supabase
                    .from("documents")
                    .update({ doc_number: newValue })
                    .eq("id", currentDocumentId);
                  if (error) throw error;
                  setExistingDocument((prev) =>
                    prev ? { ...prev, doc_number: newValue } : prev,
                  );
                }}
              />
              {!existingDocument?.doc_number && (
                <span className="text-xs text-gray-500">
                  ร่าง — ยังไม่มีเลขที่
                </span>
              )}
            </div>
          </div>
        </Card>

        <FormStep number={1} title="ลูกค้าและวันที่">
          {customerLocked ? (
            selectedCustomer ? (
              <div className="rounded-xl border border-card-border bg-page-bg p-3">
                <div className="text-sm font-medium text-gray-900">
                  {selectedCustomer.name}
                </div>
                {selectedCustomer.tax_id && (
                  <div className="mt-1 text-xs text-gray-500">
                    เลขผู้เสียภาษี: {selectedCustomer.tax_id}
                  </div>
                )}
                {selectedCustomer.address && (
                  <div className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">
                    {selectedCustomer.address}
                  </div>
                )}
              </div>
            ) : (
              <Spinner />
            )
          ) : selectedCustomer ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-card-border bg-paper-soft p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {selectedCustomer.name}
                </div>
                {selectedCustomer.tax_id && (
                  <div className="mt-1 text-xs text-gray-500">
                    เลขผู้เสียภาษี: {selectedCustomer.tax_id}
                  </div>
                )}
                {selectedCustomer.address && (
                  <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                    {selectedCustomer.address}
                  </div>
                )}
                {(!selectedCustomer.tax_id || !selectedCustomer.address) && (
                  <div className="mt-1 text-xs text-amber-600">
                    ข้อมูลลูกค้ายังไม่ครบสำหรับเอกสารภาษี
                  </div>
                )}
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCustomerPickerOpen(true)}
                >
                  เปลี่ยน
                </Button>
              )}
            </div>
          ) : (
            <Button
              variant="secondary"
              className="w-full justify-center"
              disabled={readOnly}
              onClick={() => setCustomerPickerOpen(true)}
            >
              เลือกลูกค้า
            </Button>
          )}
          {errors.customer && (
            <div className="mt-2 text-xs text-red-500">{errors.customer}</div>
          )}
          <CustomerPickerModal
            open={customerPickerOpen && !readOnly}
            customers={customers}
            selectedCustomerId={selectedCustomer?.id}
            taxSensitive
            onClose={() => setCustomerPickerOpen(false)}
            onSelect={handleSelectCustomer}
            onCreate={async (customer) => addCustomer(customer)}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="issueDate" className="block text-xs font-medium text-gray-600 mb-1">
                วันที่ออกใบวางบิล
              </label>
              <DateInput
                id="issueDate"
                value={issueDate}
                onChange={(event) => {
                  setIsDirty(true);
                  const nextValue = event.target.value;
                  setIssueDate(nextValue);
                  setDueDate(
                    addDaysString(
                      nextValue,
                      resolveCreditTermDays(
                        selectedCustomer,
                        clientProfile?.credit_term_days,
                      ),
                    ),
                  );
                }}
                disabled={readOnly}
              />
              <div className="mt-1 text-xs text-gray-500">
                {formatBuddhistDate(issueDate)}
              </div>
            </div>
            <div>
              <label htmlFor="dueDate" className="block text-xs font-medium text-gray-600 mb-1">
                ครบกำหนดชำระ
              </label>
              <DateInput
                id="dueDate"
                value={dueDate}
                onChange={(event) => {
                  setIsDirty(true);
                  setDueDate(event.target.value);
                  setErrors((prev) => ({ ...prev, dueDate: "" }));
                }}
                disabled={readOnly}
                className={errors.dueDate ? "border-red-400" : ""}
              />{errors.dueDate && <p className="text-xs text-red-500 mt-1">{errors.dueDate}</p>}
              <div className="mt-1 text-xs text-gray-500">
                {dueDate ? formatBuddhistDate(dueDate) : "-"}
              </div>
              {pastDueDate && (
                <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  <span>วันครบกำหนดผ่านมาแล้ว</span>
                </div>
              )}
            </div>
          </div>
        </FormStep>

        <FormStep number={2} title="เลือกใบแจ้งหนี้">
          {!selectedCustomerId ? (
            <div className="rounded-xl border border-dashed border-card-border bg-page-bg px-4 py-6 text-center text-sm text-gray-500">
              เลือกลูกค้าก่อนเพื่อดูใบแจ้งหนี้
            </div>
          ) : loadingInvoices ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-xl border border-card-border px-3 py-3"
                >
                  {staticSkeletonLine("h-5 w-5 rounded")}
                  <div className="flex-1 space-y-2">
                    {staticSkeletonLine("h-4 w-28")}
                    {staticSkeletonLine("h-3 w-48")}
                  </div>
                  {staticSkeletonLine("h-4 w-16")}
                </div>
              ))}
            </div>
          ) : invoiceOptions.length === 0 ? (
            <EmptyState
              title="ไม่มีใบแจ้งหนี้ที่รอชำระ"
              description="ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ค้างชำระ"
              action={
                dealId ? (
                  <button
                    className="text-sm font-medium text-primary"
                    onClick={() =>
                      navigate(`/deals/new?type=invoice&dealId=${dealId}`)
                    }
                  >
                    สร้างใบแจ้งหนี้ใหม่ →
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {dealId && availableCurrentDealInvoices.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] text-gray-400">จากงานขายนี้</div>
                  {availableCurrentDealInvoices.map((invoice) => (
                    <InvoiceRow
                      key={invoice.id}
                      invoice={invoice}
                      checked={selectedInvoiceIds.has(invoice.id)}
                      disabled={Boolean(readOnly || invoice.isVoidedLinked)}
                      onToggle={() => toggleInvoice(invoice.id)}
                    />
                  ))}
                </div>
              )}

              {otherDealInvoices.length > 0 && (
                <div className="rounded-xl border border-card-border">
                  <button
                    className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-primary"
                    onClick={() => setOtherDealsExpanded((prev) => !prev)}
                    type="button"
                  >
                    <span>
                      เพิ่มใบแจ้งหนี้จากงานขายอื่น ({otherDealInvoices.length}{" "}
                      รายการ)
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${otherDealsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {otherDealsExpanded && (
                    <div className="border-t border-card-border px-3 py-3">
                      <div className="space-y-3">
                        {otherDealInvoiceGroups.map((group) => (
                          <div key={group.dealId} className="space-y-1">
                            <div className="text-[11px] text-gray-400">
                              งานขาย: {group.label}
                            </div>
                            {group.invoices.map((invoice) => (
                              <InvoiceRow
                                key={invoice.id}
                                invoice={invoice}
                                checked={selectedInvoiceIds.has(invoice.id)}
                                disabled={Boolean(
                                  readOnly || invoice.isVoidedLinked,
                                )}
                                onToggle={() => toggleInvoice(invoice.id)}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {errors.invoices && (
            <div className="mt-2 text-xs text-red-500">{errors.invoices}</div>
          )}
        </FormStep>

        <FormStep number={3} title="สรุปและบันทึก">
          {selectedInvoices.length === 0 ? (
            <div className="text-sm text-gray-500">
              ยังไม่ได้เลือกใบแจ้งหนี้
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {selectedInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="border-b border-draft-bg pb-2 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {invoice.doc_number}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatBuddhistDate(invoice.issue_date)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-700">
                        <div>
                          ฿{" "}
                          {invoice.subtotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                        <div>
                          VAT ฿{" "}
                          {invoice.vat_amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                        <div>
                          รวม ฿{" "}
                          {invoice.total_amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-card-border pt-3 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">ราคารวมทั้งหมด</span>
                  <span>
                    ฿{" "}
                    {totals.subtotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">VAT รวม</span>
                  <span>
                    ฿{" "}
                    {totals.vatAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="my-2 h-px bg-card-border" />
                <div className="flex justify-between py-1 font-medium">
                  <span>รวมทั้งสิ้น</span>
                  <span>
                    ฿{" "}
                    {totals.totalAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-red-600">
                  <span>หัก ณ ที่จ่าย {whtRate}%</span>
                  <span>
                    -฿{" "}
                    {totals.whtAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="my-2 h-px bg-card-border" />
                <div className="flex justify-between py-1 text-base font-semibold text-gray-900">
                  <span>ยอดที่ต้องชำระ</span>
                  <span>
                    ฿{" "}
                    {totals.netPayable.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Select
            id="whtRate"
            label="ภาษีหัก ณ ที่จ่าย"
            value={whtRate}
            onChange={(event) => {
              setIsDirty(true);
              setWhtRate(event.target.value as WhtRate);
            }}
            disabled={readOnly}
          >
            {WHT_RATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="mt-2 text-xs text-gray-500">คำนวณจากราคาก่อน VAT</div>

          <textarea
            value={note}
            onChange={(event) => {
              setIsDirty(true);
              setNote(event.target.value);
            }}
            rows={3}
            placeholder="เช่น กรุณาโอนเงินภายในวันที่กำหนด ขอบคุณครับ/ค่ะ"
            disabled={readOnly}
            className="w-full rounded-xl border border-card-border bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </FormStep>

        <EditableDocNumber
          value={docNumberOverride}
          onChange={(value) => {
            setIsDirty(true);
            setDocNumberOverride(value);
          }}
          placeholder="เลขที่ใบวางบิล (เว้นว่าง = สร้างอัตโนมัติ)"
          autoGenerate={async () =>
            userId
              ? await resolveDocNumber(userId, "billing_note", issueDate)
              : ""
          }
          className="mb-3 px-4 md:px-0"
        />

        {isDraft && !readOnly && (
          <FormActionBar
            contextLabel={`${selectedCustomer?.name || ""} · ${selectedInvoiceIds.size} ใบแจ้งหนี้`}
            totalLabel="ยอดโอนสุทธิ"
            total={totals.netPayable}
            secondary={{
              label: "บันทึกร่าง",
              onClick: handleSaveDraft,
              loading: saving === "draft",
            }}
            primary={{
              label: "บันทึกและดูรายละเอียด",
              onClick: handleSaveAndPreview,
              loading: saving === "preview",
            }}
          />
        )}
      </div>

      <Modal
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        title="ยังไม่ได้บันทึก"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            คุณมีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้โดยไม่บันทึกใช่หรือไม่?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaveConfirmOpen(false)}>
              แก้ไขต่อ
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setIsDirty(false);
                setLeaveConfirmOpen(false);
                navigate(-1);
              }}
            >
              ออกโดยไม่บันทึก
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="ลบร่างใบวางบิล"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            คุณแน่ใจว่าต้องการลบร่างใบวางบิลนี้?
            ระบบจะคืนสถานะใบแจ้งหนี้ที่เลือกกลับเป็นส่งแล้ว
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteModalOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteDraft}
              loading={deleting}
            >
              ลบร่าง
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function InvoiceRow({
  invoice,
  checked,
  disabled,
  onToggle,
}: {
  invoice: InvoiceOption;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 border-b border-card-border px-0 py-3 last:border-0 ${checked ? "bg-blue-50/60" : "bg-white"} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="mt-0.5 h-5 w-5 rounded border-card-border text-primary"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`text-sm font-semibold text-gray-900 ${invoice.isVoidedLinked ? "line-through" : ""}`}
          >
            {invoice.doc_number}
          </div>
          <div className="text-sm font-semibold text-gray-900">
            ฿{" "}
            {invoice.net_payable.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {formatBuddhistDate(invoice.issue_date)} • {invoice.itemSummary}
        </div>
        {invoice.isVoidedLinked && (
          <div className="mt-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
            ยกเลิกแล้ว
          </div>
        )}
      </div>
    </label>
  );
}
