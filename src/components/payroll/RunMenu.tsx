import { useEffect, useRef, useState } from "react";
import { Copy, History, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

interface RunMenuProps {
  draft: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onCreate: () => void;
  onCopy: () => void;
  onReopen: () => void;
}

export function RunMenu({
  draft,
  onEdit,
  onDelete,
  onHistory,
  onCreate,
  onCopy,
  onReopen,
}: RunMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function item(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="ตัวเลือกของรอบจ่าย"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 w-11 items-center justify-center rounded-control border border-card-border bg-white text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 md:h-8 md:w-8"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-control border border-card-border bg-white py-1 shadow-overlay"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => item(onCreate)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-ink-700 hover:bg-paper-field"
          >
            <Plus className="h-4 w-4 text-ink-400" /> สร้างรอบจ่าย
          </button>
          {draft && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => item(onEdit)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-ink-700 hover:bg-paper-field"
              >
                <Pencil className="h-4 w-4 text-ink-400" /> แก้ไขข้อมูลรอบ
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => item(onCopy)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-ink-700 hover:bg-paper-field"
              >
                <Copy className="h-4 w-4 text-ink-400" /> คัดลอกจากรอบก่อนหน้า
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => item(onHistory)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-ink-700 hover:bg-paper-field"
          >
            <History className="h-4 w-4 text-ink-400" /> ประวัติรอบ
          </button>
          {!draft && (
            <button
              type="button"
              role="menuitem"
              onClick={() => item(onReopen)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-ink-700 hover:bg-paper-field"
            >
              <RotateCcw className="h-4 w-4 text-ink-400" /> เปิดรอบมาแก้ไข
            </button>
          )}
          {draft && (
            <>
              <div className="my-1 border-t border-line-faint" />
              <button
                type="button"
                role="menuitem"
                onClick={() => item(onDelete)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-danger hover:bg-danger-soft"
              >
                <Trash2 className="h-4 w-4" /> ลบรอบ
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
