import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { useStockMovements } from "../../../hooks/useItems";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { StockStatusCard } from "../../../components/catalog/StockStatusCard";
import { StockHistory } from "../../../components/catalog/StockHistory";
import { StockInModal } from "../../../components/catalog/StockInModal";
import { StockOutModal } from "../../../components/catalog/StockOutModal";
import { ItemDetailsCard } from "../../../components/catalog/ItemDetailsCard";
import { formatCurrency } from "../../../lib/format";
import { manualStockIn, manualStockOut } from "../../../lib/stock";
import type { Item } from "../../../types";

export default function CatalogItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const {
    movements,
    loading: movLoading,
    refetch: refetchMovements,
  } = useStockMovements(id);

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stockModal, setStockModal] = useState<"in" | "out" | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else if (data) setItem(data as Item);
        setLoading(false);
      });
  }, [id]);

  function reloadItem() {
    if (!id) return;
    supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) setItem(data as Item);
      });
  }

  async function handleStockIn(qtyBase: number, reason: string) {
    if (!item || !profile) return;
    try {
      await manualStockIn(item.id, profile.id, qtyBase, reason || undefined);
      toast.success(`รับสินค้าเข้าแล้ว +${qtyBase} ${item.base_unit}`);
      setStockModal(null);
      reloadItem();
      refetchMovements();
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  }

  async function handleStockOut(qtyBase: number, reason: string) {
    if (!item || !profile) return;
    try {
      await manualStockOut(item.id, profile.id, qtyBase, reason || undefined);
      toast.success(`ตัดสต็อกแล้ว -${qtyBase} ${item.base_unit}`);
      setStockModal(null);
      reloadItem();
      refetchMovements();
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  }

  if (loading)
    return (
      <AppShell title="" showBack>
        <Spinner />
      </AppShell>
    );
  if (error || !item)
    return (
      <AppShell title="ไม่พบสินค้า" showBack>
        <p className="text-sm text-gray-500">ไม่พบข้อมูลสินค้า</p>
      </AppShell>
    );

  const hasCarton = !!(
    item.carton_unit &&
    item.qty_per_carton &&
    item.qty_per_carton > 0
  );

  return (
    <AppShell
      title={item.name}
      showBack
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/catalog/${item.id}/edit`)}
        >
          แก้ไข
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[18px] font-bold text-[#1A1A18]">
                {item.name}
              </h2>
              <p className="text-[15px] text-[#444441] mt-1">
                ฿ {formatCurrency(item.unit_price)} / {item.base_unit}
              </p>
              {hasCarton && (
                <p className="text-[13px] text-[#888780]">
                  ฿{" "}
                  {formatCurrency(item.unit_price * item.qty_per_carton!)}{" "}
                  / {item.carton_unit}
                </p>
              )}
            </div>
            <span
              className={`inline-flex px-2 py-1 rounded text-[10px] font-medium shrink-0 ${
                item.item_type === "product"
                  ? "bg-[#E6F1FB] text-[#0C447C]"
                  : "bg-[#F1EFE8] text-[#888780]"
              }`}
            >
              {item.item_type === "product" ? "สินค้า" : "บริการ"}
            </span>
          </div>
        </div>

        {item.item_type === "product" && (
          <>
            <StockStatusCard
              item={item}
              onStockIn={() => setStockModal("in")}
              onStockOut={() => setStockModal("out")}
            />
            <StockHistory
              movements={movements}
              loading={movLoading}
              item={item}
            />
          </>
        )}

        <ItemDetailsCard item={item} />

        <StockInModal
          item={item}
          isOpen={stockModal === "in"}
          onConfirm={handleStockIn}
          onDismiss={() => setStockModal(null)}
        />
        <StockOutModal
          item={item}
          isOpen={stockModal === "out"}
          onConfirm={handleStockOut}
          onDismiss={() => setStockModal(null)}
        />
      </div>
    </AppShell>
  );
}
