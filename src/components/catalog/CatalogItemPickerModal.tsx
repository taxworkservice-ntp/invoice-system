import { useEffect, useMemo, useState } from "react";
import { Package, Plus, Search, Star, Wrench } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
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
  createItemType?: "product" | "service";
  createDefaultUnit?: string;
  onCreate?: (input: {
    name: string;
    unit_price: number;
    base_unit: string;
    item_type: "product" | "service";
    has_job_details?: boolean;
  }) => Promise<Item>;
}

function itemSearchText(item: Item) {
  return [item.name, item.sku || "", item.base_unit, item.carton_unit || ""].join(" ").toLowerCase();
}

export function CatalogItemPickerModal({
  open,
  items,
  onSelect,
  onClose,
  initialSearch = "",
  createItemType = "product",
  createDefaultUnit = "ชิ้น",
  onCreate,
}: CatalogItemPickerModalProps) {
  const [search, setSearch] = useState(initialSearch);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    unit_price: "",
    base_unit: createDefaultUnit,
  });

  useEffect(() => {
    if (open) setSearch(initialSearch);
  }, [initialSearch, open]);

  useEffect(() => {
    if (!open) {
      setAdding(false);
      setNewItem({ name: "", unit_price: "", base_unit: createDefaultUnit });
    }
  }, [createDefaultUnit, open]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name, "th")),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedItems;
    return sortedItems.filter((item) => itemSearchText(item).includes(query));
  }, [search, sortedItems]);

  const handleCreate = async () => {
    if (!onCreate) return;
    const name = newItem.name.trim();
    const price = parseFloat(newItem.unit_price);
    if (!name || isNaN(price) || price < 0) return;
    setSaving(true);
    try {
      const created = await onCreate({
        name,
        unit_price: price,
        base_unit: newItem.base_unit.trim() || createDefaultUnit,
        item_type: createItemType,
      });
      setNewItem({ name: "", unit_price: "", base_unit: createDefaultUnit });
      setAdding(false);
      setSearch("");
      onSelect(created);
      onClose();
    } finally {
      setSaving(false);
    }
  };

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

        {adding ? (
          <div className="rounded-xl border border-card-border bg-[#FAF8F3] p-3">
            <div className="mb-3 text-sm font-medium text-[#1A1A18]">เพิ่มรายการใหม่</div>
            <div className="space-y-2">
              <Input
                label="ชื่อรายการ"
                value={newItem.name}
                onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
                autoFocus
              />
              <div className="flex gap-2">
                <label className="flex-1 block">
                  <span className="block text-[13px] text-[#1A1A18] mb-1">ราคาต่อหน่วย</span>
                  <div className="flex items-center gap-1 border border-card-border rounded-lg bg-white px-2">
                    <span className="text-[15px] text-[#1A1A18]">฿</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newItem.unit_price}
                      onChange={(event) => setNewItem((prev) => ({ ...prev, unit_price: event.target.value }))}
                      placeholder="0.00"
                      className="flex-1 py-2 text-sm focus:outline-none bg-transparent"
                    />
                  </div>
                </label>
                <label className="w-28 block">
                  <span className="block text-[13px] text-[#1A1A18] mb-1">หน่วย</span>
                  <input
                    type="text"
                    value={newItem.base_unit}
                    onChange={(event) => setNewItem((prev) => ({ ...prev, base_unit: event.target.value }))}
                    placeholder="ชิ้น"
                    className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>ยกเลิก</Button>
                <Button
                  size="sm"
                  disabled={!newItem.name.trim() || newItem.unit_price === "" || isNaN(parseFloat(newItem.unit_price)) || saving}
                  loading={saving}
                  onClick={handleCreate}
                >
                  บันทึกและเลือก
                </Button>
              </div>
            </div>
          </div>
        ) : onCreate ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setNewItem((prev) => ({ ...prev, name: search.trim() || prev.name }));
              setAdding(true);
            }}
          >
            <Plus className="h-4 w-4" />
            เพิ่มรายการใหม่
          </Button>
        ) : null}

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
