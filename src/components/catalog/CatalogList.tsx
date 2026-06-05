import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CatalogSearch } from "./CatalogSearch";
import { CatalogTypeTabs } from "./CatalogTypeTabs";
import { ItemCard } from "./ItemCard";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import type { Item } from "../../types";

type TabKey = "all" | "product" | "service";

interface Props {
  items: Item[];
  loading: boolean;
  onAdd: () => void;
}

export function CatalogList({ items, loading, onAdd }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const filtered = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (activeTab !== "all") {
      result = result.filter((i) => i.item_type === activeTab);
    }
    return result;
  }, [items, search, activeTab]);

  const products = useMemo(
    () => filtered.filter((i) => i.item_type === "product"),
    [filtered],
  );
  const services = useMemo(
    () => filtered.filter((i) => i.item_type === "service"),
    [filtered],
  );
  const isFiltering = search.trim() !== "" || activeTab !== "all";

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
        <div className="flex gap-4">
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white border border-[#E8E6DF] rounded-[10px] p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <CatalogSearch value={search} onChange={setSearch} />
        </div>
        <Button onClick={onAdd} size="sm" className="!rounded-lg shrink-0">
          + เพิ่ม
        </Button>
      </div>

      <CatalogTypeTabs activeTab={activeTab} onChange={setActiveTab} />

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            title="ยังไม่มีสินค้าหรือบริการ"
            description="เพิ่มรายการแรกเพื่อเริ่มต้น"
            action={
              <Button onClick={onAdd}>+ เพิ่มสินค้า / บริการ</Button>
            }
          />
        ) : (
          <EmptyState
            title={`ไม่พบ "${search}"`}
            description="ลองค้นหาด้วยคำอื่น"
          />
        )
      ) : isFiltering ? (
        <div className="space-y-2">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onTap={(it) => navigate(`/catalog/${it.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {products.length > 0 && (
            <div>
              <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                สินค้า
              </div>
              <div className="space-y-2">
                {products.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onTap={(it) => navigate(`/catalog/${it.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
          {services.length > 0 && (
            <div>
              <div className="text-[11px] uppercase font-semibold text-[#888780] py-2">
                บริการ
              </div>
              <div className="space-y-2">
                {services.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onTap={(it) => navigate(`/catalog/${it.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
