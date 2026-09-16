import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  Ban,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  FileStack,
  FileText,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { StatusBadge } from "../ui/StatusBadge";
import { Money } from "../ui/Money";
import { getDocumentMenuActions, type DocumentActionId } from "../../lib/documentActions";
import type { WorkspacePermissions } from "../../lib/permissions";
import { formatBuddhistDate } from "../../lib/dates";
import type { Document } from "../../types";

const ACTION_ICONS: Record<DocumentActionId, ReactNode> = {
  send: <Send size={14} />,
  edit: <Edit3 size={14} />,
  delete: <Trash2 size={14} />,
  void: <Ban size={14} />,
  issue_cn: <FileText size={14} />,
  confirm_receipt: <CheckCircle2 size={14} />,
  convert: <Copy size={14} />,
  billing: <FileText size={14} />,
  pay: <CreditCard size={14} />,
  invoice_from_dn: <FileStack size={14} />,
  copy: <Copy size={14} />,
};

/** Splits text on the query terms and wraps matches for a subtle highlight. */
function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim();
  if (!q) return <>{text}</>;
  const terms = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${terms.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => part.toLowerCase() === term.toLowerCase().replace(/\\/g, "")) ? (
          <mark key={index} className="rounded-control bg-amber-100 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

interface DocumentRowProps {
  doc: Document;
  permissions: WorkspacePermissions;
  overdue: boolean;
  customerName: string;
  nextStep: string;
  displayAmount: number;
  displayAmountLabel: string;
  menuOpen: boolean;
  menuLoading: boolean;
  pendingConfirm: { docId: string; action: "void" | "delete" } | null;
  onToggleMenu: () => void;
  onAction: (action: DocumentActionId | "cancelConfirm") => void;
  onOpen: () => void;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenDeal?: () => void;
  searchQuery?: string;
  quickAction?: { id: DocumentActionId; label: string } | null;
}

export function DocumentRow({
  doc,
  permissions,
  overdue,
  customerName,
  nextStep,
  displayAmount,
  displayAmountLabel,
  menuOpen,
  menuLoading,
  pendingConfirm,
  onToggleMenu,
  onAction,
  onOpen,
  selectMode,
  isSelected,
  onToggleSelect,
  onOpenDeal,
  searchQuery,
  quickAction,
}: DocumentRowProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isVoided = doc.status === "voided";
  const isSettled = ["paid", "generated", "issued", "partially_paid"].includes(doc.status);
  const isConfirming = pendingConfirm?.docId === doc.id;
  const actions = getDocumentMenuActions(doc, permissions);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onToggleMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggleMenu();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onToggleMenu]);

  return (
    <div
      className={`group relative border-b border-line-faint last:border-0 transition-colors hover:bg-paper-field ${ isSelected ? "bg-primary/5" : "" }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`เอกสาร ${doc.doc_number || ""} ${customerName}`}
        onClick={selectMode ? onToggleSelect : onOpen}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (selectMode) onToggleSelect();
          else onOpen();
        }}
        className="flex items-start gap-3 px-4 py-3 focus:outline-none focus-visible:bg-primary-soft/40"
      >
        {selectMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            onClick={(event) => event.stopPropagation()}
            aria-label={`เลือก ${doc.doc_number || ""}`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`text-body font-semibold ${ isVoided ? "text-ink-300 line-through" : "text-ink-900" }`}
            >
              <Highlight text={doc.doc_number || "-"} query={searchQuery} />
            </span>
            <StatusBadge docType={doc.doc_type} vatRegistered={doc.vat_registered} />
            <Badge status={doc.status} />
            {doc.doc_type === "delivery_note" && doc.status === "draft" && doc.is_blank_form && (
              <StatusBadge label="ฟอร์มเปล่า" tone="amber" />
            )}
            {overdue && doc.status !== "overdue" && (
              <StatusBadge label="เกินกำหนด" tone="red" />
            )}
          </div>

          <p className="mt-1 truncate text-body text-ink-700">
            <Highlight text={customerName} query={searchQuery} />
          </p>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-label text-ink-400">
            <span>ออกเอกสาร {formatBuddhistDate(doc.issue_date)}</span>
            {doc.due_date && <span>· ครบกำหนด {formatBuddhistDate(doc.due_date)}</span>}
            {!isSettled && <span className="text-ink-300">· {nextStep}</span>}
            {isVoided && doc.voided_reason && (
              <span className="italic text-ink-300">· เหตุผล: {doc.voided_reason}</span>
            )}
            {onOpenDeal && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDeal();
                }}
                className="text-primary hover:underline"
              >
                · ดูงานขาย
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-label text-ink-300">
            {displayAmountLabel}
          </div>
          <Money
            value={displayAmount}
            className={`text-body font-semibold ${ overdue ? "text-red-700" : isSettled ? "text-green-700" : "text-ink-900" }`}
          />

          <div className="mt-1.5 flex items-center justify-end gap-1">
            {quickAction && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAction(quickAction.id);
                }}
                disabled={menuLoading}
                className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-label font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {quickAction.label}
              </button>
            )}
            {actions.length > 0 && (
              <button
                type="button"
                aria-label="ตัวเลือกเอกสาร"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleMenu();
                }}
                disabled={menuLoading}
                className="rounded-control p-1.5 text-ink-300 transition-colors hover:bg-ink-50 hover:text-ink-700 disabled:opacity-50"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="absolute right-4 top-12 z-50 w-48 rounded-control border border-card-border bg-white py-1"
        >
          {menuLoading && (
            <div className="px-3 py-2 text-center text-label text-ink-400">กำลังดำเนินการ...</div>
          )}

          {!menuLoading && isConfirming && (
            <>
              <div className="border-b border-line-faint px-3 py-1.5 text-label font-medium text-red-600">
                {pendingConfirm!.action === "void" ? "ยืนยันการยกเลิก?" : "ยืนยันการลบ?"}
              </div>
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 bg-red-500 px-3 py-1.5 text-left text-body text-white hover:bg-red-600"
                onClick={() => onAction(pendingConfirm!.action)}
              >
                <Trash2 size={14} />
                <span>ยืนยัน</span>
              </button>
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-body text-ink-600 hover:bg-paper-field"
                onClick={() => onAction("cancelConfirm")}
              >
                <span className="pl-[22px]">ยกเลิก</span>
              </button>
            </>
          )}

          {!menuLoading && !isConfirming && (
            <>
              {actions.map((action) => (
                <button
                  key={action.id}
                  role="menuitem"
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body ${ action.danger ? "text-red-600 hover:bg-red-50" : "text-ink-700 hover:bg-paper-field" }`}
                  onClick={() => onAction(action.id)}
                >
                  {ACTION_ICONS[action.id]}
                  <span>{action.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
