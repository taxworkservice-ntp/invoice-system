import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { useStockMovements } from "../../../hooks/useItems";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { Modal } from "../../../components/ui/Modal";
import { StockStatusCard } from "../../../components/catalog/StockStatusCard";
import { StockHistory } from "../../../components/catalog/StockHistory";
import { StockInModal } from "../../../components/catalog/StockInModal";
import { StockOutModal } from "../../../components/catalog/StockOutModal";
import { CorrectionModal } from "../../../components/catalog/CorrectionModal";
import { ItemDetailsCard } from "../../../components/catalog/ItemDetailsCard";
import { formatCurrency } from "../../../lib/format";
import {
  formatMixedStock,
  manualStockIn,
  manualStockOut,
  revertManualStockIn,
  revertManualStockOut,
  correctManualStockIn,
  correctManualStockOut,
} from "../../../lib/stock";
import { formatBuddhistDate } from "../../../lib/dates";
import { getWorkspacePermissions } from "../../../lib/permissions";
import type { Item, StockMovement } from "../../../types";

export default function CatalogItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
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
  const [revertTarget, setRevertTarget] = useState<StockMovement | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);
  const [prefillQty, setPrefillQty] = useState<number | undefined>(undefined);
  const [prefillUseCarton, setPrefillUseCarton] = useState<boolean | undefined>(
    undefined,
  );
  const [correctTarget, setCorrectTarget] = useState<StockMovement | null>(null);

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

  async function handleStockIn(qtyBase: number, unitCost: number, reason: string) {
    if (!item || !profile) return;
    if (!permissions.canManageCatalog) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    try {
      await manualStockIn(item.id, profile.id, qtyBase, unitCost, reason || undefined);
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
    if (!permissions.canManageCatalog) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
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

  async function handleConfirmRevert() {
    if (!revertTarget || !profile) return;
    if (!permissions.canManageCatalog) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    const isIn = revertTarget.movement_type === "manual_in";
    setReverting(true);
    try {
      const result = isIn
        ? await revertManualStockIn(
            revertTarget.id,
            profile.id,
            revertReason.trim() || (isIn ? "ยกเลิกรายการรับสินค้าเข้า" : "ยกเลิกรายการตัดสต็อก"),
          )
        : await revertManualStockOut(
            revertTarget.id,
            profile.id,
            revertReason.trim() || "ยกเลิกรายการตัดสต็อก",
          );
      if (!result.ok) {
        if (result.reason === "insufficient_stock" && item) {
          toast.error(
            `ไม่สามารถยกเลิกได้ — ปัจจุบันเหลือ ${result.currentStock} ${item.base_unit} แต่รายการเดิมต้องการ ${result.requiredQty} ${item.base_unit}`,
          );
        } else if (result.reason === "already_reverted") {
          toast.error("รายการนี้ถูกยกเลิกไปแล้ว");
        } else if (result.reason === "not_manual_in" || result.reason === "not_manual_out") {
          toast.error("สามารถยกเลิกได้เฉพาะรายการรับเข้า/ตัดสต็อกเท่านั้น");
        } else {
          toast.error("ไม่พบรายการที่ต้องการยกเลิก");
        }
        setReverting(false);
        return;
      }
      toast.success(isIn
        ? "ยกเลิกรายการแล้ว — กรุณากรอกต้นทุนที่ถูกต้อง"
        : "ยกเลิกรายการตัดสต็อกแล้ว");
      setRevertTarget(null);
      setRevertReason("");
      reloadItem();
      refetchMovements();
      if (isIn) {
        setPrefillQty(result.prefillQty);
        const usedCarton =
          hasCarton &&
          revertTarget.qty_carton != null &&
          Number(revertTarget.qty_carton) > 0;
        setPrefillUseCarton(usedCarton);
        setStockModal("in");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setReverting(false);
    }
  }

  async function handleCorrect(qtyBase: number, unitCost: number, reasonNote: string) {
    if (!correctTarget || !profile || !item) return;
    if (!permissions.canManageCatalog) {
      toast.error("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }
    const isIn = correctTarget.movement_type === "manual_in";
    try {
      const result = isIn
        ? await correctManualStockIn(correctTarget.id, profile.id, qtyBase, unitCost, reasonNote || undefined)
        : await correctManualStockOut(correctTarget.id, profile.id, qtyBase, reasonNote || undefined);
      if (!result.ok) {
        if (result.reason === "insufficient_stock") {
          toast.error(`ไม่สามารถแก้ไขได้ — สต็อกคงเหลือไม่พอ (มี ${result.currentStock} ${item.base_unit})`);
        } else if (result.reason === "already_reverted") {
          toast.error("รายการนี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้");
        } else {
          toast.error("ไม่พบรายการที่ต้องการแก้ไข");
        }
        return;
      }
      toast.success("แก้ไขรายการเรียบร้อย");
      setCorrectTarget(null);
      reloadItem();
      refetchMovements();
    } catch (err: any) {
      toast.error(err.message);
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
      action={permissions.canManageCatalog ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/catalog/${item.id}/edit`)}
        >
          แก้ไข
        </Button>
      ) : undefined}
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
              onStockIn={permissions.canManageCatalog ? () => setStockModal("in") : undefined}
              onStockOut={permissions.canManageCatalog ? () => setStockModal("out") : undefined}
            />
            <StockHistory
              movements={movements}
              loading={movLoading}
              item={item}
              onRevert={permissions.canManageCatalog ? (m) => {
                setRevertTarget(m);
                setRevertReason("");
              } : undefined}
              onEdit={permissions.canManageCatalog ? (m) => setCorrectTarget(m) : undefined}
            />
          </>
        )}

        <ItemDetailsCard item={item} />

        <StockInModal
          item={item}
          isOpen={stockModal === "in"}
          onConfirm={handleStockIn}
          onDismiss={() => {
            setStockModal(null);
            setPrefillQty(undefined);
            setPrefillUseCarton(undefined);
          }}
          initialQty={prefillQty}
          initialUseCarton={prefillUseCarton}
        />
        <StockOutModal
          item={item}
          isOpen={stockModal === "out"}
          onConfirm={handleStockOut}
          onDismiss={() => setStockModal(null)}
        />

        {correctTarget && (
          <CorrectionModal
            item={item}
            movement={correctTarget}
            isOpen={!!correctTarget}
            onConfirm={handleCorrect}
            onDismiss={() => setCorrectTarget(null)}
          />
        )}

        <Modal
          open={!!revertTarget}
          onClose={() => {
            if (!reverting) {
              setRevertTarget(null);
              setRevertReason("");
            }
          }}
          title={revertTarget?.movement_type === "manual_in" ? "ยกเลิกรายการรับสินค้าเข้า" : "ยกเลิกรายการตัดสต็อก"}
        >
          {revertTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E8E6DF] bg-[#FAFAF8] p-3 text-[13px] space-y-1">
                <div className="font-medium text-[#1A1A18]">รายการเดิม</div>
                <div className="text-[#444441]">
                  วันที่: {formatBuddhistDate(revertTarget.created_at)}
                </div>
                <div className="text-[#444441]">
                  จำนวน: {revertTarget.movement_type === "manual_in" ? "+" : "-"}
                  {formatMixedStock(
                    Math.abs(Number(revertTarget.qty_base)),
                    item.base_unit,
                    item.carton_unit,
                    item.qty_per_carton,
                  )}
                </div>
                {revertTarget.unit_cost != null && (
                  <div className="text-[#444441]">
                    ต้นทุน/หน่วย: ฿
                    {formatCurrency(Number(revertTarget.unit_cost))}
                  </div>
                )}
                {revertTarget.movement_value != null && (
                  <div className="text-[#444441]">
                    มูลค่า: ฿
                    {formatCurrency(Number(revertTarget.movement_value))}
                  </div>
                )}
                {revertTarget.reason && (
                  <div className="text-[#888780] italic">
                    เหตุผลเดิม: {revertTarget.reason}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
                {revertTarget.movement_type === "manual_in"
                  ? "การยกเลิกจะตัดสต็อกออกตามจำนวนเดิม และคืนค่า avg_cost และ stock_value ให้เป็นเหมือนก่อนรับเข้ารายการนี้"
                  : "การยกเลิกจะคืนสต็อกกลับตามจำนวนเดิม และปรับค่า avg_cost และ stock_value กลับเป็นก่อนตัด"}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#1A1A18] mb-1">
                  เหตุผลในการยกเลิก
                </label>
                <input
                  type="text"
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder={revertTarget.movement_type === "manual_in" ? "เช่น กรอกทุนผิด, จำนวนผิด" : "เช่น ตัดผิดรายการ, จำนวนผิด"}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRevertTarget(null);
                    setRevertReason("");
                  }}
                  disabled={reverting}
                  className="flex-1"
                >
                  ยกเลิก
                </Button>
                <Button
                  onClick={handleConfirmRevert}
                  loading={reverting}
                  disabled={reverting}
                  className="flex-1 !bg-[#C0392B] hover:!bg-[#9C2E25] !text-white"
                >
                  ยืนยันยกเลิกรายการ
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </AppShell>
  );
}
