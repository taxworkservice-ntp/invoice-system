import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Edit3,
  FileStack,
  FileText,
  MoreHorizontal,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Input, Select } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "../../../components/ui/Skeleton";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { ViewToggle } from "../../../components/ui/ViewToggle";
import type { ViewMode } from "../../../components/ui/ViewToggle";
import { SortableTh } from "../../../components/ui/SortableTh";
import { useTableSort } from "../../../components/ui/useTableSort";
import { getDocumentDetail, useDocuments } from "../../../hooks/useDocuments";
import { useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { sendDocumentWithSideEffects } from "../../../lib/documentSend";
import { voidDocumentWithSideEffects } from "../../../lib/documentVoid";
import { deleteDocumentFiles } from "../../../lib/r2";
import { businessTodayString } from "../../../lib/devDate";
import {
  DOC_TYPE_LABELS,
  STATUS_LABELS,
  CHIP_COLORS,
  PAYMENT_METHOD_LABELS,
} from "../../../constants";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import { TABLE } from "../../../lib/tableStyles";
import {
  canSendDocumentType,
  getWorkspacePermissions,
  type WorkspacePermissions,
} from "../../../lib/permissions";
import type { Document, DocumentStatus, DocumentType } from "../../../types";

const DOC_TYPE_FILTERS: { label: string; value: DocumentType | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: "ใบเสนอราคา", value: "quotation" },
  { label: "ใบแจ้งหนี้หรือใบกำกับภาษี", value: "invoice" },
  { label: "ใบกำกับภาษี/ใบเสร็จรับเงิน", value: "tax_invoice_receipt" },
  { label: "ใบวางบิล", value: "billing_note" },
  { label: "ใบเสร็จรับเงิน", value: "receipt" },
  { label: "ใบส่งของ", value: "delivery_note" },
  { label: "ใบลดหนี้", value: "credit_note" },
];

const MONTH_LABELS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR = new Date().getFullYear();

const STATUS_GROUPS = {
  processing: {
    label: "กำลังดำเนินการ",
    statuses: ["draft", "sent", "in_billing", "overdue", "converted"] as DocumentStatus[],
    color: "amber" as const,
  },
  done: {
    label: "เสร็จแล้ว",
    statuses: ["paid", "partially_paid", "generated", "issued"] as DocumentStatus[],
    color: "green" as const,
  },
  voided: {
    label: "ยกเลิก",
    statuses: ["voided"] as DocumentStatus[],
    color: "red" as const,
  },
};

type StatusGroupKey = keyof typeof STATUS_GROUPS;

const STATUS_FILTERS: { label: string; value: DocumentStatus | StatusGroupKey | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: STATUS_GROUPS.processing.label, value: "processing" },
  { label: STATUS_GROUPS.done.label, value: "done" },
  { label: STATUS_GROUPS.voided.label, value: "voided" },
];

type QuickView =
  "all" | "attention" | "draft" | "dn_invoice" | "collect" | "paid" | "voided";

function getDisplayAmount(doc: Document): number {
  return doc.doc_type === "delivery_note" ? doc.total_amount : doc.net_payable;
}

function getDisplayAmountLabel(doc: Document): string {
  return doc.doc_type === "delivery_note" ? "มูลค่าอ้างอิง" : "ยอดสุทธิ";
}

const DOC_TYPE_BORDER: Record<DocumentType, string> = {
  quotation: "border-l-purple-400",
  invoice: "border-l-blue-400",
  tax_invoice_receipt: "border-l-emerald-400",
  billing_note: "border-l-orange-400",
  receipt: "border-l-green-400",
  delivery_note: "border-l-teal-400",
  credit_note: "border-l-red-400",
};

function relativeDueLabel(dueDate: string): { text: string; urgent: boolean } {
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0)
    return { text: `เกินกำหนด ${Math.abs(diff)} วัน`, urgent: true };
  if (diff === 0) return { text: "ครบกำหนดวันนี้", urgent: true };
  if (diff === 1) return { text: "ครบกำหนดพรุ่งนี้", urgent: false };
  if (diff <= 7) return { text: `ครบกำหนดใน ${diff} วัน`, urgent: false };
  return { text: "", urgent: false };
}

function isCollectingStatus(doc: Document) {
  return (
    doc.doc_type === "billing_note" &&
    (doc.status === "sent" || doc.status === "overdue" || doc.status === "partially_paid")
  );
}

function isActuallyOverdue(doc: Document) {
  if (!doc.due_date) return false;
  return (
    (doc.status === "sent" || doc.status === "overdue") &&
    new Date(doc.due_date) < new Date(new Date().toISOString().slice(0, 10))
  );
}

function showUpdatedAt(doc: Document): boolean {
  if (!doc.updated_at) return false;
  return doc.updated_at >= doc.issue_date;
}

function getNextStepText(doc: Document) {
  if (doc.status === "draft") return "ยังไม่ได้ส่ง";
  if (doc.status === "overdue" || isActuallyOverdue(doc))
    return "ต้องติดตามการชำระ";
  if (doc.doc_type === "quotation" && doc.status === "sent")
    return "รอลูกค้ายืนยัน";
  if (doc.doc_type === "invoice" && doc.status === "sent")
    return "พร้อมวางบิลหรือรับเงิน";
  if (doc.doc_type === "delivery_note" && doc.status === "sent")
    return "ส่งของแล้ว รอออกใบแจ้งหนี้";
  if (doc.doc_type === "billing_note" && doc.status === "sent")
    return "รอรับเงิน";
  if (
    doc.status === "paid" ||
    doc.status === "generated" ||
    doc.status === "issued"
  )
    return "เสร็จสมบูรณ์";
  if (doc.status === "voided") return "เก็บไว้เป็นประวัติ";
  return "ดูรายละเอียด";
}

function DocTypeBadge({
  docType,
  vatRegistered = false,
}: {
  docType: DocumentType;
  vatRegistered?: boolean;
}) {
  return <StatusBadge docType={docType} vatRegistered={vatRegistered} />;
}

