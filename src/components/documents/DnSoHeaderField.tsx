import { useId, useState } from "react";
import { Switch } from "../ui/Switch";

interface DnSoHeaderFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * SO-group display mode for delivery notes (opt-in special case, section 3).
 * Off (default) = today's flat numbering, byte-identical output. On = a
 * free-text SO line prints verbatim as group "1." above the lines
 * (children 1.1, 1.2…, Classic V2), and tax invoices billed from the DN
 * freeze a copy under their DN group header. Turning the mode off clears
 * the text so "off" can never carry a stale header.
 */
export function DnSoHeaderField({ value, onChange }: DnSoHeaderFieldProps) {
  const inputId = useId();
  const [enabled, setEnabled] = useState(() => value.trim() !== "");

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) onChange("");
  };

  return (
    <div className="rounded-lg border border-dashed border-card-border bg-paper-soft/60 px-3 py-2">
      <Switch
        checked={enabled}
        onChange={handleToggle}
        label={
          <>
            จัดกลุ่มด้วยบรรทัดอ้างอิง SO ของลูกค้า{" "}
            <span className="font-normal text-gray-400">(เฉพาะกิจ — ปิดไว้ตามปกติ)</span>
          </>
        }
      />
      {enabled && (
        <div className="mt-2">
          <label htmlFor={inputId} className="sr-only">
            บรรทัดอ้างอิง SO ของลูกค้า
          </label>
          <input
            id={inputId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="เช่น SO7944758301/Z033248905 Part no.25120021 (เห็ด)"
            className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <p className="mt-1 text-[11px] leading-4 text-gray-400">
            จะพิมพ์เป็นหัวข้อ “1.” เหนือรายการในใบส่งของ (Classic V2) และติดไปกับใบกำกับภาษีที่ออกต่อจากใบนี้
          </p>
        </div>
      )}
    </div>
  );
}
