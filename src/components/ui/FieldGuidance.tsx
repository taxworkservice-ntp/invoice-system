import { useState } from "react";
import { CircleHelp } from "lucide-react";

interface FieldGuidanceItem {
  label: string;
  description: string;
}

interface FieldGuidanceProps {
  title: string;
  items: FieldGuidanceItem[];
  tip?: string;
}

export function FieldGuidance({ title, items, tip }: FieldGuidanceProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const visible = open || hovered;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <label className="block text-xs font-medium text-gray-600">
          {title}
        </label>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="คำแนะนำการกรอกยอด"
          className="text-gray-400 hover:text-[#378ADD] transition-colors cursor-help"
        >
          <CircleHelp size={14} className="shrink-0" />
        </button>
      </div>
      {visible && (
        <div className="mb-1 rounded-lg border border-[#DCE7F7] bg-[#F3F8FF] px-3 py-2.5">
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.label} className="text-xs leading-5">
                <span className="font-medium text-[#1A1A18]">{item.label}</span>
                <span className="text-gray-600"> — {item.description}</span>
              </div>
            ))}
          </div>
          {tip && (
            <p className="mt-2 border-t border-[#DCE7F7] pt-1.5 text-[11px] leading-5 text-[#378ADD]">
              {tip}
            </p>
          )}
        </div>
      )}
    </div>
  );
}