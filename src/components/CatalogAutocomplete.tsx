import { useState, useRef, useEffect, useCallback } from "react";
import { Check, Package, Wrench } from "lucide-react";
import type { Item } from "../types";

interface CatalogAutocompleteProps {
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: Item) => void;
  matched?: boolean;
  placeholder?: string;
  className?: string;
}

export function CatalogAutocomplete({
  items,
  value,
  onChange,
  onSelect,
  matched = false,
  placeholder = "ชื่อรายการ",
  className = "",
}: CatalogAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = value.trim()
    ? items.filter((item) =>
        item.name.toLowerCase().includes(value.trim().toLowerCase()) ||
        item.sku?.toLowerCase().includes(value.trim().toLowerCase()),
      )
    : items.slice(0, 8);

  const sliced = filtered.slice(0, 20);

  const close = useCallback(() => {
    setOpen(false);
    setHighlightIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !listRef.current || highlightIndex < 0) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        if (e.key === "Enter") setHighlightIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < sliced.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : sliced.length - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && sliced[highlightIndex]) {
        onSelect(sliced[highlightIndex]);
        close();
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <div className={`relative flex-1 ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          className={`w-full py-1.5 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary ${matched ? "pr-7 pl-2" : "px-2"}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            setOpen(true);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {matched && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
            <Check size={14} />
          </span>
        )}
      </div>

      {open && sliced.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {sliced.map((item, index) => (
            <li
              key={item.id}
              className={`flex items-center gap-2 cursor-pointer px-3 py-2 text-sm transition-colors ${
                index === highlightIndex
                  ? "bg-primary/10 text-primary"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
                close();
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <span className="shrink-0 text-gray-400">
                {item.item_type === "service" ? (
                  <Wrench size={12} />
                ) : (
                  <Package size={12} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.name}</div>
                {item.sku && (
                  <div className="text-[10px] uppercase tracking-[0.08em] text-gray-400">
                    {item.sku}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                ฿{item.unit_price.toLocaleString()}
              </span>
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {item.item_type === "service" ? "บริการ" : "สินค้า"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
