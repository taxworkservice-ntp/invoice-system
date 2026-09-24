import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Input } from "../ui/Input";

interface LineMoveButtonsProps {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  className?: string;
}

/** Compact up/down reorder control shared by DN item and heading rows. */
export function LineMoveButtons({
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  className,
}: LineMoveButtonsProps) {
  return (
    <div className={`flex shrink-0 flex-col overflow-hidden rounded-control border border-card-border ${className ?? ""}`}>
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        aria-label="เลื่อนขึ้น"
        title="เลื่อนขึ้น"
        className="flex h-7 w-9 items-center justify-center text-ink-400 transition-colors hover:bg-paper-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-400 md:h-4 md:w-7"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        aria-label="เลื่อนลง"
        title="เลื่อนลง"
        className="-mt-px flex h-7 w-9 items-center justify-center border-t border-card-border text-ink-400 transition-colors hover:bg-paper-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-400 md:h-4 md:w-7"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface DnSectionMarkerRowProps {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Heading has no item lines under it — it will be omitted from the printout. */
  warnEmpty?: boolean;
  /** Printed section number (e.g. "1") — shown as a chip when provided. */
  sectionNumber?: string;
  /** Named item lines under this heading — shown as "N รายการ". */
  itemCount?: number;
  /** When provided, renders "เพิ่มรายการในกลุ่มนี้" (insert at section end). */
  onAddItem?: () => void;
}

/**
 * Compact editor for a DN section-header (grouping) line. A marker carries
 * no quantity or price — it only prints its text as a group header above
 * the following lines on the Classic V2 delivery note.
 */
export function DnSectionMarkerRow({
  value,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  warnEmpty,
  sectionNumber,
  itemCount,
  onAddItem,
}: DnSectionMarkerRowProps) {
  // A blank heading is not a section yet (no number, no printout), so it needs
  // its own prompt rather than the "no children" warning.
  const isBlank = !value.trim();
  const warning = isBlank
    ? "ยังไม่ได้กรอกข้อความหัวข้อกลุ่ม — กรอกข้อความเพื่อให้หัวข้อแสดงบนใบส่งของ"
    : warnEmpty
      ? "หัวข้อนี้ยังไม่มีรายการอยู่ข้างใต้ — จะไม่แสดงบนใบส่งของจนกว่าจะมีรายการ"
      : null;
  return (
    <div className={`rounded-card border border-dashed p-3 ${warning ? "border-amber-300 bg-amber-50/60" : "border-card-border bg-paper-soft/60"}`}>
      <div className="flex items-start gap-2">
        {sectionNumber ? (
          <span className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold text-primary">
            {sectionNumber}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <Input
            label="หัวข้อกลุ่ม / SECTION"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="SO7944758301/Z033248905 Part no.25120021 (เห็ด)"
          />
        </div>
        <LineMoveButtons
          className="mt-5"
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
        <button
          type="button"
          onClick={onRemove}
          className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-card-border text-ink-400 transition-colors hover:border-red-300 hover:text-red-600"
          title="ลบหัวข้อกลุ่มนี้"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {warning ? (
        <p className="mt-1 text-label leading-4 font-medium text-amber-700">{warning}</p>
      ) : (
        <p className="mt-1 text-label leading-4 text-ink-400">
          บรรทัดนี้ไม่คิดมูลค่า — จะพิมพ์เป็นหัวข้อกลุ่มเหนือรายการในใบส่งของ และติดไปกับใบกำกับภาษีที่ออกต่อจากใบนี้
          {itemCount != null && itemCount > 0 ? ` · กลุ่มนี้มี ${itemCount} รายการแล้ว` : ""}
        </p>
      )}
      {onAddItem ? (
        <button
          type="button"
          onClick={onAddItem}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-control border border-dashed border-card-border bg-white px-2 py-1.5 text-label font-medium text-ink-600 transition-colors hover:border-primary hover:text-primary-deep"
        >
          <Plus className="h-3.5 w-3.5" />
          เพิ่มรายการในกลุ่มนี้
        </button>
      ) : null}
    </div>
  );
}
