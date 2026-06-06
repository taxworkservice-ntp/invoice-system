import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowUpDown, Ban, CheckCircle2, Clock3, Copy, CreditCard, Edit3, FileText, MoreHorizontal, Search, Send, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { Modal } from "../../../components/ui/Modal";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "../../../components/ui/Skeleton";
import { getDocumentDetail, useDocuments } from "../../../hooks/useDocuments";
import { useAuth } from "../../../hooks/useAuth";
import { useToast } from "../../../hooks/useToast";
import { supabase } from "../../../lib/supabase";
import { DOC_TYPE_COLORS, DOC_TYPE_LABELS, STATUS_LABELS } from "../../../constants";
import { documentTypeLabel } from "../../../lib/docLabels";
import { formatBuddhistDate } from "../../../lib/dates";
import { formatCurrency } from "../../../lib/format";
import type { Document, DocumentStatus, DocumentType } from "../../../types";

const DOC_TYPE_FILTERS: { label: string; value: DocumentType | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: "ใบเสนอราคา", value: "quotation" },
  { label: "ใบแจ้งหนี้", value: "invoice" },
  { label: "ใบกำกับภาษี/ใบเสร็จรับเงิน", value: "tax_invoice_receipt" },
  { label: "ใบวางบิล", value: "billing_note" },
  { label: "ใบเสร็จรับเงิน", value: "receipt" },
  { label: "ใบส่งของ", value: "delivery_note" },
  { label: "ใบลดหนี้", value: "credit_note" },
];

const STATUS_FILTERS: { label: string; value: DocumentStatus | "all" }[] = [
  { label: "ทั้งหมด", value: "all" },
  { label: "ร่าง", value: "draft" },
  { label: "ส่งแล้ว", value: "sent" },
  { label: "แปลงแล้ว", value: "converted" },
  { label: "รอวางบิล", value: "in_billing" },
  { label: "ชำระแล้ว", value: "paid" },
  { label: "เกินกำหนด", value: "overdue" },
  { label: "ออกแล้ว", value: "generated" },
  { label: "ยกเลิก", value: "voided" },
];

type QuickView = "all" | "attention" | "draft" | "collect" | "paid" | "voided";

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
  if (diff < 0) return { text: `เกินกำหนด ${Math.abs(diff)} วัน`, urgent: true };
  if (diff === 0) return { text: "ครบกำหนดวันนี้", urgent: true };
  if (diff === 1) return { text: "ครบกำหนดพรุ่งนี้", urgent: false };
  if (diff <= 7) return { text: `ครบกำหนดใน ${diff} วัน`, urgent: false };
  return { text: "", urgent: false };
}

function isResolvedStatus(status: DocumentStatus) {
  return status === "paid" || status === "generated" || status === "issued" || status === "voided" || status === "converted";
}

function isCollectingStatus(doc: Document) {
  return doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue" || doc.status === "paid");
}

function isActuallyOverdue(doc: Document) {
  if (!doc.due_date) return false;
  return (doc.status === "sent" || doc.status === "overdue") && new Date(doc.due_date) < new Date(new Date().toISOString().slice(0, 10));
}

function needsAttention(doc: Document) {
  if (doc.status === "draft") return true;
  if (doc.status === "overdue") return true;
  if (isActuallyOverdue(doc)) return true;
  if (doc.doc_type === "billing_note" && doc.status === "sent") return true;
  return false;
}

function getNextStepText(doc: Document) {
  if (doc.status === "draft") return "ยังไม่ได้ส่ง";
  if (doc.status === "overdue" || isActuallyOverdue(doc)) return "ต้องติดตามการชำระ";
  if (doc.doc_type === "quotation" && doc.status === "sent") return "รอลูกค้ายืนยัน";
  if (doc.doc_type === "invoice" && doc.status === "sent") return "พร้อมวางบิลหรือรับเงิน";
  if (doc.doc_type === "billing_note" && doc.status === "sent") return "รอรับเงิน";
  if (doc.status === "paid" || doc.status === "generated" || doc.status === "issued") return "เสร็จสมบูรณ์";
  if (doc.status === "voided") return "เก็บไว้เป็นประวัติ";
  return "ดูรายละเอียด";
}

