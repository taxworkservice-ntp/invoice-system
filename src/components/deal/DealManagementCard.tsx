import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EditableDocNumber } from "../documents/EditableDocNumber";
import { documentTypeLabel } from "../../lib/docLabels";
import { canSendDocumentType, type WorkspacePermissions } from "../../lib/permissions";
import type { DocWithMeta } from "./types";

export interface DealManagementCardProps {
  activeDoc: DocWithMeta | null;
  allDone: boolean;
  hasPaidDocs: boolean;
  hasActiveDnLinks: boolean;
  permissions: WorkspacePermissions;
  isDevMode: boolean;
  docNumberOverride: string;
  onDocNumberChange: (value: string) => void;
  onPrimaryAction: () => void;
  onUnlinkInvoices: () => void;
  onUnlinkDeliveryNotes: () => void;
  onCreateCreditNote: () => void;
  onCreateDebitNote: () => void;
  onDevDelete: () => void;
}

export function DealManagementCard({
  activeDoc,
  allDone,
  hasPaidDocs,
  hasActiveDnLinks,
  permissions,
  isDevMode,
  docNumberOverride,
  onDocNumberChange,
  onPrimaryAction,
  onUnlinkInvoices,
  onUnlinkDeliveryNotes,
  onCreateCreditNote,
  onCreateDebitNote,
  onDevDelete,
}: DealManagementCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-label font-semibold text-ink-500">จัดการเอกสารล่าสุด</div>
          <div className="mt-1 text-label text-ink-500">แก้ไขหรือยกเลิกเอกสารที่กำลังดำเนินการ</div>
        </div>
        {activeDoc && (
          <div className="hidden min-w-0 text-right text-label text-ink-400 sm:block">
            <div className="truncate font-medium text-ink-600">
              {
                documentTypeLabel(activeDoc.document.doc_type, activeDoc.document.vat_registered)
                  .thai
              }
            </div>
            <div className="truncate">{activeDoc.document.doc_number || "ยังไม่มีเลขเอกสาร"}</div>
          </div>
        )}
      </div>
      {activeDoc && (
        <div className="mt-3 rounded-control border border-line bg-paper-field px-3 py-2 text-label leading-5 text-ink-700">
          {activeDoc.document.status === "draft"
            ? "เอกสารร่างสามารถแก้ไขได้โดยตรง"
            : activeDoc.document.doc_type === "invoice"
              ? "ระบบจะเก็บเอกสารเดิมไว้เป็นประวัติ และสร้างฉบับใหม่ให้แก้ไข"
              : "เอกสารที่ส่งแล้วจะถูกยกเลิกและสร้างฉบับร่างใหม่ โดยเก็บฉบับเดิมไว้เป็นประวัติ"}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {activeDoc?.document.status === "draft" ? null : (
          <Button
            variant="secondary"
            tone="blue"
            className="w-full justify-center"
            onClick={onPrimaryAction}
          >
            {activeDoc?.document.doc_type === "billing_note" &&
            activeDoc?.document.status !== "paid"
              ? "แก้ไขใบวางบิล"
              : activeDoc?.document.doc_type === "invoice"
                ? "แก้ไขโดยออกฉบับใหม่"
                : "แก้ไข (เก็บฉบับเดิมไว้)"}
          </Button>
        )}
        {activeDoc?.document.doc_type === "billing_note" &&
          activeDoc.billing_invoices.length > 0 && (
            <Button
              variant="secondary"
              tone="red"
              className="w-full justify-center"
              onClick={onUnlinkInvoices}
            >
              แยกใบแจ้งหนี้ออกจากใบวางบิล
            </Button>
          )}
        {activeDoc?.document.doc_type === "invoice" && hasActiveDnLinks && (
          <Button
            variant="secondary"
            tone="red"
            className="w-full justify-center"
            onClick={onUnlinkDeliveryNotes}
          >
            แยกใบส่งของออกจากใบแจ้งหนี้
          </Button>
        )}
        {allDone && hasPaidDocs && canSendDocumentType(permissions, "credit_note") && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              tone="slate"
              className="justify-center"
              onClick={onCreateCreditNote}
            >
              ออกใบลดหนี้
            </Button>
            <Button
              variant="secondary"
              tone="slate"
              className="justify-center"
              onClick={() => onCreateDebitNote()}
            >
              ออกใบเพิ่มหนี้
            </Button>
          </div>
        )}
        {isDevMode && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <div className="text-label font-semibold text-ink-400">เครื่องมือ Dev</div>
            <div className="text-label text-ink-500">เลขที่เอกสาร (เว้นว่าง = อัตโนมัติ)</div>
            <EditableDocNumber
              value={docNumberOverride}
              onChange={onDocNumberChange}
              placeholder="เลขที่เอกสาร"
            />
            <Button
              variant="secondary"
              tone="red"
              className="w-full justify-center"
              onClick={() => onDevDelete()}
            >
              ลบงานขายนี้ทั้งชุด (Dev)
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
