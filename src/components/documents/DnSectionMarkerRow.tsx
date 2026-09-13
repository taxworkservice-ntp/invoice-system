import { Trash2 } from "lucide-react";
import { Input } from "../ui/Input";

interface DnSectionMarkerRowProps {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}

/**
 * Compact editor for a DN section-header (grouping) line. A marker carries
 * no quantity or price — it only prints its text as a group header above
 * the following lines on the Classic V2 delivery note.
 */
export function DnSectionMarkerRow({ value, onChange, onRemove }: DnSectionMarkerRowProps) {
  return (
    <div className="rounded-xl border border-dashed border-card-border bg-paper-soft/60 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Input
            label="หัวข้อกลุ่ม / SECTION"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="SO7944758301/Z033248905 Part no.25120021 (เห็ด)"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-card-border text-gray-400 transition-colors hover:border-red-300 hover:text-red-600"
          title="ลบหัวข้อกลุ่มนี้"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-gray-400">
        บรรทัดนี้ไม่คิดมูลค่า — จะพิมพ์เป็นหัวข้อกลุ่มเหนือรายการในใบส่งของ (Classic V2) และติดไปกับใบกำกับภาษีที่ออกต่อจากใบนี้
      </p>
    </div>
  );
}