function DocTypeBadge({ docType, vatRegistered = false }: { docType: DocumentType; vatRegistered?: boolean }) {
  const color = DOC_TYPE_COLORS[docType];
  const label = documentTypeLabel(docType, vatRegistered);
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}>{label.thai}</span>;
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
    blue: active ? "border-[#378ADD] bg-[#EAF4FF] text-[#0C447C]" : "border-[#D9E7F7] bg-white text-[#0C447C]",
    amber: active ? "border-[#D89A1D] bg-[#FFF4DE] text-[#7A4A00]" : "border-[#F2E2BE] bg-white text-[#7A4A00]",
    red: active ? "border-[#D14343] bg-[#FFF0F0] text-[#8A2020]" : "border-[#F0D0D0] bg-white text-[#8A2020]",
    green: active ? "border-[#3E8D5D] bg-[#EDF8F1] text-[#1E5A38]" : "border-[#D1E9DB] bg-white text-[#1E5A38]",
    gray: active ? "border-[#5E5A52] bg-[#F3F1ED] text-[#3F3B34]" : "border-[#E5E1D9] bg-white text-[#3F3B34]",
  };

  return (
    <button type="button" onClick={onClick} className={`rounded-[18px] border p-4 text-left transition-colors ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{title}</div>
          <div className="text-2xl font-semibold leading-none">{count}</div>
        </div>
        <div className="shrink-0 opacity-80">{icon}</div>
      </div>
      <p className="mt-3 text-xs leading-5 opacity-80">{hint}</p>
    </button>
  );
}

function SectionHeader({ title, hint, count }: { title: string; hint: string; count: number }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-[#1A1A18]">{title}</h2>
        <p className="mt-1 text-xs text-[#6F6A61]">{hint}</p>
      </div>
      <span className="shrink-0 text-xs text-[#888780]">{count} รายการ</span>
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
}) {
  const menuDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target as Node)) {
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
  const isPaid = doc.status === "paid" || doc.status === "generated" || doc.status === "issued";
  const isVoided = doc.status === "voided";
  const isConverted = doc.status === "converted";
  const isTerminal = isPaid || isVoided || isConverted;
  const dueRel = doc.due_date ? relativeDueLabel(doc.due_date) : null;
  const isConfirming = pendingConfirm?.docId === doc.id;

  const customerName = (doc as any).customer?.name || "ไม่ได้ระบุลูกค้า";
  const itemNames = Array.isArray(doc.line_items) ? doc.line_items.map((item) => item.item_name.trim()).filter(Boolean) : [];
  const previewItems = itemNames.slice(0, 3);
  const remainingItems = itemNames.length - previewItems.length;

  return (
    <Card onClick={selectMode ? onToggleSelect : onOpen} className={`cursor-pointer overflow-hidden !p-0 relative border-l-4 ${DOC_TYPE_BORDER[doc.doc_type]} ${overdue ? "bg-red-50/30" : ""} ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}>
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          {selectMode && (
            <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
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
              <span className="text-sm font-semibold text-[#1A1A18]">{doc.doc_number || "-"}</span>
              <DocTypeBadge docType={doc.doc_type} vatRegistered={doc.vat_registered} />
              <span className="hidden sm:inline-flex">
                <Badge status={doc.status} />
              </span>
              {overdue && <span className="inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">ต้องติดตาม</span>}
            </div>

            <div className="space-y-1">
              <span className="inline-flex sm:hidden">
                <Badge status={doc.status} />
              </span>
              <p className="truncate text-sm text-[#444441]">{customerName}</p>
              <p className="text-xs text-[#7D776D]">{getNextStepText(doc)}</p>
            </div>

            <div className="flex flex-col gap-1 text-xs text-[#888780] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <span>ออกเอกสาร: {formatBuddhistDate(doc.issue_date)}</span>
              {doc.due_date && dueRel?.text ? (
                <span className={dueRel.urgent ? "font-medium text-red-600" : ""}>
                  &middot; {dueRel.text}
                </span>
              ) : doc.due_date ? (
                <span className={overdue ? "font-medium text-red-600" : ""}>
                  &middot; ครบกำหนด: {formatBuddhistDate(doc.due_date)}
                </span>
              ) : null}
            </div>
            {previewItems.length > 0 && (
              <div className="pt-1">
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {previewItems.map((itemName, index) => (
                    <span
                      key={`${doc.id}-item-${index}-${itemName}`}
                      className="inline-flex max-w-full rounded-full bg-[#F3F0E8] px-2.5 py-1 text-xs text-[#5B564D]"
                    >
                      <span className="truncate">{itemName}</span>
                    </span>
                  ))}
                  {remainingItems > 0 && (
                    <span className="inline-flex rounded-full bg-[#ECE8DE] px-2.5 py-1 text-xs font-medium text-[#6E685E]">
                      +{remainingItems} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 pl-2 text-right ml-auto">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#888780]">ยอดสุทธิ</div>
            <div className={`mt-1 text-sm font-semibold ${overdue ? "text-red-700" : isPaid ? "text-green-700" : "text-[#1A1A18]"}`}>
              ฿{formatCurrency(doc.net_payable)}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
              className="mt-1.5 rounded p-0.5 hover:bg-gray-100 transition-colors"
              disabled={menuLoading}
            >
              <MoreHorizontal size={15} className={menuLoading ? "text-gray-300" : "text-[#9A968F]"} />
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
            <div className="px-3 py-2 text-xs text-gray-400 text-center">กำลังดำเนินการ...</div>
          )}

          {!menuLoading && isConfirming && (
            <>
              <div className="px-3 py-1.5 text-xs text-red-600 font-medium border-b border-gray-100">
                {pendingConfirm!.action === "void" ? "ยืนยันการยกเลิก?" : "ยืนยันการลบ?"}
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
              {isDraft && doc.doc_type !== "receipt" && doc.doc_type !== "credit_note" && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("send")}>
                    <Send size={14} />
                    <span>ทำเครื่องหมายว่าส่งแล้ว</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("edit")}>
                    <Edit3 size={14} />
                    <span>แก้ไข</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("delete")}>
                    <Trash2 size={14} />
                    <span>ลบ</span>
                  </button>
                </>
              )}

              {isDraft && doc.doc_type === "credit_note" && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("issue_cn")}>
                    <FileText size={14} />
                    <span>ออกใบลดหนี้</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("edit")}>
                    <Edit3 size={14} />
                    <span>แก้ไข</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("delete")}>
                    <Trash2 size={14} />
                    <span>ลบ</span>
                  </button>
                </>
              )}

              {isDraft && doc.doc_type === "receipt" && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("edit")}>
                    <Edit3 size={14} />
                    <span>แก้ไข</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("delete")}>
                    <Trash2 size={14} />
                    <span>ลบ</span>
                  </button>
                </>
              )}

              {isSent && doc.doc_type === "quotation" && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("convert")}>
                    <Copy size={14} />
                    <span>แปลงเป็นใบแจ้งหนี้</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("void")}>
                    <Ban size={14} />
                    <span>ยกเลิก</span>
                  </button>
                </>
              )}

              {isSent && doc.doc_type === "invoice" && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("billing")}>
                    <FileText size={14} />
                    <span>วางบิล</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("pay")}>
                    <CreditCard size={14} />
                    <span>รับเงินแล้ว</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("void")}>
                    <Ban size={14} />
                    <span>ยกเลิก</span>
                  </button>
                </>
              )}

              {isSent && doc.doc_type === "billing_note" && (
                <>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("pay")}>
                    <CreditCard size={14} />
                    <span>รับเงินแล้ว</span>
                  </button>
                  <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("void")}>
                    <Ban size={14} />
                    <span>ยกเลิก</span>
                  </button>
                </>
              )}

              {isSent && doc.doc_type !== "quotation" && doc.doc_type !== "invoice" && doc.doc_type !== "billing_note" && (
                <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={() => onMenuAction("void")}>
                  <Ban size={14} />
                  <span>ยกเลิก</span>
                </button>
              )}

              {isTerminal && (
                <button className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => onMenuAction("copy")}>
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
      <Modal open={open} onClose={onClose} title="รายละเอียดเอกสาร" className="md:max-w-3xl">
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
  const lineDiscountTotal = items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
  const detailRows = [
    { label: "ลูกค้า", value: customerName },
    { label: "วันที่ออก", value: formatBuddhistDate(doc.issue_date) },
    { label: "ครบกำหนด", value: doc.due_date ? formatBuddhistDate(doc.due_date) : "ไม่มีกำหนด", emphasis: overdue },
    { label: "ขั้นตอนถัดไป", value: getNextStepText(doc) },
  ];

  return (
    <Modal open={open} onClose={onClose} title={doc.doc_number || "รายละเอียดเอกสาร"} className="md:max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-[22px] border border-[#E8E6DF] bg-[linear-gradient(135deg,#FFFDF8_0%,#F6F2EA_100%)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DocTypeBadge docType={doc.doc_type} vatRegistered={doc.vat_registered} />
            <Badge status={doc.status} />
            {overdue && (
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">ต้องติดตาม</span>
            )}
          </div>

          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">ยอดสุทธิ</div>
            <div className="mt-1 text-3xl font-semibold text-[#1A1A18]">฿ {formatCurrency(doc.net_payable)}</div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#E8E6DF] bg-white p-4">
          <div className="space-y-3 text-sm">
            {detailRows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-4">
                <span className="text-[#7B766E]">{row.label}</span>
                <span className={`text-right font-medium ${row.emphasis ? "text-red-700" : "text-[#1A1A18]"}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {items.length > 0 && (
          <div className="rounded-[22px] border border-[#E8E6DF] bg-white p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">รายการ</div>
              <div className="text-xs text-[#7B766E]">{items.length} รายการ</div>
            </div>

            <div className="mt-2.5 space-y-1.5 sm:hidden">
              {items.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-[18px] border border-[#F0ECE5] bg-[#FCFBF8] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium leading-5 text-[#1A1A18]">{item.item_name}</p>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[#8A8478]">รวม</div>
                          <div className="text-sm font-semibold leading-5 text-[#1A1A18]">฿ {formatCurrency(item.line_total)}</div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-[#7B766E]">
                        <span>{item.quantity} {item.unit}</span>
                        <span>x ฿ {formatCurrency(item.unit_price)}</span>
                      </div>
                      {item.discount_amount > 0 && (
                        <p className="mt-1 text-[11px] leading-4 text-red-700">ส่วนลด {item.discount_percent}% (-฿ {formatCurrency(item.discount_amount)})</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2.5 hidden overflow-hidden rounded-2xl border border-[#F0ECE5] sm:block">
              <div className="grid grid-cols-[minmax(0,1.7fr)_0.8fr_0.9fr] gap-3 bg-[#FAF8F3] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#8A8478]">
                <div>รายการ</div>
                <div className="text-right">จำนวน x ราคา</div>
                <div className="text-right">Total</div>
              </div>
              {items.slice(0, 4).map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(0,1.7fr)_0.8fr_0.9fr] gap-3 px-4 py-3 ${
                    index === 0 ? "" : "border-t border-[#F0ECE5]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-5 text-[#1A1A18]">{item.item_name}</p>
                    {item.discount_amount > 0 && (
                      <p className="mt-1 text-[11px] leading-4 text-red-700">ส่วนลด {item.discount_percent}% (-฿ {formatCurrency(item.discount_amount)})</p>
                    )}
                  </div>
                  <div className="text-right text-sm leading-5 text-[#5F5A52]">
                    {item.quantity} {item.unit}
                    <div className="mt-0.5 text-[11px] leading-4 text-[#8A8478]">x ฿ {formatCurrency(item.unit_price)}</div>
                  </div>
                  <div className="text-right text-sm font-semibold leading-5 text-[#1A1A18]">฿ {formatCurrency(item.line_total)}</div>
                </div>
              ))}
            </div>

            {items.length > 4 && <div className="mt-3 text-center text-xs text-[#7B766E]">และอีก {items.length - 4} รายการในหน้ารายละเอียดเต็ม</div>}
          </div>
        )}

        <div className="rounded-[22px] border border-[#E8E6DF] bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">สรุปยอด</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-[#7B766E]">Subtotal</span>
              <span className="text-right font-medium text-[#1A1A18]">฿ {formatCurrency(doc.subtotal)}</span>
            </div>
            {lineDiscountTotal > 0 && (
              <div className="flex items-start justify-between gap-4 text-red-700">
                <span>ส่วนลดรายการ</span>
                <span className="text-right font-medium">-฿ {formatCurrency(lineDiscountTotal)}</span>
              </div>
            )}
            {doc.discount_amount > 0 && (
              <div className="flex items-start justify-between gap-4 text-red-700">
                <span>ส่วนลดท้ายบิล</span>
                <span className="text-right font-medium">-฿ {formatCurrency(doc.discount_amount)}</span>
              </div>
            )}
            {doc.vat_registered && (
              <div className="flex items-start justify-between gap-4">
                <span className="text-[#7B766E]">VAT {doc.vat_rate}%</span>
                <span className="text-right font-medium text-[#1A1A18]">฿ {formatCurrency(doc.vat_amount)}</span>
              </div>
            )}
            {doc.wht_rate > 0 && (
              <div className="flex items-start justify-between gap-4 text-red-700">
                <span>หัก ณ ที่จ่าย {doc.wht_rate}%</span>
                <span className="text-right font-medium">-฿ {formatCurrency(doc.wht_amount)}</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 border-t border-[#F0ECE5] pt-2">
              <span className="font-medium text-[#1A1A18]">ยอดสุทธิ</span>
              <span className="text-right text-base font-semibold text-[#1A1A18]">฿ {formatCurrency(doc.net_payable)}</span>
            </div>
          </div>
        </div>

        {doc.note && (
          <div className="rounded-[22px] border border-[#E8E6DF] bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-[#8A8478]">หมายเหตุ</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#4F4A42]">{doc.note}</p>
          </div>
        )}

        <div className="space-y-2 border-t border-[#F0ECE5] pt-3">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
              ปิด
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {doc.deal_id && (
                <Button variant="secondary" onClick={onOpenDeal} className="w-full sm:w-auto">
                  เปิดดีล
                </Button>
              )}
              <Button variant="secondary" onClick={onOpenFull} className="w-full sm:w-auto">
                ดูรายละเอียด
              </Button>
              <Button onClick={onOpenPreview} className="w-full sm:w-auto">
                ดูเอกสาร
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
  const { profile } = useAuth();
  const toast = useToast();
  const { documents, loading, refetch } = useDocuments(profile?.id);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchDebouncing, setSearchDebouncing] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [quickView, setQuickView] = useState<QuickView>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [quickDetailLoading, setQuickDetailLoading] = useState(false);
  const preset = searchParams.get("preset");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [inlineLoading, setInlineLoading] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ docId: string; action: "void" | "delete" } | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

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
    setInlineLoading(doc.id);
    try {
      if (action === "send") {
        const newStatus: DocumentStatus = doc.doc_type === "tax_invoice_receipt" ? "issued" : "sent";
        await supabase.from("documents").update({ status: newStatus }).eq("id", doc.id);
        toast.success("ทำเครื่องหมายว่าส่งแล้ว");
      } else if (action === "void") {
        await supabase.from("documents").update({ status: "voided" as DocumentStatus, voided_at: new Date().toISOString() }).eq("id", doc.id);
        toast.success("ยกเลิกเอกสารแล้ว");
      } else if (action === "delete") {
        await supabase.from("document_line_items").delete().eq("document_id", doc.id);
        await supabase.from("documents").delete().eq("id", doc.id);
        toast.success("ลบเอกสารแล้ว");
      } else if (action === "issue_cn") {
        await supabase.from("documents").update({ status: "issued" as DocumentStatus }).eq("id", doc.id);
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
      navigate(`/documents/new?type=billing_note&deal=${doc.deal_id || ""}`);
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
      const { generatePDFBlob } = await import("../../../lib/pdf");
      const JSZip = (await import("jszip")).default;

      const zip = new JSZip();

      for (let i = 0; i < ids.length; i++) {
        setBulkProgress({ current: i + 1, total: ids.length });

        const doc = await getDocumentDetail(ids[i]);
        if (!doc) continue;

        const { data: clientProfile } = await supabase
          .from("client_profiles")
          .select("*")
          .eq("user_id", profile.id)
          .single();

        const customer = (doc as any).customer || null;
        if (!clientProfile || !customer) continue;

        const blob = await generatePDFBlob({
          document: doc,
          lineItems: doc.line_items || [],
          billingNoteInvoices: (doc as any).billing_invoices || [],
          clientProfile,
          customer,
        });

        const filename = `${doc.doc_type}_${doc.doc_number || ids[i].slice(0, 8)}.pdf`;
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
      if (!isCollectingStatus(doc) || doc.status !== "paid" || !doc.paid_at) return false;
      const paidAt = new Date(doc.paid_at);
      const now = new Date();
      return paidAt.getMonth() === now.getMonth() && paidAt.getFullYear() === now.getFullYear();
    }).length;

    return {
      draft: documents.filter((doc) => doc.status === "draft").length,
      collect: documents.filter((doc) => doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue")).length,
      overdue: documents.filter((doc) => doc.status === "overdue" || isActuallyOverdue(doc)).length,
      paidThisMonth,
      voided: documents.filter((doc) => doc.status === "voided").length,
    };
  }, [documents]);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      if (docTypeFilter !== "all" && doc.doc_type !== docTypeFilter) return false;
      if (statusFilter !== "all" && doc.status !== statusFilter) return false;

      if (quickView === "attention" && !needsAttention(doc)) return false;
      if (quickView === "draft" && doc.status !== "draft") return false;
      if (quickView === "collect" && !(doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue" || doc.status === "paid"))) return false;
      if (quickView === "paid" && !(doc.doc_type === "billing_note" && doc.status === "paid")) return false;
      if (quickView === "voided" && doc.status !== "voided") return false;

      if (preset === "paid_this_month") {
        if (doc.doc_type !== "billing_note" || doc.status !== "paid" || !doc.paid_at) return false;
        const paidAt = new Date(doc.paid_at);
        const now = new Date();
        if (paidAt.getMonth() !== now.getMonth() || paidAt.getFullYear() !== now.getFullYear()) return false;
      }

      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const customerName = ((doc as any).customer?.name || "").toLowerCase();
        const docNumber = (doc.doc_number || "").toLowerCase();
        const note = (doc.note || "").toLowerCase();
        if (!customerName.includes(query) && !docNumber.includes(query) && !note.includes(query)) return false;
      }

      if (dateFrom && doc.issue_date < dateFrom) return false;
      if (dateTo && doc.issue_date > dateTo) return false;
      return true;
    });
  }, [documents, docTypeFilter, statusFilter, quickView, preset, debouncedSearch, dateFrom, dateTo]);

  const grouped = useMemo(() => {
    const attention = filtered.filter((doc) => needsAttention(doc));
    const active = filtered.filter((doc) => !needsAttention(doc) && !isResolvedStatus(doc.status));
    const completed = filtered.filter((doc) => ["paid", "generated", "issued"].includes(doc.status));
    const voided = filtered.filter((doc) => doc.status === "voided");
    return { attention, active, completed, voided };
  }, [filtered]);

  const hasFilters =
    quickView !== "all" ||
    docTypeFilter !== "all" ||
    statusFilter !== "all" ||
    dateFrom ||
    dateTo ||
    debouncedSearch;

  function clearFilters() {
    setSearch("");
    setQuickView("all");
    setDocTypeFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setMobileFiltersOpen(false);
  }

  function handleExportCSV() {
    const headers = ["เลขที่เอกสาร", "ประเภท", "สถานะ", "ลูกค้า", "วันที่ออก", "วันครบกำหนด", "ยอดสุทธิ"];
    const rows = filtered.map((doc) => [
      doc.doc_number || "",
      DOC_TYPE_LABELS[doc.doc_type].th,
      STATUS_LABELS[doc.status],
      (doc as any).customer?.name || "",
      doc.issue_date,
      doc.due_date || "",
      doc.net_payable.toString(),
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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
    { key: "attention", title: "ต้องดูตอนนี้", hint: "ร่างค้าง เอกสารเกินกำหนด และงานที่ยังรอเก็บเงิน", docs: grouped.attention },
    { key: "active", title: "กำลังดำเนินการ", hint: "เอกสารที่ยังอยู่ใน workflow แต่ยังไม่ใช่งานเร่งด่วน", docs: grouped.active },
    { key: "completed", title: "เสร็จแล้ว", hint: "ประวัติเอกสารที่ปิดงานแล้วหรือรับเงินแล้ว", docs: grouped.completed },
    { key: "voided", title: "ยกเลิก", hint: "เก็บไว้เป็นประวัติอ้างอิงภายหลัง", docs: grouped.voided },
  ].filter((section) => section.docs.length > 0);

  const mobileQuickFilters: { label: string; value: QuickView; count: number }[] = [
    { label: "ทั้งหมด", value: "all", count: documents.length },
    { label: "ต้องตาม", value: "attention", count: summary.overdue },
    { label: "ร่าง", value: "draft", count: summary.draft },
    { label: "รอเก็บเงิน", value: "collect", count: summary.collect },
    { label: "รับเงินแล้ว", value: "paid", count: summary.paidThisMonth },
  ];

  return (
    <AppShell
      title="เอกสาร"
      action={
        <Button size="sm" onClick={() => navigate("/deals/new")}>
          เริ่มงานใหม่
        </Button>
      }
    >
      <div className="space-y-4 sm:space-y-5">
        <section className="rounded-[22px] border border-[#E8E6DF] bg-[linear-gradient(135deg,#FFFDF8_0%,#F7F4EC_100%)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1A1A18]">Documents command center</h2>
              <p className="mt-1 text-sm leading-6 text-[#6F6A61]">ดูว่าเอกสารไหนต้องตามต่อ เอกสารไหนเสร็จแล้ว และเปิดรายละเอียดได้เร็วขึ้นจากหน้าเดียว</p>
            </div>
            <div className="hidden rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-[#7D776D] sm:block">
              {filtered.length} จาก {documents.length} รายการ
            </div>
          </div>

          <div className="mt-4 hidden gap-2 md:grid md:grid-cols-5">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} className="p-0" />)
            ) : (
              <>
                <SummaryCard title="ร่าง" count={summary.draft} hint="ยังไม่ได้ส่งลูกค้า" active={quickView === "draft"} tone="blue" icon={<FileText className="h-5 w-5" />} onClick={() => setQuickView((value) => (value === "draft" ? "all" : "draft"))} />
                <SummaryCard title="รอเก็บเงิน" count={summary.collect} hint="ใบวางบิลที่ยังต้องตาม" active={quickView === "collect"} tone="amber" icon={<Clock3 className="h-5 w-5" />} onClick={() => setQuickView((value) => (value === "collect" ? "all" : "collect"))} />
                <SummaryCard title="เกินกำหนด" count={summary.overdue} hint="ควรขึ้นมาก่อนบนมือถือ" active={quickView === "attention" || (quickView === "all" && statusFilter === "overdue")} tone="red" icon={<AlertTriangle className="h-5 w-5" />} onClick={() => setQuickView((value) => (value === "attention" ? "all" : "attention"))} />
                <SummaryCard title="รับเงินเดือนนี้" count={summary.paidThisMonth} hint="ไว้เช็กของที่ปิดงานแล้ว" active={quickView === "paid"} tone="green" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setQuickView((value) => (value === "paid" ? "all" : "paid"))} />
                <SummaryCard title="ยกเลิก" count={summary.voided} hint="เก็บแยกจากเอกสารที่ยังใช้งาน" active={quickView === "voided"} tone="gray" icon={<XCircle className="h-5 w-5" />} onClick={() => setQuickView((value) => (value === "voided" ? "all" : "voided"))} />
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
                  className={`shrink-0 rounded-full border px-3 py-2 text-sm transition-colors ${quickView === filter.value ? "border-primary bg-primary text-white" : "border-[#DDD7CC] bg-white text-[#4D493F]"}`}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-[22px] border border-[#E8E6DF] bg-white p-4">
          <div className="sticky top-[72px] z-20 -mx-4 border-b border-[#F0ECE5] bg-white px-4 pb-3 pt-1 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
            <div className="flex items-center gap-2 md:hidden">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A968F]" />
                <Input id="search-mobile" className="pl-9" placeholder="ค้นหาเอกสาร" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => setMobileFiltersOpen((value) => !value)}>
                <SlidersHorizontal className="h-4 w-4" />
                {hasFilters ? "ตัวกรอง" : "กรอง"}
              </Button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 md:hidden">
              <span className="text-xs text-[#7D776D]">{filtered.length} รายการ</span>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="text-xs font-medium text-primary hover:underline">
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[#666258]">ค้นหาเอกสาร</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A968F]" />
                <Input id="search" className="pl-9" placeholder="ค้นหาชื่อลูกค้า เลขที่เอกสาร หรือหมายเหตุ" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:w-[320px]">
              <Input id="dateFrom" type="date" label="จากวันที่" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input id="dateTo" type="date" label="ถึงวันที่" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>

          {searchDebouncing && (
            <div className="-mt-1 flex justify-end">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}

          <div className={`space-y-3 ${mobileFiltersOpen ? "block" : "hidden"} md:block`}>
            <div className="grid grid-cols-2 gap-2 md:hidden">
              <Input id="dateFromMobile" type="date" label="จากวันที่" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input id="dateToMobile" type="date" label="ถึงวันที่" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#666258]">
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
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#666258]">
                <ArrowUpDown className="h-3.5 w-3.5" />
                สถานะ
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${statusFilter === filter.value ? "border-[#3F3B34] bg-[#3F3B34] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden flex-wrap items-center justify-between gap-3 border-t border-[#F0ECE5] pt-3 md:flex">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#7D776D]">
              {quickView !== "all" && <span className="rounded-full bg-[#EEF5FC] px-2.5 py-1 text-[#1A5A92]">กำลังดูแบบลัด</span>}
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="text-primary hover:underline">
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#7D776D]">{filtered.length} จาก {documents.length} รายการ</span>
              {selectedDocIds.size > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearSelection}>
                  ยกเลิกเลือก ({selectedDocIds.size})
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                  เลือกทั้งหมด
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                ส่งออก CSV
              </Button>
              {selectedDocIds.size > 0 && (
                <Button variant="primary" size="sm" onClick={handleBulkDownloadPDF} loading={bulkDownloading} disabled={bulkDownloading}>
                  {bulkDownloading ? `กำลังสร้าง ${bulkProgress.current}/${bulkProgress.total}` : "ดาวน์โหลด PDF (ZIP)"}
                </Button>
              )}
            </div>
          </div>
        </section>

        {loading ? (
          <SkeletonTable />
        ) : filtered.length === 0 ? (
          <EmptyState title="ไม่พบเอกสาร" description={documents.length === 0 ? "ยังไม่มีเอกสารในระบบ" : "ลองเปลี่ยนคำค้นหา หรือปรับตัวกรอง"} />
        ) : (
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.key} className="space-y-3">
                <SectionHeader title={section.title} hint={section.hint} count={section.docs.length} />
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
              <Button variant="primary" size="sm" onClick={handleBulkDownloadPDF} loading={bulkDownloading} disabled={bulkDownloading}>
                {bulkDownloading ? `${bulkProgress.current}/${bulkProgress.total}` : "ดาวน์โหลด ZIP"}
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
          window.open(`/documents/${selectedDocId}/print`, "_blank", "noopener,noreferrer");
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


