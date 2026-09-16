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

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 mb-1">
        <label className="block text-label font-medium text-ink-600">
          {title}
        </label>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="คำแนะนำการกรอกยอด"
          className="text-ink-400 hover:text-primary transition-colors cursor-help"
        >
          <CircleHelp size={14} className="shrink-0" />
        </button>
      </div>
      {open && (
        <div className="mb-1 rounded-control border border-primary-soft bg-primary-soft px-3 py-2.5">
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.label} className="text-label leading-5">
                <span className="font-medium text-ink-900">{item.label}</span>
                <span className="text-ink-600"> — {item.description}</span>
              </div>
            ))}
          </div>
          {tip && (
            <p className="mt-2 border-t border-primary-soft pt-1.5 text-label leading-5 text-primary">
              {tip}
            </p>
          )}
        </div>
      )}
    </div>
  );
}