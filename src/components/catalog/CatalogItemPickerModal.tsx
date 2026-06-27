import { useEffect, useMemo, useState } from "react";
import { Package, Search, Star, Wrench } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { formatCurrency } from "../../lib/format";
import { formatMixedStock } from "../../lib/stock";
import type { Item } from "../../types";

interface CatalogItemPickerModalProps {
  open: boolean;
  items: Item[];
  onSelect: (item: Item) => void;
  onClose: () => void;
  initialSearch?: string;
}

function itemSearchText(item: Item) {
  return [item.name, item.sku || "", item.base_unit, item.carton_unit || ""].join(" ").toLowerCase();
}

export function CatalogItemPickerModal({ open, items, onSelect, onClose, initialSearch = "" }: CatalogItemPickerModalProps) {
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    if (open) setSearch(initialSearch);
  }, [initialSearch, open]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name, "th")),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedItems;
    return sortedItems.filter((item) => itemSearchText(item).includes(query));
  }, [search, sortedItems]);

  return (
    <Modal open={open} onClose={onClose} title="เลือกรายการ" className="md:max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="ค้นหาชื่อรายการ SKU หรือหน่วย"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </div>

        <div className="max-h-[58vh] overflow-y-auto rounded-xl border border-card-border">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">ไม่พบรายการที่ตรงกับคำค้น</div>
          ) : (
            <div className="divide-y divide-card-border">
              {filteredItems.map((item) => {
                const Icon = item.item_type === "service" ? Wrench : Package;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className="w-full bg-white px-3 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3F0E8] text-[#5F5A52]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-sm font-semibold text-[#1A1A18]">{item.name}</span>
                          {item.is_favorite && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          {item.sku && <span>SKU {item.sku}</span>}
                          <span>{item.item_type === "service" ? "บริการ" : "สินค้า"}</span>
                          <span>หน่วย {item.base_unit}</span>
                          {item.item_type === "product" && (
                            <span>
                              คงเหลือ {formatMixedStock(item.stock_count, item.base_unit, item.carton_unit, item.qty_per_carton)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold text-[#1A1A18]">
                        ฿{formatCurrency(item.unit_price)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
