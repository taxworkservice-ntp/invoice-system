import { useEffect, useRef, useState } from "react";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import type { SavedDocumentView } from "../../lib/savedDocumentViews";

interface SavedViewsMenuProps {
  views: SavedDocumentView[];
  onApply: (view: SavedDocumentView) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

/** Saved filter views: apply, save the current filter set, delete. */
export function SavedViewsMenu({ views, onApply, onSave, onDelete }: SavedViewsMenuProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name);
    setName("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bookmark className="h-4 w-4" />
        มุมมอง
        {views.length > 0 && <span className="ml-1 text-ink-300">({views.length})</span>}
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-72 rounded-control border border-card-border bg-white p-2"
        >
          {views.length > 0 ? (
            <ul className="mb-2 max-h-56 space-y-0.5 overflow-y-auto">
              {views.map((view) => (
                <li key={view.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onApply(view);
                      setOpen(false);
                    }}
                    className="flex-1 truncate rounded-control px-2 py-1.5 text-left text-body text-ink-700 hover:bg-paper-field"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`ลบมุมมอง ${view.name}`}
                    onClick={() => onDelete(view.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-400 hover:bg-red-50 hover:text-red-600 md:h-7 md:w-7"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 px-2 py-1 text-label text-ink-400">ยังไม่มีมุมมองที่บันทึกไว้</p>
          )}

          <div className="flex items-center gap-1.5 border-t border-line-faint pt-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSave();
              }}
              placeholder="ตั้งชื่อมุมมองนี้"
              className="min-w-0 flex-1 rounded-control border border-card-border px-2 py-1.5 text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="button" size="sm" onClick={handleSave} disabled={!name.trim()}>
              <Plus className="h-3.5 w-3.5" />
              บันทึก
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
