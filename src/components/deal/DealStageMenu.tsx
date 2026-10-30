import { useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal } from "lucide-react";
import { MANUAL_STAGES, MANUAL_STAGE_LABELS } from "../../lib/dealStages";

export interface DealStageMenuProps {
  value: string | null;
  busy?: boolean;
  canEdit?: boolean;
  onChange: (value: string | null) => void;
}

export function DealStageMenu({
  value,
  busy = false,
  canEdit = false,
  onChange,
}: DealStageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!canEdit) return null;

  const itemClass =
    "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-label text-ink-700 transition-colors hover:bg-paper-field disabled:opacity-50";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ตัวเลือกสถานะงานขาย"
        title="ตัวเลือกสถานะงานขาย"
        className="flex h-11 w-11 items-center justify-center rounded-control text-ink-400 transition-colors hover:bg-paper-field hover:text-ink-700 disabled:opacity-50 md:h-6 md:w-6"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="สถานะบนหน้าหลัก"
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-white p-1 shadow-overlay"
        >
          <div className="px-2 py-1.5 text-label font-semibold text-ink-500">สถานะบนหน้าหลัก</div>
          <p className="px-2 pb-1 text-label leading-4 text-ink-400">
            ใช้เมื่อสถานะอัตโนมัติไม่ตรงกับความจริง
          </p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!value}
            disabled={busy}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={itemClass}
          >
            <span className="flex-1">อัตโนมัติ</span>
            {!value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </button>
          {MANUAL_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              role="menuitemradio"
              aria-checked={value === stage}
              disabled={busy}
              onClick={() => {
                onChange(stage);
                setOpen(false);
              }}
              className={itemClass}
            >
              <span className="flex-1">{MANUAL_STAGE_LABELS[stage]}</span>
              {value === stage ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
