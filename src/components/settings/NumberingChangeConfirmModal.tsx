import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { NumberingChange } from "../../lib/numberingDiff";

export interface NumberingChangeConfirmModalProps {
  open: boolean;
  changes: NumberingChange[];
  reason: string;
  confirmWord: string;
  saving: boolean;
  onReasonChange: (value: string) => void;
  onConfirmWordChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function NumberingChangeConfirmModal({
  open,
  changes,
  reason,
  confirmWord,
  saving,
  onReasonChange,
  onConfirmWordChange,
  onCancel,
  onConfirm,
}: NumberingChangeConfirmModalProps) {
  const canConfirm = reason.trim().length >= 5 && confirmWord.trim() === "ยืนยัน" && !saving;

  return (
    <Modal open={open} onClose={onCancel} title="ยืนยันการเปลี่ยนเลขที่เอกสาร" size="lg">
      <div className="space-y-4">
        <div className="rounded-control border border-warning-border bg-warning-soft px-3 py-2.5 text-label leading-5 text-warning-text">
          การเปลี่ยนเลขที่เอกสารมีผลกับเอกสารใหม่เท่านั้น — เอกสารที่ออกแล้วจะไม่ถูกเปลี่ยนเลข
          และไม่มีการออกเลขซ้ำให้
        </div>

        <div className="space-y-2">
          {changes.map((change) => (
            <div
              key={change.docType}
              className="rounded-control border border-card-border bg-white px-3 py-2"
            >
              <div className="text-body font-medium text-ink-900">{change.label}</div>
              <div className="mt-1 space-y-0.5">
                {change.changes.map((field) => (
                  <div
                    key={field.field}
                    className="flex flex-wrap items-baseline gap-1 text-label text-ink-600"
                  >
                    <span className="text-ink-500">{field.label}:</span>
                    <span className="font-mono text-ink-600">{field.before}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-mono font-medium text-ink-900">{field.after}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <label
            htmlFor="numbering-change-reason"
            className="mb-1 block text-label font-medium text-ink-600"
          >
            เหตุผลในการเปลี่ยน <span className="text-danger">*</span>
          </label>
          <textarea
            id="numbering-change-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            maxLength={300}
            placeholder="เช่น ปรับเลขให้ตรงกับสมุดบัญชีเดิมของร้าน"
            className="w-full rounded-control border border-card-border bg-white px-3 py-2 text-body text-ink-900 placeholder:text-ink-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-1 text-label text-ink-400">
            อย่างน้อย 5 ตัวอักษร และจะถูกบันทึกในประวัติการแก้ไข
          </div>
        </div>

        <div>
          <Input
            id="numbering-change-confirm"
            label="พิมพ์ “ยืนยัน” เพื่อยืนยัน"
            value={confirmWord}
            onChange={(event) => onConfirmWordChange(event.target.value)}
            placeholder="ยืนยัน"
            autoComplete="off"
          />
        </div>

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
