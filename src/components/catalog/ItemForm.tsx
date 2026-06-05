import { useState } from "react";
import { TypeSelector } from "./TypeSelector";
import { UnitSelector } from "./UnitSelector";
import { CartonUnitSection } from "./CartonUnitSection";
import { StockInitialField } from "./StockInitialField";
import { Button } from "../ui/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import type { Item } from "../../types";

interface Props {
  item?: Item | null;
  onSave: (itemId?: string) => void;
  onCancel: () => void;
}

export function ItemForm({ item, onSave, onCancel: _onCancel }: Props) {
  const { profile } = useAuth();
  const toast = useToast();
  const isEdit = !!item;

  const [name, setName] = useState(item?.name || "");
  const [itemType, setItemType] = useState<"product" | "service">(
    item?.item_type || "product",
  );
  const [unitPrice, setUnitPrice] = useState(
    item ? String(item.unit_price) : "",
  );
  const [baseUnit, setBaseUnit] = useState(item?.base_unit || "ชิ้น");
  const [cartonEnabled, setCartonEnabled] = useState(
    !!(item?.carton_unit),
  );
  const [cartonUnit, setCartonUnit] = useState(item?.carton_unit || "");
  const [qtyPerCarton, setQtyPerCarton] = useState(
    item?.qty_per_carton ? String(item.qty_per_carton) : "",
  );
  const [initialStock, setInitialStock] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState(
    item ? String(item.low_stock_threshold) : "5",
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const fieldErrors: Record<string, string> = {};
    if (!name.trim()) {
      fieldErrors.name = "กรุณาใส่ชื่อสินค้าหรือบริการ";
    }
    if (!unitPrice || isNaN(Number(unitPrice)) || Number(unitPrice) < 0) {
      fieldErrors.unitPrice = "กรุณาใส่ราคา";
    }
    if (cartonEnabled) {
      if (!cartonUnit) {
        fieldErrors.cartonUnit = "กรุณาเลือกหน่วยรอง";
      }
      const qty = parseFloat(String(qtyPerCarton));
      if (!qtyPerCarton || isNaN(qty) || qty < 1) {
        fieldErrors.qtyPerCarton = "กรุณาใส่จำนวนต่อหน่วย (อย่างน้อย 1)";
      }
      if (cartonUnit === baseUnit) {
        fieldErrors.cartonUnit = "หน่วยรองต้องไม่เหมือนหน่วยฐาน";
      }
    }
    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || !profile) return;
    setSaving(true);

    const price = parseFloat(unitPrice);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      item_type: itemType,
      unit_price: isNaN(price) ? 0 : price,
      base_unit: baseUnit || "ชิ้น",
      carton_unit:
        cartonEnabled && itemType === "product" ? cartonUnit : null,
      qty_per_carton:
        cartonEnabled && itemType === "product" && qtyPerCarton
          ? parseFloat(String(qtyPerCarton))
          : null,
      low_stock_threshold: parseFloat(lowStockThreshold) || 0,
    };

    try {
      if (isEdit) {
        const { error } = await supabase
          .from("items")
          .update(payload)
          .eq("id", item!.id);
        if (error) throw error;
        toast.success("บันทึกการเปลี่ยนแปลงแล้ว");
        onSave(item!.id);
      } else {
        Object.assign(payload, {
          user_id: profile.id,
          stock_count: 0,
          is_active: true,
        });
        const { data, error } = await supabase
          .from("items")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        const newItem = data as Item;

        const stockQty = parseFloat(initialStock) || 0;
        if (itemType === "product" && stockQty > 0) {
          await supabase
            .from("items")
            .update({ stock_count: stockQty })
            .eq("id", newItem.id);
          await supabase.from("stock_movements").insert({
            item_id: newItem.id,
            user_id: profile.id,
            movement_type: "manual_in",
            qty_base: stockQty,
            balance_after: stockQty,
            reason: "สต็อกเริ่มต้น",
          });
        }
        toast.success("เพิ่มสินค้าสำเร็จ");
        onSave(newItem.id);
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "เกิดข้อผิดพลาด",
      );
    }
    setSaving(false);
  }

  const cartonPreviewPrice =
    cartonEnabled &&
    cartonUnit &&
    parseFloat(String(qtyPerCarton)) > 0 &&
    unitPrice;

  return (
    <div className="space-y-4">
      <TypeSelector
        value={itemType}
        onChange={setItemType}
        disabled={isEdit}
      />

      <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((p) => ({ ...p, name: "" }));
          }}
          placeholder="เช่น กระดาษ A4, ออกแบบโลโก้..."
          className="w-full text-[15px] px-0 py-1 border-b border-[#E8E6DF] focus:outline-none focus:border-[#378ADD] transition-colors bg-transparent"
          autoFocus={!isEdit}
        />
        {errors.name && (
          <p className="text-[11px] text-[#C0392B] mt-1">{errors.name}</p>
        )}
      </div>

      <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4">
        <div className="flex items-center gap-1">
          <span className="text-[15px] text-[#1A1A18]">฿</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(e) => {
              setUnitPrice(e.target.value);
              setErrors((p) => ({ ...p, unitPrice: "" }));
            }}
            placeholder="0.00"
            className="flex-1 text-[15px] px-0 py-1 border-b border-[#E8E6DF] focus:outline-none focus:border-[#378ADD] transition-colors bg-transparent"
          />
        </div>
        {errors.unitPrice && (
          <p className="text-[11px] text-[#C0392B] mt-1">
            {errors.unitPrice}
          </p>
        )}
        {cartonPreviewPrice && (
          <p className="text-[12px] text-[#888780] mt-1">
            = ฿{" "}
            {((parseFloat(unitPrice) || 0) * parseFloat(String(qtyPerCarton))).toLocaleString(
              "th-TH",
              { minimumFractionDigits: 2 },
            )}{" "}
            ต่อ{cartonUnit} ({qtyPerCarton} {baseUnit} × ฿{" "}
            {(parseFloat(unitPrice) || 0).toLocaleString("th-TH", {
              minimumFractionDigits: 2,
            })}
            )
          </p>
        )}
      </div>

      <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4 space-y-4">
        <div className="text-[11px] uppercase font-semibold text-[#888780]">
          หน่วย
        </div>
        <UnitSelector
          value={baseUnit}
          onChange={setBaseUnit}
          label="หน่วยฐาน"
        />
        {itemType === "product" && (
          <>
            <CartonUnitSection
              enabled={cartonEnabled}
              unit={cartonUnit}
              qtyPerCarton={qtyPerCarton}
              baseUnit={baseUnit}
              unitPrice={parseFloat(unitPrice) || 0}
              onEnabledChange={setCartonEnabled}
              onUnitChange={(v) => {
                setCartonUnit(v);
                setErrors((p) => ({ ...p, cartonUnit: "" }));
              }}
              onQtyChange={(v) => {
                setQtyPerCarton(String(v));
                setErrors((p) => ({ ...p, qtyPerCarton: "" }));
              }}
            />
            {errors.cartonUnit && (
              <p className="text-[11px] text-[#C0392B]">
                {errors.cartonUnit}
              </p>
            )}
            {errors.qtyPerCarton && (
              <p className="text-[11px] text-[#C0392B]">
                {errors.qtyPerCarton}
              </p>
            )}
          </>
        )}
      </div>

      {itemType === "product" && (
        <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4 space-y-4">
          <div className="text-[11px] uppercase font-semibold text-[#888780]">
            สต็อก
          </div>
          {!isEdit && (
            <StockInitialField
              value={initialStock}
              onChange={(v) => setInitialStock(String(v))}
              baseUnit={baseUnit}
              cartonUnit={cartonEnabled ? cartonUnit : null}
              qtyPerCarton={
                cartonEnabled ? parseFloat(String(qtyPerCarton)) || 0 : 0
              }
            />
          )}
          <div>
            <label className="block text-[13px] text-[#1A1A18] mb-1">
              แจ้งเตือนเมื่อเหลือ
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className="w-24 px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
              />
              <span className="text-sm text-[#888780]">{baseUnit}</span>
            </div>
            <p className="text-[11px] text-[#888780] mt-1">
              ระบบจะแสดงเตือนเมื่อสต็อกเหลือน้อยกว่าจำนวนนี้
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          loading={saving}
          className="flex-1"
        >
          {isEdit ? "บันทึกการเปลี่ยนแปลง" : "บันทึกสินค้า / บริการ"}
        </Button>
      </div>
    </div>
  );
}
