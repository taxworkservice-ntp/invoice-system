import { Modal } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";

export interface InvoicePrintTitleConfirmModalProps {
  open: boolean;
  currentLabel: string;
  nextLabel: string;
  reason: string;
  confirmWord: string;
  saving: boolean;
  onReasonChange: (value: string) => void;
  onConfirmWordChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function InvoicePrintTitleConfirmModal({
  open,
  currentLabel,
  nextLabel,
  reason,
  confirmWord,
  saving,
  onReasonChange,
  onConfirmWordChange,
  onCancel,
  onConfirm,
}: InvoicePrintTitleConfirmModalProps) {
  const canConfirm = reason.trim().length >= 5 && confirmWord.trim() === "ยืนยัน" && !saving;

  return (
    <Modal open={open} onClose={onCancel} title="ยืนยันการเปลี่ยนชื่อหัวเอกสาร" size="lg">
      <div className="space-y-4">
        <div className="rounded-control border border-warning-border bg-warning-soft px-3 py-2.5 text-label leading-5 text-warning-text">
          มีผลกับใบกำกับภาษีใหม่เท่านั้น — เอกสารที่ออกแล้วจะไม่ถูกเปลี่ยนชื่อย้อนหลัง
          และชื่อภาษาไทยต้องขึ้นต้นด้วย “ใบกำกับภาษี” ตามกฎหมาย
        </div>

        <div className="rounded-control border border-card-border bg-white px-3 py-2">
          <div className="text-label text-ink-500">ชื่อหัวเอกสาร</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-body">
            <span className="text-ink-600">{currentLabel}</span>
            <span aria-hidden="true" className="text-ink-300">
              →
            </span>
            <span className="font-semibold text-ink-900">{nextLabel}</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="invoice-print-title-reason"
            className="mb-1 block text-label font-medium text-ink-600"
          >
            เหตุผลในการเปลี่ยน <span className="text-danger">*</span>
          </label>
          <textarea
            id="invoice-print-title-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            maxLength={300}
            placeholder="เช่น ต้องการให้หัวเอกสารตรงกับรูปแบบที่ลูกค้ากำหนด"
            className="w-full rounded-control border border-card-border bg-white px-3 py-2 text-body text-ink-900 placeholder:text-ink-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-1 text-label text-ink-400">
            อย่างน้อย 5 ตัวอักษร และจะถูกบันทึกในประวัติการแก้ไข
          </div>
        </div>

        <Input
          id="invoice-print-title-confirm"
          label="พิมพ์ “ยืนยัน” เพื่อยืนยัน"
          value={confirmWord}
          onChange={(event) => onConfirmWordChange(event.target.value)}
          placeholder="ยืนยัน"
          autoComplete="off"
        />

        <div className="flex flex-col-reverse gap-2 border-t border-card-border pt-3 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
            className="justify-center"
          >
            ยกเลิก
          </Button>
          <Button
            onClick={onConfirm}
            loading={saving}
            disabled={!canConfirm}
            className="justify-center"
          >
            ยืนยันการบันทึก
          </Button>
        </div>
      </div>
    </Modal>
  );
}