function SummaryCard({
  title,
  count,
  hint,
  active,
  tone,
  icon,
  onClick,
}: {
  title: string;
  count: number;
  hint: string;
  active: boolean;
  tone: "blue" | "amber" | "red" | "green" | "gray";
  icon: ReactNode;
  onClick: () => void;
}) {
  const tones = {
    blue: active
      ? "border-primary bg-primary-soft text-primary-deep"
      : "border-line-strong bg-white text-ink-700",
    amber: active
      ? "border-warning-border bg-warning-soft text-warning-text"
      : "border-line-strong bg-white text-ink-700",
    red: active
      ? "border-danger-strong bg-danger-soft text-danger-text"
      : "border-line-strong bg-white text-ink-700",
    green: active
      ? "border-success-strong bg-success-soft text-success-text"
      : "border-line-strong bg-white text-ink-700",
    gray: active
      ? "border-ink-700 bg-paper-warm text-ink-800"
      : "border-line-strong bg-white text-ink-700",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left shadow-sm transition-colors hover:border-ink-200 ${tones[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-medium leading-5 opacity-75">
            {title}
          </div>
          <div className="text-xl font-semibold leading-none tabular-nums">
            {count}
          </div>
        </div>
        <div className="shrink-0 opacity-80">{icon}</div>
      </div>
      <p className="mt-2 text-xs leading-5 opacity-70">{hint}</p>
    </button>
  );
}

function SectionHeader({
  title,
  hint,
  count,
  tone = "active",
}: {
  title: string;
  hint: string;
  count: number;
  tone?: "attention" | "active" | "muted";
}) {
  const dotColor =
    tone === "attention"
      ? "bg-danger"
      : tone === "active"
        ? "bg-primary"
        : "bg-gray-300";
  const dotVisible = tone !== "muted";
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-center gap-2">
        {dotVisible && (
          <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        )}
        <div>
          <h2
            className={`text-sm font-semibold ${tone === "muted" ? "text-gray-400" : "text-ink-900"}`}
          >
            {title}
          </h2>
          <p
            className={`mt-1 text-xs ${tone === "muted" ? "text-gray-300" : "text-ink-500"}`}
          >
            {hint}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 text-xs ${tone === "muted" ? "text-gray-300" : "text-ink-300"}`}
      >
        {count} รายการ
      </span>
    </div>
  );
}

function DocumentCard({
  doc,
  onOpen,
  menuOpen,
  onToggleMenu,
  onMenuAction,
  menuLoading,
  pendingConfirm,
  isSelected,
  onToggleSelect,
  selectMode,
  onOpenDeal,
  searchQuery,
  permissions,
}: {
  doc: Document;
  onOpen: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onMenuAction: (action: string) => void;
  menuLoading: boolean;
  pendingConfirm: { docId: string; action: "void" | "delete" } | null;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectMode?: boolean;
  onOpenDeal?: () => void;
  searchQuery?: string;
  permissions: WorkspacePermissions;
}) {
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuDropdownRef.current &&
        !menuDropdownRef.current.contains(e.target as Node)
      ) {
        onToggleMenu();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggleMenu();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [menuOpen, onToggleMenu]);
  const overdue = doc.status === "overdue" || isActuallyOverdue(doc);
  const isDraft = doc.status === "draft";
  const isSent = doc.status === "sent";
  const isPaid =
    doc.status === "paid" ||
    doc.status === "partially_paid" ||
    doc.status === "generated" ||
    doc.status === "issued";
  const isVoided = doc.status === "voided";
  const isConverted = doc.status === "converted";
  const isTerminal = isPaid || isVoided || isConverted;
  const dueRel = doc.due_date ? relativeDueLabel(doc.due_date) : null;
  const isConfirming = pendingConfirm?.docId === doc.id;

  const customerName = (doc as any).customer?.name || "ไม่ได้ระบุลูกค้า";
  const itemNames = Array.isArray(doc.line_items)
    ? doc.line_items.map((item) => item.item_name.trim()).filter(Boolean)
    : [];
  const previewItems = itemNames.slice(0, 3);
  const remainingItems = itemNames.length - previewItems.length;

  return (
    <Card
      onClick={selectMode ? onToggleSelect : onOpen}
      className={`cursor-pointer overflow-hidden !p-0 relative border-l-4 ${isVoided ? "border-l-gray-300 opacity-50" : DOC_TYPE_BORDER[doc.doc_type]} ${overdue ? "bg-red-50/30" : ""} ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
    >
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          {selectMode && (
            <div
              className="shrink-0 pt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isSelected || false}
                onChange={onToggleSelect}
                className="h-4 w-4 accent-primary cursor-pointer"
              />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-sm font-semibold ${isVoided ? "line-through text-gray-400" : "text-ink-900"}`}
              >
                {doc.doc_number || "-"}
              </span>
              <DocTypeBadge
                docType={doc.doc_type}
                vatRegistered={doc.vat_registered}
              />
              <span className="hidden sm:inline-flex">
                <Badge status={doc.status} />
              </span>
              {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form ? (
                <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                  ฟอร์มเปล่า
                </span>
              ) : null}
              {overdue && (
                <span className="inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                  ต้องติดตาม
                </span>
              )}
            </div>

            <div className="space-y-1">
              <span className="inline-flex sm:hidden">
                <Badge status={doc.status} />
              </span>
              {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form ? (
                <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                  ฟอร์มเปล่า
                </span>
              ) : null}
              <p className="truncate text-sm text-ink-700">{customerName}</p>
              <p className="text-xs text-ink-400">{getNextStepText(doc)}</p>
              {isVoided && doc.voided_reason && (
                <p className="text-xs text-ink-300 italic">
                  เหตุผล: {doc.voided_reason}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1 text-xs text-ink-300 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <span>ออกเอกสาร: {formatBuddhistDate(doc.issue_date)}</span>
              {doc.due_date && dueRel?.text ? (
                <span
                  className={dueRel.urgent ? "font-medium text-red-600" : ""}
                >
                  &middot; {dueRel.text}
                </span>
              ) : doc.due_date ? (
                <span className={overdue ? "font-medium text-red-600" : ""}>
                  &middot; ครบกำหนด: {formatBuddhistDate(doc.due_date)}
                </span>
              ) : null}
              {showUpdatedAt(doc) && (
                <span className="text-ink-200">&middot; แก้ไขล่าสุด: {formatBuddhistDate(doc.updated_at)}</span>
              )}
              {onOpenDeal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDeal();
                  }}
                  className="text-primary hover:underline"
                >
                  &middot; ดูงานขาย
                </button>
              )}
            </div>
            {!isTerminal && previewItems.length > 0 && (
              <div className="pt-1">
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {previewItems.map((itemName, index) => (
                    <span
                      key={`${doc.id}-item-${index}-${itemName}`}
                      className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs ${CHIP_COLORS[index % CHIP_COLORS.length]}`}
                    >
                      <span className="truncate">{itemName}</span>
                    </span>
                  ))}
                  {remainingItems > 0 && (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CHIP_COLORS[previewItems.length % CHIP_COLORS.length]} opacity-80`}
                    >
                      +{remainingItems} รายการ
                    </span>
            )}
              </div>
            </div>
            )}
            {searchQuery && doc.line_items?.some((item) => item.item_name.toLowerCase().includes(searchQuery.toLowerCase())) && (
              <div className="pt-1">
                <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                  พบในรายการ
                </span>
              </div>
            )}
          </div>

          <div
            className={`shrink-0 pl-2 text-right ml-auto ${isTerminal ? "opacity-60" : ""}`}
          >
            <div className="text-[11px] uppercase tracking-[0.12em] text-ink-300">
              {getDisplayAmountLabel(doc)}
            </div>
            <div
              className={`mt-1 text-sm font-semibold ${overdue ? "text-red-700" : isPaid ? "text-green-700" : "text-ink-900"}`}
            >
              ฿{formatCurrency(getDisplayAmount(doc))}
            </div>
            {isDraft && doc.doc_type !== "receipt" && doc.doc_type !== "credit_note" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMenuAction("edit"); }}
                className="mt-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-2xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                แก้ไข
              </button>
            )}
            {isSent && doc.doc_type === "quotation" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMenuAction("convert"); }}
                className="mt-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-2xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                ออกใบแจ้งหนี้
              </button>
            )}
            {(isSent || isActuallyOverdue(doc)) && (doc.doc_type === "invoice" || doc.doc_type === "billing_note") && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMenuAction("pay"); }}
                className="mt-1.5 rounded-full border border-green-500/30 bg-green-50 px-2.5 py-0.5 text-2xs font-medium text-green-700 hover:bg-green-100 transition-colors"
              >
                รับเงิน
              </button>
            )}
            {isSent && doc.doc_type === "delivery_note" && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMenuAction("invoice_from_dn"); }}
                className="mt-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-2xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                ออกบิล
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
              className="mt-1.5 rounded p-0.5 hover:bg-gray-100 transition-colors"
              disabled={menuLoading}
            >
              <MoreHorizontal
                size={15}
                className={menuLoading ? "text-gray-300" : "text-ink-300"}
              />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div
          ref={menuDropdownRef}
          className="absolute right-3 top-12 z-50 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {menuLoading && (
            <div className="px-3 py-2 text-xs text-gray-400 text-center">
              กำลังดำเนินการ...
            </div>
          )}

          {!menuLoading && isConfirming && (
            <>
              <div className="px-3 py-1.5 text-xs text-red-600 font-medium border-b border-gray-100">
                {pendingConfirm!.action === "void"
                  ? "ยืนยันการยกเลิก?"
                  : "ยืนยันการลบ?"}
              </div>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 flex items-center gap-2"
                onClick={() => onMenuAction(pendingConfirm!.action)}
              >
                <Trash2 size={14} />
                <span>ยืนยัน</span>
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                onClick={() => onMenuAction("cancelConfirm")}
              >
                <span className="pl-[22px]">ยกเลิก</span>
              </button>
            </>
          )}

          {!menuLoading && !isConfirming && (
            <>
              {isDraft &&
                doc.doc_type !== "receipt" &&
                doc.doc_type !== "credit_note" && (
                  <>
                    {canSendDocumentType(permissions, doc.doc_type) && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => onMenuAction("send")}
                      >
                        <Send size={14} />
                        <span>
                          {doc.doc_type === "delivery_note"
                            ? "ยืนยันส่งของแล้ว"
                            : "ทำเครื่องหมายว่าส่งแล้ว"}
                        </span>
                      </button>
                    )}
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => onMenuAction("edit")}
                    >
                      <Edit3 size={14} />
                      <span>แก้ไข</span>
                    </button>
                    {permissions.canDeleteDocuments && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => onMenuAction("delete")}
                      >
                        <Trash2 size={14} />
                        <span>ลบ</span>
                      </button>
                    )}
                  </>
                )}

              {isDraft && doc.doc_type === "credit_note" && (
                <>
                  {canSendDocumentType(permissions, doc.doc_type) && (
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => onMenuAction("issue_cn")}
                    >
                      <FileText size={14} />
                      <span>ออกใบลดหนี้</span>
                    </button>
                  )}
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => onMenuAction("edit")}
                  >
                    <Edit3 size={14} />
                    <span>แก้ไข</span>
                  </button>
                  {permissions.canDeleteDocuments && (
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      onClick={() => onMenuAction("delete")}
                    >
                      <Trash2 size={14} />
                      <span>ลบ</span>
                    </button>
                  )}
                </>
              )}

              {isDraft && doc.doc_type === "receipt" && (
                <>
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => onMenuAction("edit")}
                  >
                    <Edit3 size={14} />
                    <span>แก้ไข</span>
                  </button>
                  {permissions.canDeleteDocuments && (
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      onClick={() => onMenuAction("delete")}
                    >
                      <Trash2 size={14} />
                      <span>ลบ</span>
                    </button>
                  )}
                </>
              )}

              {isSent &&
                doc.doc_type === "quotation" &&
                (canSendDocumentType(permissions, doc.doc_type) || permissions.canVoidDocuments) && (
                  <>
                    {canSendDocumentType(permissions, doc.doc_type) && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => onMenuAction("convert")}
                      >
                        <Copy size={14} />
                        <span>แปลงเป็นใบแจ้งหนี้</span>
                      </button>
                    )}
                    {permissions.canVoidDocuments && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => onMenuAction("void")}
                      >
                        <Ban size={14} />
                        <span>ยกเลิก</span>
                      </button>
                    )}
                  </>
                )}

              {isSent &&
                doc.doc_type === "invoice" &&
                (permissions.canRecordPayments || permissions.canVoidDocuments) && (
                  <>
                    {permissions.canRecordPayments && (
                      <>
                        <button
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => onMenuAction("billing")}
                        >
                          <FileText size={14} />
                          <span>วางบิล</span>
                        </button>
                        <button
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          onClick={() => onMenuAction("pay")}
                        >
                          <CreditCard size={14} />
                          <span>รับเงินแล้ว</span>
                        </button>
                      </>
                    )}
                    {permissions.canVoidDocuments && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => onMenuAction("void")}
                      >
                        <Ban size={14} />
                        <span>ยกเลิก</span>
                      </button>
                    )}
                  </>
                )}

              {isSent &&
                doc.doc_type === "billing_note" &&
                (permissions.canRecordPayments || permissions.canVoidDocuments) && (
                  <>
                    {permissions.canRecordPayments && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => onMenuAction("pay")}
                      >
                        <CreditCard size={14} />
                        <span>รับเงินแล้ว</span>
                      </button>
                    )}
                    {permissions.canVoidDocuments && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => onMenuAction("void")}
                      >
                        <Ban size={14} />
                        <span>ยกเลิก</span>
                      </button>
                    )}
                  </>
                )}

              {isSent &&
                doc.doc_type === "delivery_note" &&
                (canSendDocumentType(permissions, doc.doc_type) || permissions.canVoidDocuments) && (
                  <>
                    {canSendDocumentType(permissions, doc.doc_type) && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => onMenuAction("invoice_from_dn")}
                      >
                        <FileStack size={14} />
                        <span>ออกใบแจ้งหนี้จากใบนี้</span>
                      </button>
                    )}
                    {permissions.canVoidDocuments && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        onClick={() => onMenuAction("void")}
                      >
                        <Ban size={14} />
                        <span>ยกเลิก</span>
                      </button>
                    )}
                  </>
                )}

              {isSent &&
                doc.doc_type !== "quotation" &&
                doc.doc_type !== "invoice" &&
                doc.doc_type !== "billing_note" &&
                doc.doc_type !== "delivery_note" &&
                permissions.canVoidDocuments && (
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    onClick={() => onMenuAction("void")}
                  >
                    <Ban size={14} />
                    <span>ยกเลิก</span>
                  </button>
                )}

              {isTerminal && (
                <button
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => onMenuAction("copy")}
                >
                  <Copy size={14} />
                  <span>คัดลอกเป็นฉบับร่าง</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function QuickDetailModal({
  doc,
  open,
  loading,
  onClose,
  onOpenPreview,
  onOpenFull,
  onOpenDeal,
}: {
  doc: Document | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onOpenPreview: () => void;
  onOpenFull: () => void;
  onOpenDeal: () => void;
}) {
  if (!open) return null;

  if (loading || !doc) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="รายละเอียดเอกสาร"
        className="md:max-w-3xl"
      >
        <div className="space-y-3">
          <SkeletonCard className="p-0" />
          <SkeletonCard className="p-0" />
          <SkeletonCard className="p-0" />
        </div>
      </Modal>
    );
  }

  const overdue = doc.status === "overdue" || isActuallyOverdue(doc);
  const customerName = (doc as any).customer?.name || "ไม่ได้ระบุลูกค้า";
  const items = Array.isArray(doc.line_items) ? doc.line_items : [];
  const lineDiscountTotal = items.reduce(
    (sum, item) => sum + (item.discount_amount || 0),
    0,
  );
  const detailRows = [
    { label: "ลูกค้า", value: customerName },
    { label: "วันที่ออก", value: formatBuddhistDate(doc.issue_date) },
    {
      label: "ครบกำหนด",
      value: doc.due_date ? formatBuddhistDate(doc.due_date) : "ไม่มีกำหนด",
      emphasis: overdue,
    },
    ...(showUpdatedAt(doc) ? [{ label: "แก้ไขล่าสุด", value: formatBuddhistDate(doc.updated_at!) }] : []),
    { label: "ขั้นตอนถัดไป", value: getNextStepText(doc) },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc.doc_number || "รายละเอียดเอกสาร"}
      className="md:max-w-3xl"
    >
      <div className="space-y-4">
        <div className="rounded-sheet border border-card-border bg-[linear-gradient(135deg,theme(colors.paper.glow)_0%,theme(colors.paper.warm)_100%)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DocTypeBadge
              docType={doc.doc_type}
              vatRegistered={doc.vat_registered}
            />
            <Badge status={doc.status} />
            {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form ? (
              <span className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                ฟอร์มเปล่า
              </span>
            ) : null}
            {overdue && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                ต้องติดตาม
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
                {getDisplayAmountLabel(doc)}
              </div>
              <div className="mt-1 text-3xl font-semibold text-ink-900">
                ฿ {formatCurrency(getDisplayAmount(doc))}
              </div>
            </div>
            {doc.deal_id && (
              <Button
                tone="amber"
                solid
                onClick={onOpenDeal}
                className="w-full sm:w-auto shadow-sm"
              >
                ดูเอกสารในงานขายนี้
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-sheet border border-card-border bg-white p-4">
          <div className="space-y-3 text-sm">
            {detailRows.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-4"
              >
                <span className="text-ink-400">{row.label}</span>
                <span
                  className={`text-right font-medium ${row.emphasis ? "text-red-700" : "text-ink-900"}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {items.length > 0 && (
          <div className="rounded-sheet border border-card-border bg-white p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
                รายการ
              </div>
              <div className="text-xs text-ink-400">
                {items.length} รายการ
              </div>
            </div>

            <div className="mt-2.5 space-y-1.5 sm:hidden">
              {items.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="rounded-soft border border-line-faint bg-paper-tint px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium leading-5 text-ink-900">
                          {item.item_name}
                        </p>
                        <div className="shrink-0 text-right">
                          <div className="text-2xs uppercase tracking-[0.12em] text-ink-300">
                            รวม
                          </div>
                          <div className="text-sm font-semibold leading-5 text-ink-900">
                            ฿ {formatCurrency(item.line_total)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-ink-400">
                        <span>
                          {item.quantity} {item.unit}
                        </span>
                        <span>x ฿ {formatCurrency(item.unit_price)}</span>
                      </div>
                      {item.discount_amount > 0 && (
                        <p className="mt-1 text-[11px] leading-4 text-red-700">
                          ส่วนลด {item.discount_percent}% (-฿{" "}
                          {formatCurrency(item.discount_amount)})
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2.5 hidden overflow-hidden rounded-2xl border border-line-faint sm:block">
              <div className="grid grid-cols-[minmax(0,1.7fr)_0.8fr_0.9fr] gap-3 bg-paper-soft px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-300">
                <div>รายการ</div>
                <div className="text-right">จำนวน x ราคา</div>
                <div className="text-right">รวม</div>
              </div>
              {items.slice(0, 4).map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(0,1.7fr)_0.8fr_0.9fr] gap-3 px-4 py-3 ${
                    index === 0 ? "" : "border-t border-line-faint"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-5 text-ink-900">
                      {item.item_name}
                    </p>
                    {item.discount_amount > 0 && (
                      <p className="mt-1 text-[11px] leading-4 text-red-700">
                        ส่วนลด {item.discount_percent}% (-฿{" "}
                        {formatCurrency(item.discount_amount)})
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm leading-5 text-ink-600">
                    {item.quantity} {item.unit}
                    <div className="mt-0.5 text-[11px] leading-4 text-ink-300">
                      x ฿ {formatCurrency(item.unit_price)}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold leading-5 text-ink-900">
                    ฿ {formatCurrency(item.line_total)}
                  </div>
                </div>
              ))}
            </div>

            {items.length > 4 && (
              <div className="mt-3 text-center text-xs text-ink-400">
                และอีก {items.length - 4} รายการในหน้ารายละเอียดเต็ม
              </div>
            )}
          </div>
        )}

        <div className="rounded-sheet border border-card-border bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
            สรุปยอด
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-ink-400">ยอดก่อนภาษี</span>
              <span className="text-right font-medium text-ink-900">
                ฿ {formatCurrency(doc.subtotal)}
              </span>
            </div>
            {lineDiscountTotal > 0 && (
              <div className="flex items-start justify-between gap-4 text-red-700">
                <span>ส่วนลดรายการ</span>
                <span className="text-right font-medium">
                  -฿ {formatCurrency(lineDiscountTotal)}
                </span>
              </div>
            )}
            {doc.discount_amount > 0 && (
              <div className="flex items-start justify-between gap-4 text-red-700">
                <span>ส่วนลดท้ายบิล</span>
                <span className="text-right font-medium">
                  -฿ {formatCurrency(doc.discount_amount)}
                </span>
              </div>
            )}
            {doc.vat_registered && doc.doc_type !== "delivery_note" && (
              <div className="flex items-start justify-between gap-4">
                <span className="text-ink-400 cursor-help" title="ภาษีมูลค่าเพิ่ม คำนวณจากยอดรวมหลังส่วนลด">VAT {doc.vat_rate}%</span>
                <span className="text-right font-medium text-ink-900">
                  ฿ {formatCurrency(doc.vat_amount)}
                </span>
              </div>
            )}
            {doc.wht_rate > 0 && doc.doc_type !== "delivery_note" && (
              <div className="flex items-start justify-between gap-4 text-red-700">
                <span className="cursor-help" title="ภาษีหัก ณ ที่จ่าย ลูกค้าหักไว้ก่อนจ่าย">หัก ณ ที่จ่าย {doc.wht_rate}%</span>
                <span className="text-right font-medium">
                  -฿ {formatCurrency(doc.wht_amount)}
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 border-t border-line-faint pt-2">
              <span className="font-medium text-ink-900 cursor-help" title={doc.doc_type === "delivery_note" ? "มูลค่าสินค้าอ้างอิงสำหรับออกใบแจ้งหนี้ภายหลัง" : "จำนวนเงินที่ลูกค้าต้องจ่ายจริงหลังหักภาษี"}>{getDisplayAmountLabel(doc)}</span>
              <span className="text-right text-base font-semibold text-ink-900">
                ฿ {formatCurrency(getDisplayAmount(doc))}
              </span>
            </div>
          </div>
        </div>

        {["paid", "partially_paid", "generated", "issued"].includes(doc.status) && (doc.payment_method || doc.paid_at || doc.amount_received != null) && (
          <div className="rounded-sheet border border-card-border bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
              ข้อมูลรับเงิน
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {doc.payment_method && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-ink-400">วิธีชำระ</span>
                  <span className="text-right font-medium text-ink-900">
                    {PAYMENT_METHOD_LABELS[doc.payment_method] || doc.payment_method}
                  </span>
                </div>
              )}
              {doc.amount_received != null && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-ink-400">รับแล้ว</span>
                  <span className="text-right font-medium text-ink-900">
                    ฿ {formatCurrency(doc.amount_received)}
                  </span>
                </div>
              )}
              {doc.status === "partially_paid" && (
                <div className="flex items-start justify-between gap-4 text-amber-700">
                  <span>คงเหลือ</span>
                  <span className="text-right font-medium">
                    ฿ {formatCurrency(Math.max(0, doc.net_payable - (doc.amount_received || 0)))}
                  </span>
                </div>
              )}
              {doc.paid_at && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-ink-400">วันที่</span>
                  <span className="text-right font-medium text-ink-900">{formatBuddhistDate(doc.paid_at)}</span>
                </div>
              )}
              {doc.wht_certificate_no && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-ink-400">ใบหักภาษี</span>
                  <span className="text-right font-medium text-ink-900">{doc.wht_certificate_no}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {doc.note && (
          <div className="rounded-sheet border border-card-border bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-ink-300">
              หมายเหตุ
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">
              {doc.note}
            </p>
          </div>
        )}

        <div className="space-y-2 border-t border-line-faint pt-3">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="secondary"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              ปิด
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={onOpenPreview} className="w-full sm:w-auto">
                ดาวน์โหลดเอกสาร
              </Button>
              <Button
                variant="secondary"
                onClick={onOpenFull}
                className="w-full sm:w-auto"
              >
                ดูรายละเอียด
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(
    workspaceRole,
    workspacePermissions,
  );
  const toast = useToast();
  const { documents, loading, refetch } = useDocuments(profile?.id);
  const { clientProfile } = useClientProfile(profile?.id);
  const businessToday = businessTodayString(clientProfile);
  const devIssueDate = clientProfile?.dev_mode_enabled && clientProfile.dev_effective_date ? businessToday : undefined;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchDebouncing, setSearchDebouncing] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentType | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | StatusGroupKey | "all">(
    "all",
  );
  const [quickView, setQuickView] = useState<QuickView>("all");
  const [hideVoided, setHideVoided] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<number>(CURRENT_MONTH);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [quickDetailLoading, setQuickDetailLoading] = useState(false);
  const preset = searchParams.get("preset");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [inlineLoading, setInlineLoading] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    docId: string;
    action: "void" | "delete";
  } | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem("documentsViewMode");
    return stored === "list" || stored === "grid" || stored === "table"
      ? stored
      : "list";
  });

  useEffect(() => {
    window.localStorage.setItem("documentsViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    setQuickView("all");
    setDocTypeFilter("all");
    setStatusFilter("all");

    if (preset === "overdue") {
      setQuickView("attention");
      setDocTypeFilter("billing_note");
      setStatusFilter("overdue");
      return;
    }

    if (preset === "unpaid") {
      setQuickView("collect");
      setDocTypeFilter("billing_note");
      return;
    }

    if (preset === "paid_this_month") {
      setQuickView("paid");
      setDocTypeFilter("billing_note");
      setStatusFilter("paid");
    }

    if (preset === "paid") {
      setQuickView("paid");
      setDocTypeFilter("billing_note");
      setStatusFilter("paid");
    }
  }, [preset]);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearchDebouncing(true);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setSearchDebouncing(false);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search]);

  const handleInlineAction = async (doc: Document, action: string) => {
    if (!profile?.id) return;
    if (
      (action === "send" || action === "issue_cn") &&
      !canSendDocumentType(permissions, doc.doc_type)
    ) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (action === "void" && !permissions.canVoidDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (action === "delete" && !permissions.canDeleteDocuments) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner");
      return;
    }
    setInlineLoading(doc.id);
    try {
      if (action === "send") {
        const { warnings } = await sendDocumentWithSideEffects(doc, profile.id, { issueDate: devIssueDate });
        warnings.forEach((warning) =>
          toast.info(`${warning.itemName} สต็อกไม่พอ`),
        );
        toast.success(
          doc.doc_type === "delivery_note"
            ? "ยืนยันส่งของแล้ว"
            : "ทำเครื่องหมายว่าส่งแล้ว",
        );
      } else if (action === "void") {
        await voidDocumentWithSideEffects(doc, profile.id);
        toast.success("ยกเลิกเอกสารแล้ว");
      } else if (action === "delete") {
        await supabase
          .from("document_line_items")
          .delete()
          .eq("document_id", doc.id);
        await deleteDocumentFiles(doc.id);
        await supabase.from("documents").delete().eq("id", doc.id);
        toast.success("ลบเอกสารแล้ว");
      } else if (action === "issue_cn") {
        await supabase
          .from("documents")
          .update({
            status: "issued" as DocumentStatus,
            ...(devIssueDate ? { issue_date: devIssueDate } : {}),
          })
          .eq("id", doc.id);
        toast.success("ออกใบลดหนี้แล้ว");
      }
      setOpenMenuId(null);
      setPendingConfirm(null);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setInlineLoading(null);
    }
  };

  const handleMenuAction = (doc: Document, action: string) => {
    if (
      (action === "pay" || action === "billing") &&
      !permissions.canRecordPayments
    ) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (
      (action === "convert" || action === "invoice_from_dn") &&
      !canSendDocumentType(permissions, doc.doc_type)
    ) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    if (action === "void" || action === "delete") {
      setPendingConfirm({ docId: doc.id, action });
      return;
    }
    if (action === "cancelConfirm") {
      setPendingConfirm(null);
      return;
    }
    if (action === "edit") {
      setOpenMenuId(null);
      navigate(`/documents/${doc.id}/edit`);
      return;
    }
    if (action === "convert" || action === "pay" || action === "copy") {
      setOpenMenuId(null);
      navigate(`/documents/${doc.id}`);
      return;
    }
    if (action === "billing") {
      setOpenMenuId(null);
      navigate(`/documents/new?type=billing_note&dealId=${doc.deal_id || ""}`);
      return;
    }
    if (action === "invoice_from_dn") {
      setOpenMenuId(null);
      navigate(
        `/documents/new?type=invoice_from_delivery_notes&dnId=${doc.id}`,
      );
      return;
    }
    handleInlineAction(doc, action);
  };

  const toggleMenu = (docId: string) => {
    setOpenMenuId(openMenuId === docId ? null : docId);
    setPendingConfirm(null);
  };

  const toggleSelectDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    const allIds = new Set(filtered.map((d) => d.id));
    setSelectedDocIds(allIds);
  };

  const clearSelection = () => {
    setSelectedDocIds(new Set());
  };

  const handleBulkDownloadPDF = async () => {
    if (selectedDocIds.size === 0 || !profile?.id) return;
    setBulkDownloading(true);
    setBulkProgress({ current: 0, total: selectedDocIds.size });

    const ids = Array.from(selectedDocIds);

    try {
      const { data: clientProfile } = await supabase
        .from("client_profiles")
        .select("*")
        .eq("user_id", profile.id)
        .single();

      if (!clientProfile) {
        toast.error("ไม่พบข้อมูลโปรไฟล์");
        return;
      }

      const JSZip = (await import("jszip")).default;

      const { getPrintableDocumentDataBase, generatePDFBlob } =
        await import("../../../lib/print");
      const generateBlob = async (docId: string) => {
        const data = await getPrintableDocumentDataBase(docId);
        // Stamp the template from the client profile so the dispatcher
        // picks the right generator for each document.
        const template =
          clientProfile.pdf_template === "classic" ? "classic" : "modern";
        return generatePDFBlob({ ...data, template } as Parameters<
          typeof generatePDFBlob
        >[0]);
      };

      const zip = new JSZip();

      for (let i = 0; i < ids.length; i++) {
        setBulkProgress({ current: i + 1, total: ids.length });

        const blob = await generateBlob(ids[i]);
        if (!blob) continue;

        const filename = `${ids[i].slice(0, 8)}.pdf`;
        zip.file(filename, blob, { binary: true });
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documents_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`ดาวน์โหลด ${selectedDocIds.size} ไฟล์เรียบร้อย`);
      clearSelection();
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาดในการสร้าง PDF");
    } finally {
      setBulkDownloading(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  };

  const summary = useMemo(() => {
    const paidThisMonth = documents.filter((doc) => {
      if (!isCollectingStatus(doc) || doc.status !== "paid" || !doc.paid_at)
        return false;
      const paidAt = new Date(doc.paid_at);
      const now = new Date();
      return (
        paidAt.getMonth() === now.getMonth() &&
        paidAt.getFullYear() === now.getFullYear()
      );
    }).length;

    return {
      draft: documents.filter((doc) => doc.status === "draft").length,
      dnReady: documents.filter(
        (doc) => doc.doc_type === "delivery_note" && doc.status === "sent",
      ).length,
      collect: documents.filter(
        (doc) =>
          doc.doc_type === "billing_note" &&
          (doc.status === "sent" || doc.status === "overdue"),
      ).length,
      overdue: documents.filter(
        (doc) => doc.status === "overdue" || isActuallyOverdue(doc),
      ).length,
      paidThisMonth,
      voided: documents.filter((doc) => doc.status === "voided").length,
    };
  }, [documents]);

  const availableYears = useMemo(() => {
    const years = new Set([CURRENT_YEAR]);
    for (const doc of documents) {
      if (doc.issue_date) {
        years.add(new Date(doc.issue_date).getFullYear());
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [documents]);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      if (docTypeFilter !== "all" && doc.doc_type !== docTypeFilter)
        return false;
      if (statusFilter !== "all") {
        if (statusFilter in STATUS_GROUPS) {
          const group = STATUS_GROUPS[statusFilter as StatusGroupKey];
          if (!group.statuses.includes(doc.status)) return false;
        } else if (doc.status !== statusFilter) {
          return false;
        }
      }

      if (
        quickView === "attention" &&
        !(doc.status === "overdue" || isActuallyOverdue(doc))
      )
        return false;
      if (quickView === "draft" && doc.status !== "draft") return false;
      if (
        quickView === "dn_invoice" &&
        !(doc.doc_type === "delivery_note" && doc.status === "sent")
      )
        return false;
      if (
        quickView === "collect" &&
        !(
          doc.doc_type === "billing_note" &&
          (doc.status === "sent" ||
            doc.status === "overdue" ||
            doc.status === "partially_paid")
        )
      )
        return false;
      if (
        quickView === "paid" &&
        !(doc.doc_type === "billing_note" && doc.status === "paid")
      )
        return false;
      if (quickView === "voided" && doc.status !== "voided") return false;

      if (
        hideVoided &&
        doc.status === "voided" &&
        quickView !== "voided" &&
        statusFilter !== "voided"
      )
        return false;

      if (preset === "paid_this_month") {
        if (
          doc.doc_type !== "billing_note" ||
          doc.status !== "paid" ||
          !doc.paid_at
        )
          return false;
        const paidAt = new Date(doc.paid_at);
        const now = new Date();
        if (
          paidAt.getMonth() !== now.getMonth() ||
          paidAt.getFullYear() !== now.getFullYear()
        )
          return false;
      }

      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const customerName = ((doc as any).customer?.name || "").toLowerCase();
        const docNumber = (doc.doc_number || "").toLowerCase();
        const note = (doc.note || "").toLowerCase();
        const docMatch =
          customerName.includes(query) ||
          docNumber.includes(query) ||
          note.includes(query);
        const lineItemMatch =
          doc.line_items?.some((item) =>
            item.item_name.toLowerCase().includes(query),
          ) ?? false;
        if (!docMatch && !lineItemMatch) return false;
      }

      if (dateFrom && doc.issue_date < dateFrom) return false;
      if (dateTo && doc.issue_date > dateTo) return false;

      if (selectedMonth !== 0 && doc.issue_date) {
        const docDate = new Date(doc.issue_date);
        if (docDate.getMonth() + 1 !== selectedMonth) return false;
        if (docDate.getFullYear() !== selectedYear) return false;
      }

      return true;
    });
  }, [
    documents,
    docTypeFilter,
    statusFilter,
    quickView,
    hideVoided,
    preset,
    debouncedSearch,
    dateFrom,
    dateTo,
    selectedMonth,
    selectedYear,
  ]);

  const grouped = useMemo(() => {
    const active = filtered.filter(
      (doc) =>
        doc.status !== "voided" &&
        !["paid", "generated", "issued"].includes(doc.status),
    );
    const completed = filtered.filter((doc) =>
      ["paid", "generated", "issued"].includes(doc.status),
    );
    const voided = filtered.filter((doc) => doc.status === "voided");
    return { active, completed, voided };
  }, [filtered]);

  const docTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      counts[doc.doc_type] = (counts[doc.doc_type] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      counts[doc.status] = (counts[doc.status] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const processingOverdueCount = useMemo(
    () =>
      documents.filter(
        (d) =>
          STATUS_GROUPS.processing.statuses.includes(d.status) &&
          isActuallyOverdue(d),
      ).length,
    [documents],
  );

  type DocSortKey =
    "doc_number" | "doc_type" | "issue_date" | "net_payable" | "status";
  const docSort = useTableSort<Document, DocSortKey>(filtered, {
    key: "issue_date",
    dir: "desc",
  });

  const hasFilters =
    quickView !== "all" ||
    docTypeFilter !== "all" ||
    statusFilter !== "all" ||
    dateFrom ||
    dateTo ||
    selectedMonth !== CURRENT_MONTH ||
    selectedYear !== CURRENT_YEAR ||
    debouncedSearch;

  function clearFilters() {
    setSearch("");
    setQuickView("all");
    setDocTypeFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSelectedMonth(CURRENT_MONTH);
    setSelectedYear(CURRENT_YEAR);
    setMobileFiltersOpen(false);
  }

  function handleExportCSV() {
    const headers = [
      "เลขที่เอกสาร",
      "ประเภท",
      "สถานะ",
      "ลูกค้า",
      "วันที่ออก",
      "วันครบกำหนด",
      "ยอดสุทธิ",
    ];
    const rows = filtered.map((doc) => [
      doc.doc_number || "",
      DOC_TYPE_LABELS[doc.doc_type].th,
      STATUS_LABELS[doc.status],
      (doc as any).customer?.name || "",
      doc.issue_date,
      doc.due_date || "",
      getDisplayAmount(doc).toString(),
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `documents_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openDocModal(doc: Document) {
    setSelectedDocId(doc.id);
    setSelectedDoc(doc);
    setQuickDetailLoading(true);
    try {
      const fullDoc = await getDocumentDetail(doc.id);
      setSelectedDoc(fullDoc);
    } catch {
      setSelectedDoc(doc);
    } finally {
      setQuickDetailLoading(false);
    }
  }

  function closeDocModal() {
    setSelectedDocId(null);
    setSelectedDoc(null);
    setQuickDetailLoading(false);
  }

  const sections = [
    {
      key: "active",
      title: "เอกสารที่ยังใช้งานอยู่",
      hint: "ร่าง เอกสารที่ส่งแล้ว และเอกสารที่ยังต้องอ้างอิงในขั้นตอนเอกสาร",
      tone: "active" as const,
      docs: grouped.active,
    },
    {
      key: "completed",
      title: "เอกสารเสร็จแล้ว",
      hint: "เอกสารที่ออกแล้ว รับเงินแล้ว หรือปิดงานแล้ว",
      tone: "muted" as const,
      docs: grouped.completed,
    },
    {
      key: "voided",
      title: "เอกสารยกเลิก",
      hint: "ประวัติเอกสารที่ยกเลิกไว้สำหรับตรวจสอบย้อนหลัง",
      tone: "muted" as const,
      docs: grouped.voided,
    },
  ].filter((section) => section.docs.length > 0);

  const mobileQuickFilters: {
    label: string;
    value: QuickView;
    count: number;
  }[] = [
    { label: "ทั้งหมด", value: "all", count: documents.length },
    { label: "เกินกำหนด", value: "attention", count: summary.overdue },
    { label: "ร่าง", value: "draft", count: summary.draft },
    { label: "DN รอออกบิล", value: "dn_invoice", count: summary.dnReady },
    { label: "BN รอรับเงิน", value: "collect", count: summary.collect },
    { label: "รับเงินเดือนนี้", value: "paid", count: summary.paidThisMonth },
  ];

  return (
    <AppShell title="เอกสาร">
      <div className="space-y-4 sm:space-y-5">
        <section className="rounded-2xl border border-card-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">
                คลังเอกสาร
              </h2>
              <p className="mt-1 text-sm leading-6 text-ink-500">
                ค้นหา พิมพ์ ส่งออก และตรวจสอบเอกสารย้อนหลัง
              </p>
            </div>
            <div className="hidden rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-ink-400 sm:block">
              {filtered.length} จาก {documents.length} รายการ
            </div>
          </div>

          <div className="mt-4 hidden gap-2 md:grid md:grid-cols-6">
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={index} className="p-0" />
              ))
            ) : (
              <>
                <SummaryCard
                  title="ร่าง"
                  count={summary.draft}
                  hint="ยังไม่ออกใช้งาน"
                  active={quickView === "draft"}
                  tone="blue"
                  icon={<FileText className="h-5 w-5" />}
                  onClick={() =>
                    setQuickView((value) =>
                      value === "draft" ? "all" : "draft",
                    )
                  }
                />
                <SummaryCard
                  title="ใบส่งของรอออกบิล"
                  count={summary.dnReady}
                  hint="กรอง DN ที่ยังไม่รวมบิล"
                  active={quickView === "dn_invoice"}
                  tone="blue"
                  icon={<FileStack className="h-5 w-5" />}
                  onClick={() =>
                    setQuickView((value) =>
                      value === "dn_invoice" ? "all" : "dn_invoice",
                    )
                  }
                />
                <SummaryCard
                  title="ใบวางบิลรอรับเงิน"
                  count={summary.collect}
                  hint="กรองใบวางบิลที่ยังเปิดอยู่"
                  active={quickView === "collect"}
                  tone="amber"
                  icon={<Clock3 className="h-5 w-5" />}
                  onClick={() =>
                    setQuickView((value) =>
                      value === "collect" ? "all" : "collect",
                    )
                  }
                />
                <SummaryCard
                  title="เกินกำหนด"
                  count={summary.overdue}
                  hint="เอกสารที่ควรตรวจสอบ"
                  active={
                    quickView === "attention" ||
                    (quickView === "all" && statusFilter === "overdue")
                  }
                  tone="red"
                  icon={<AlertTriangle className="h-5 w-5" />}
                  onClick={() =>
                    setQuickView((value) =>
                      value === "attention" ? "all" : "attention",
                    )
                  }
                />
                <SummaryCard
                  title="รับเงินเดือนนี้"
                  count={summary.paidThisMonth}
                  hint="เอกสารที่ปิดยอดในเดือนนี้"
                  active={quickView === "paid"}
                  tone="green"
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  onClick={() =>
                    setQuickView((value) => (value === "paid" ? "all" : "paid"))
                  }
                />
                <SummaryCard
                  title="ยกเลิก"
                  count={summary.voided}
                  hint="ประวัติที่แยกเก็บไว้"
                  active={quickView === "voided"}
                  tone="gray"
                  icon={<XCircle className="h-5 w-5" />}
                  onClick={() =>
                    setQuickView((value) =>
                      value === "voided" ? "all" : "voided",
                    )
                  }
                />
              </>
            )}
          </div>

          <div className="mt-4 md:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mobileQuickFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setQuickView(filter.value)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-sm transition-colors ${quickView === filter.value ? "border-primary bg-primary text-white" : "border-line-soft bg-white text-ink-700"}`}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-sheet border border-card-border bg-white p-4">
          <div className="sticky top-[72px] z-20 -mx-4 border-b border-line-faint bg-white px-4 pb-3 pt-1 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
            <div className="flex items-center gap-2 md:hidden">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <Input
                  id="search-mobile"
                  className="pl-9"
                  placeholder="ค้นหาเอกสาร"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => setMobileFiltersOpen((value) => !value)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {hasFilters ? "ตัวกรอง" : "กรอง"}
              </Button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 md:hidden">
              <ViewToggle value={viewMode} onChange={setViewMode} />
              <span className="text-xs text-ink-400">
                {filtered.length} รายการ
              </span>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-600">
                ค้นหาเอกสาร
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <Input
                  id="search"
                  className="pl-9"
                  placeholder="ค้นหาชื่อลูกค้า เลขที่เอกสาร หรือหมายเหตุ"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:w-[320px]">
              <Input
                id="dateFrom"
                type="date"
                label="จากวันที่"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <Input
                id="dateTo"
                type="date"
                label="ถึงวันที่"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>

          <div className="hidden md:flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-600">
                เดือน
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(0)}
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    selectedMonth === 0
                      ? "border-primary bg-primary text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  ทั้งหมด
                </button>
                {MONTH_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSelectedMonth(i + 1)}
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      selectedMonth === i + 1
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-[110px]">
              <Select
                label="ปี"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {summary.voided > 0 && (
            <div className="hidden md:flex items-center gap-2 pt-1">
              <input
                id="hideVoided"
                type="checkbox"
                checked={hideVoided}
                onChange={(e) => setHideVoided(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary rounded"
              />
              <label
                htmlFor="hideVoided"
                className="text-[11px] text-ink-300 select-none cursor-pointer"
              >
                ซ่อนเอกสารที่ยกเลิก ({summary.voided})
              </label>
            </div>
          )}

          {searchDebouncing && (
            <div className="-mt-1 flex justify-end">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          <div
            className={`space-y-3 ${mobileFiltersOpen ? "block" : "hidden"} md:block`}
          >
            <div className="grid grid-cols-2 gap-2 md:hidden">
              <Input
                id="dateFromMobile"
                type="date"
                label="จากวันที่"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <Input
                id="dateToMobile"
                type="date"
                label="ถึงวันที่"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>

            <div className="md:hidden">
              <label className="mb-1 block text-xs font-medium text-ink-600">
                เดือน
              </label>
              <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(0)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    selectedMonth === 0
                      ? "border-primary bg-primary text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  ทั้งหมด
                </button>
                {MONTH_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSelectedMonth(i + 1)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      selectedMonth === i + 1
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 w-[120px]">
                <Select
                  label="ปี"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-600">
                <FileText className="h-3.5 w-3.5" />
                ประเภทเอกสาร
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {DOC_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setDocTypeFilter(filter.value)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${docTypeFilter === filter.value ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                  >
                    {filter.label}{" "}
                    <span className={docTypeFilter === filter.value ? "opacity-70" : "text-ink-200"}>
                      ({filter.value === "all" ? documents.length : (docTypeCounts[filter.value] || 0)})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setAdvancedFiltersOpen((v) => !v)}
                className="mb-2 flex w-full items-center justify-between gap-2 text-xs font-medium text-ink-600 md:hidden"
              >
                <span className="flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  ตัวกรองเพิ่มเติม
                </span>
                <span className={`transition-transform ${advancedFiltersOpen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              <div className={`${advancedFiltersOpen ? "block" : "hidden"} md:block space-y-4`}>
              <div>
                <div className="hidden md:flex items-center gap-2 text-xs font-medium text-ink-600 mb-2">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  สถานะ
                </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                      statusFilter === filter.value
                        ? filter.value === "processing" && processingOverdueCount > 0
                          ? "border-red-400 bg-red-500 text-white"
                          : "border-ink-800 bg-ink-800 text-white"
                        : filter.value === "processing" && processingOverdueCount > 0
                          ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {filter.label}{" "}
                    {filter.value === "processing" && processingOverdueCount > 0 && (
                      <span className="inline-flex h-2 w-2 rounded-full bg-red-500 align-middle" />
                    )}{" "}
                    <span className={statusFilter === filter.value ? "opacity-70" : "text-ink-200"}>
                      ({filter.value === "all" ? documents.length : filter.value in STATUS_GROUPS ? STATUS_GROUPS[filter.value as StatusGroupKey].statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0) : (statusCounts[filter.value] || 0)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
            </div>
            </div>

            <div className="md:hidden">
            {summary.voided > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="hideVoidedMobile"
                  type="checkbox"
                  checked={hideVoided}
                  onChange={(e) => setHideVoided(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary rounded"
                />
                <label
                  htmlFor="hideVoidedMobile"
                  className="text-[11px] text-ink-300 select-none cursor-pointer"
                >
                  ซ่อนเอกสารที่ยกเลิก ({summary.voided})
                </label>
              </div>
            )}
            </div>
          </div>

          <div className="hidden flex-wrap items-center justify-between gap-3 border-t border-line-faint pt-3 md:flex">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
              {quickView !== "all" && (
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-primary-deep">
                  กำลังดูแบบลัด
                </span>
              )}
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-primary hover:underline"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-400">
                {filtered.length} จาก {documents.length} รายการ
              </span>
              <ViewToggle value={viewMode} onChange={setViewMode} />
              {selectedDocIds.size > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearSelection}>
                  ยกเลิกเลือก ({selectedDocIds.size})
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={selectAllFiltered}
                  disabled={filtered.length === 0}
                >
                  เลือกทั้งหมด
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                ส่งออก CSV
              </Button>
              {selectedDocIds.size > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleBulkDownloadPDF}
                  loading={bulkDownloading}
                  disabled={bulkDownloading}
                >
                  {bulkDownloading
                    ? `กำลังสร้าง ${bulkProgress.current}/${bulkProgress.total}`
                    : "ดาวน์โหลด PDF (ZIP)"}
                </Button>
              )}
            </div>
          </div>
        </section>

        {loading ? (
          <SkeletonTable />
        ) : filtered.length === 0 ? (
          documents.length === 0 ? (
            <EmptyState
              title="ยังไม่มีเอกสารในระบบ"
              description="เริ่มต้นด้วยการสร้างงานขาย ระบบจะช่วยสร้างเอกสารที่จำเป็นให้ทีละขั้นตอน"
              action={
                <Button onClick={() => navigate("/deals/new")}>
                  สร้างงานขายแรก
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="ไม่พบเอกสาร"
              description="ลองเปลี่ยนคำค้นหา หรือปรับตัวกรอง"
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    ล้างตัวกรองทั้งหมด
                  </Button>
                ) : undefined
              }
            />
          )
        ) : viewMode !== "list" ? (
          viewMode === "grid" ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((doc) => {
                const overdue =
                  doc.status === "overdue" || isActuallyOverdue(doc);
                const isVoided = doc.status === "voided";
                const customerName =
                  (doc as any).customer?.name || "ไม่ได้ระบุลูกค้า";
                return (
                  <Card
                    key={doc.id}
                    onClick={() => openDocModal(doc)}
                    className={`cursor-pointer !p-3.5 flex flex-col gap-2.5 min-h-[110px] relative ${isVoided ? "opacity-50" : ""} ${overdue ? "border-l-4 border-l-danger" : ""} ${selectedDocIds.has(doc.id) ? "ring-2 ring-primary bg-primary/5" : ""}`}
                  >
                    {selectedDocIds.size > 0 && (
                      <div
                        className="absolute top-2 right-2 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocIds.has(doc.id)}
                          onChange={() => toggleSelectDoc(doc.id)}
                          className="h-4 w-4 accent-primary cursor-pointer"
                        />
                      </div>
                    )}
                    <div className="flex items-start gap-2 pr-6">
                      <span
                        className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${
                          isVoided
                            ? "bg-gray-300"
                            : overdue
                              ? "bg-danger"
                              : doc.status === "draft"
                                ? "bg-ink-300"
                                : "bg-primary"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-ink-900 truncate">
                          {doc.doc_number || "-"}
                        </div>
                        <div className="text-[12px] text-ink-700 line-clamp-2 leading-tight mt-0.5">
                          {customerName}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DocTypeBadge
                        docType={doc.doc_type}
                        vatRegistered={doc.vat_registered}
                      />
                      {overdue && (
                        <span className="text-2xs text-danger font-medium">
                          เกินกำหนด
                        </span>
                      )}
                    </div>
                    <div className="mt-auto flex items-end justify-between pt-2 border-t border-line-faint">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-ink-300">
                          {formatBuddhistDate(doc.issue_date)}
                        </span>
                        {showUpdatedAt(doc) && (
                          <span className="text-2xs text-ink-200">
                            แก้ไข: {formatBuddhistDate(doc.updated_at)}
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] font-semibold text-ink-900">
                        ฿ {formatCurrency(getDisplayAmount(doc) || 0)}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-card-border rounded-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className={TABLE.table}>
                  <thead>
                    <tr className={TABLE.theadTr}>
                      <SortableTh
                        label="เลขที่"
                        align="left"
                        active={docSort.sort.key === "doc_number"}
                        dir={docSort.sort.dir}
                        onClick={() => docSort.handleSort("doc_number")}
                        className={TABLE.thSortable}
                      />
                      <SortableTh
                        label="ประเภท"
                        align="left"
                        active={docSort.sort.key === "doc_type"}
                        dir={docSort.sort.dir}
                        onClick={() => docSort.handleSort("doc_type")}
                        className={TABLE.thSortable}
                      />
                      <th className={TABLE.thStatic}>ลูกค้า</th>
                      <SortableTh
                        label="วันที่"
                        align="left"
                        active={docSort.sort.key === "issue_date"}
                        dir={docSort.sort.dir}
                        onClick={() => docSort.handleSort("issue_date")}
                        className={`${TABLE.thSortable} hidden sm:table-cell`}
                      />
                      <SortableTh
                        label="จำนวนเงิน"
                        align="right"
                        active={docSort.sort.key === "net_payable"}
                        dir={docSort.sort.dir}
                        onClick={() => docSort.handleSort("net_payable")}
                        className={TABLE.thSortable}
                      />
                      <SortableTh
                        label="สถานะ"
                        align="left"
                        active={docSort.sort.key === "status"}
                        dir={docSort.sort.dir}
                        onClick={() => docSort.handleSort("status")}
                        className={TABLE.thSortable}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {docSort.sorted.map((doc) => {
                      const overdue =
                        doc.status === "overdue" || isActuallyOverdue(doc);
                      const isVoided = doc.status === "voided";
                      const customerName =
                        (doc as any).customer?.name || "ไม่ได้ระบุลูกค้า";
                      return (
                        <tr
                          key={doc.id}
                          onClick={() => openDocModal(doc)}
                          className={`${TABLE.tbodyTr} ${isVoided ? "opacity-50" : ""} ${selectedDocIds.has(doc.id) ? "bg-primary/5" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <span className="text-cool-900">
                              {doc.doc_number || "-"}
                            </span>
                            {overdue && (
                              <span className="ml-1.5 w-2 h-2 rounded-full bg-danger inline-block" />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <DocTypeBadge
                              docType={doc.doc_type}
                              vatRegistered={doc.vat_registered}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-cool-500 truncate block max-w-[180px]">
                              {customerName}
                            </span>
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell text-cool-400 text-[12px]">
                            <div>{formatBuddhistDate(doc.issue_date)}</div>
                            {showUpdatedAt(doc) && (
                              <div className="text-2xs text-ink-200">แก้ไข: {formatBuddhistDate(doc.updated_at)}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-cool-900">
                              ฿ {formatCurrency(getDisplayAmount(doc) || 0)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge status={doc.status} />
                            {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form ? (
                              <span className="ml-1 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                                ฟอร์มเปล่า
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-5">
            {sections.map((section) => (
              <section
                key={section.key}
                className={`space-y-3 ${section.tone === "muted" ? "opacity-60" : ""}`}
              >
                <SectionHeader
                  title={section.title}
                  hint={section.hint}
                  count={section.docs.length}
                  tone={section.tone}
                />
                <div className="space-y-2">
                  {section.docs.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onOpen={() => openDocModal(doc)}
                      menuOpen={openMenuId === doc.id}
                      onToggleMenu={() => toggleMenu(doc.id)}
                      onMenuAction={(action) => handleMenuAction(doc, action)}
                      menuLoading={inlineLoading === doc.id}
                      pendingConfirm={pendingConfirm}
                      isSelected={selectedDocIds.has(doc.id)}
                      onToggleSelect={() => toggleSelectDoc(doc.id)}
                      selectMode={selectedDocIds.size > 0}
                      onOpenDeal={
                        doc.deal_id
                          ? () => navigate(`/deals/${doc.deal_id}`)
                          : undefined
                      }
                      permissions={permissions}
                      searchQuery={debouncedSearch || undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {selectedDocIds.size > 0 && (
          <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-white px-5 py-3 shadow-xl md:hidden">
            <span className="text-sm font-medium text-primary">
              เลือก {selectedDocIds.size} รายการ
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={clearSelection}>
                ล้าง
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkDownloadPDF}
                loading={bulkDownloading}
                disabled={bulkDownloading}
              >
                {bulkDownloading
                  ? `${bulkProgress.current}/${bulkProgress.total}`
                  : "ดาวน์โหลด ZIP"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <QuickDetailModal
        doc={selectedDoc}
        open={!!selectedDocId}
        loading={quickDetailLoading}
        onClose={closeDocModal}
        onOpenPreview={() => {
          if (!selectedDocId) return;
          window.open(
            `/documents/${selectedDocId}/print`,
            "_blank",
            "noopener,noreferrer",
          );
        }}
        onOpenFull={() => {
          if (!selectedDocId) return;
          navigate(`/documents/${selectedDocId}`);
          closeDocModal();
        }}
        onOpenDeal={() => {
          if (!selectedDoc?.deal_id) return;
          navigate(`/deals/${selectedDoc.deal_id}`);
          closeDocModal();
        }}
      />
    </AppShell>
  );
}
