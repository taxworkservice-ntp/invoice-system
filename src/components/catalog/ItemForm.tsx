import { useEffect, useState } from "react";
import { TypeSelector } from "./TypeSelector";
import { UnitSelector } from "./UnitSelector";
import { CartonUnitSection } from "./CartonUnitSection";
import { StockInitialField } from "./StockInitialField";
import { Button } from "../ui/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useClientFeatures } from "../../hooks/useClientFeatures";
import { useToast } from "../../hooks/useToast";
import { isDuplicateSkuError, normalizeSku, validateSku } from "../../lib/sku";
import type { Item, JobDetailPresetField, ItemJobDetailPreset } from "../../types";

type PresetState = Record<JobDetailPresetField, string[]>;

const JOB_DETAIL_FIELDS: { key: JobDetailPresetField; label: string; placeholder: string }[] = [
  { key: "color", label: "สี / ฟอยล์", placeholder: "เช่น ฟอยล์ทอง" },
  { key: "position", label: "ตำแหน่ง", placeholder: "เช่น ด้านหน้า" },
  { key: "material", label: "วัสดุ", placeholder: "เช่น กล่องกระดาษ" },
  { key: "remark", label: "หมายเหตุ", placeholder: "เช่น ตามแบบลูกค้า" },
];

const EMPTY_PRESETS: PresetState = {
  color: [],
  position: [],
  material: [],
  remark: [],
};

function uniquePresetValues(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });
  return result;
}

interface Props {
  item?: Item | null;
  onSave: (itemId?: string) => void;
  onCancel: () => void;
}

export function ItemForm({ item, onSave, onCancel: _onCancel }: Props) {
  const { profile } = useAuth();
  const { hasFeature } = useClientFeatures(profile?.id);
  const toast = useToast();
  const isEdit = !!item;
  const jobDetailsFeatureEnabled = hasFeature("service_job_details");

  const [name, setName] = useState(item?.name || "");
  const [sku, setSku] = useState(item?.sku || "");
  const [itemType, setItemType] = useState<"product" | "service">(
    item?.item_type || "product",
  );
  const [unitPrice, setUnitPrice] = useState(
    item ? String(item.unit_price) : "",
  );
  const [hasJobDetails, setHasJobDetails] = useState(
    item?.has_job_details || false,
  );
  const [jobDetailPresets, setJobDetailPresets] = useState<PresetState>(EMPTY_PRESETS);
  const [newPresetValues, setNewPresetValues] = useState<Record<JobDetailPresetField, string>>({
    color: "",
    position: "",
    material: "",
    remark: "",
  });
  const [baseUnit, setBaseUnit] = useState(item?.base_unit || "ชิ้น");
  const [cartonEnabled, setCartonEnabled] = useState(!!item?.carton_unit);
  const [cartonUnit, setCartonUnit] = useState(item?.carton_unit || "");
  const [qtyPerCarton, setQtyPerCarton] = useState(
    item?.qty_per_carton ? String(item.qty_per_carton) : "",
  );
  const [initialStock, setInitialStock] = useState("0");
  const [initialCost, setInitialCost] = useState(
    item?.avg_cost ? String(item.avg_cost) : "",
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    item ? String(item.low_stock_threshold) : "5",
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!jobDetailsFeatureEnabled || !item?.id || item.item_type !== "service") return;

    let cancelled = false;
    async function loadPresets() {
      const { data } = await supabase
        .from("item_job_detail_presets")
        .select("*")
        .eq("item_id", item!.id)
        .order("field_key", { ascending: true })
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      const next: PresetState = { color: [], position: [], material: [], remark: [] };
      ((data || []) as ItemJobDetailPreset[]).forEach((preset) => {
        next[preset.field_key].push(preset.value);
      });
      setJobDetailPresets(next);
    }

    void loadPresets();
    return () => {
      cancelled = true;
    };
  }, [item, jobDetailsFeatureEnabled]);

  function addPreset(field: JobDetailPresetField) {
    const value = newPresetValues[field].trim();
    if (!value) return;
    setJobDetailPresets((prev) => ({
      ...prev,
      [field]: uniquePresetValues([...prev[field], value]),
    }));
    setNewPresetValues((prev) => ({ ...prev, [field]: "" }));
  }

  function removePreset(field: JobDetailPresetField, value: string) {
    setJobDetailPresets((prev) => ({
      ...prev,
      [field]: prev[field].filter((presetValue) => presetValue !== value),
    }));
  }

  async function saveJobDetailPresets(itemId: string) {
    if (!profile || !jobDetailsFeatureEnabled) return;
    await supabase.from("item_job_detail_presets").delete().eq("item_id", itemId);
    if (itemType !== "service" || !hasJobDetails) return;

    const records = JOB_DETAIL_FIELDS.flatMap(({ key }) =>
      uniquePresetValues(jobDetailPresets[key]).map((value, index) => ({
        user_id: profile.id,
        item_id: itemId,
        field_key: key,
        value,
        sort_order: index,
      })),
    );

    if (records.length > 0) {
      const { error } = await supabase.from("item_job_detail_presets").insert(records);
      if (error) throw error;
    }
  }

  function validate(): boolean {
    const fieldErrors: Record<string, string> = {};

    if (!name.trim()) {
      fieldErrors.name = "กรุณากรอกชื่อสินค้า";
    }

    const skuError = validateSku(sku);
    if (skuError) {
      fieldErrors.sku = skuError;
    }

    if (!unitPrice || isNaN(Number(unitPrice)) || Number(unitPrice) < 0) {
      fieldErrors.unitPrice = "กรุณากรอกราคาให้ถูกต้อง";
    }

    if (!isEdit && itemType === "product") {
      const startingStock = parseFloat(initialStock) || 0;
      const startingCost = parseFloat(initialCost);
      if (
        startingStock > 0 &&
        (!initialCost || isNaN(startingCost) || startingCost < 0)
      ) {
        fieldErrors.initialCost = "กรุณากรอกราคาทุนเริ่มต้นให้ถูกต้อง";
      }
    }

    if (cartonEnabled) {
      if (!cartonUnit) {
        fieldErrors.cartonUnit = "กรุณาเลือกหน่วยรอง";
      }
      const qty = parseFloat(String(qtyPerCarton));
      if (!qtyPerCarton || isNaN(qty) || qty < 1) {
        fieldErrors.qtyPerCarton = "กรุณากรอกจำนวนต่อหน่วยอย่างน้อย 1";
      }
      if (cartonUnit === baseUnit) {
        fieldErrors.cartonUnit = "หน่วยรองต้องไม่ซ้ำกับหน่วยฐาน";
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
      sku: normalizeSku(sku),
      item_type: itemType,
      unit_price: isNaN(price) ? 0 : price,
      has_job_details:
        itemType === "product"
          ? false
          : jobDetailsFeatureEnabled
            ? hasJobDetails
            : item?.has_job_details || false,
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
        await saveJobDetailPresets(item!.id);
        toast.success("บันทึกการเปลี่ยนแปลงแล้ว");
        onSave(item!.id);
      } else {
        Object.assign(payload, {
          user_id: profile.id,
          stock_count: 0,
          avg_cost: 0,
          stock_value: 0,
          is_active: true,
        });

        const { data, error } = await supabase
          .from("items")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        const newItem = data as Item;
        await saveJobDetailPresets(newItem.id);

        const stockQty = parseFloat(initialStock) || 0;
        const costPerUnit = parseFloat(initialCost) || 0;
        const openingValue = stockQty > 0 ? stockQty * costPerUnit : 0;
        if (itemType === "product" && stockQty > 0) {
          await supabase
            .from("items")
            .update({
              stock_count: stockQty,
              avg_cost: costPerUnit,
              stock_value: openingValue,
            })
            .eq("id", newItem.id);
          await supabase.from("stock_movements").insert({
            item_id: newItem.id,
            user_id: profile.id,
            movement_type: "manual_in",
            qty_base: stockQty,
            balance_after: stockQty,
            unit_cost: costPerUnit,
            movement_value: openingValue,
            balance_value_after: openingValue,
            reason: "สต็อกเริ่มต้น",
          });
        }

        toast.success("เพิ่มสินค้าเรียบร้อย");
        onSave(newItem.id);
      }
    } catch (err: unknown) {
      if (isDuplicateSkuError(err)) {
        setErrors((prev) => ({ ...prev, sku: "SKU นี้ถูกใช้แล้ว" }));
        toast.error("SKU นี้ถูกใช้แล้ว");
        setSaving(false);
        return;
      }

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
        <div className="mb-4 rounded-[10px] border border-[#ECE8DE] bg-[#FBFAF7] px-3 py-3">
          <div className="text-[11px] uppercase font-semibold tracking-[0.12em] text-[#888780]">
            SKU
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="text"
              value={sku}
              onChange={(e) => {
                setSku(normalizeSku(e.target.value));
                setErrors((prev) => ({ ...prev, sku: "" }));
              }}
              placeholder="BOX-001"
              className="flex-1 text-[15px] px-0 py-1 border-b border-[#E8E6DF] focus:outline-none focus:border-[#378ADD] transition-colors bg-transparent uppercase tracking-[0.08em]"
            />
            <span className="shrink-0 rounded-full border border-[#E8E6DF] bg-white px-2.5 py-1 text-[10px] font-medium text-[#6B7280]">
              Internal ID
            </span>
          </div>
          <p className="mt-2 text-[11px] text-[#888780]">
            Use a short code like BOX-001 or PAPER-A4-80G.
          </p>
          {errors.sku && (
            <p className="mt-1 text-[11px] text-[#C0392B]">{errors.sku}</p>
          )}
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((prev) => ({ ...prev, name: "" }));
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
              setErrors((prev) => ({ ...prev, unitPrice: "" }));
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
            {(
              (parseFloat(unitPrice) || 0) * parseFloat(String(qtyPerCarton))
            ).toLocaleString("th-TH", {
              minimumFractionDigits: 2,
            })}{" "}
            ต่อ{cartonUnit} ({qtyPerCarton} {baseUnit} x ฿{" "}
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
              onUnitChange={(value) => {
                setCartonUnit(value);
                setErrors((prev) => ({ ...prev, cartonUnit: "" }));
              }}
              onQtyChange={(value) => {
                setQtyPerCarton(String(value));
                setErrors((prev) => ({ ...prev, qtyPerCarton: "" }));
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

      {itemType === "service" && jobDetailsFeatureEnabled && (
        <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4 space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={hasJobDetails}
              onChange={(event) => setHasJobDetails(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#D7DEE7] text-primary focus:ring-primary"
            />
            <span>
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1A1A18]">
                <span>บริการนี้มีรายละเอียดงาน</span>
                <span className="inline-flex items-center rounded-full border border-[#B8D7F1] bg-[#EAF4FF] px-2 py-0.5 text-[10px] font-medium text-[#0C447C]">
                  Business Feature
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#888780]">
                แสดงช่องกรอกรายละเอียดบนรายการเอกสาร เช่น สี/ฟอยล์ ขนาด ตำแหน่ง วัสดุ และหมายเหตุ
              </span>
              <span className="mt-2 block rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] px-3 py-2 text-xs leading-5 text-[#5F5A52]">
                เหมาะกับบริการงานผลิต/งานพิมพ์ที่ต้องระบุสเปกต่อรายการ หากเป็นบริการทั่วไปให้ปิดไว้เพื่อให้ฟอร์มเอกสารสั้นและใช้งานเร็ว
              </span>
            </span>
          </label>

          {hasJobDetails && (
            <div className="border-t border-[#ECE8DE] pt-4">
              <div className="mb-3">
                <div className="text-sm font-medium text-[#1A1A18]">ตัวเลือกเริ่มต้น</div>
                <p className="mt-1 text-xs leading-5 text-[#888780]">
                  เพิ่มค่าที่ใช้บ่อยเพื่อให้เลือกได้เร็วตอนสร้างใบเสนอราคา/ใบแจ้งหนี้ ยังสามารถพิมพ์ค่าใหม่เองได้เสมอ
                </p>
              </div>

              <div className="space-y-4">
                {JOB_DETAIL_FIELDS.map((field) => (
                  <div key={field.key}>
                    <div className="mb-2 text-[13px] font-medium text-[#1A1A18]">{field.label}</div>
                    {jobDetailPresets[field.key].length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {jobDetailPresets[field.key].map((value) => (
                          <span
                            key={value}
                            className="inline-flex items-center gap-1 rounded-full border border-[#D7DEE7] bg-white px-2.5 py-1 text-xs text-[#5F5A52]"
                          >
                            {value}
                            <button
                              type="button"
                              onClick={() => removePreset(field.key, value)}
                              className="text-gray-400 transition-colors hover:text-red-500"
                              aria-label={`ลบ ${value}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPresetValues[field.key]}
                        onChange={(event) =>
                          setNewPresetValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addPreset(field.key);
                          }
                        }}
                        placeholder={field.placeholder}
                        className="min-w-0 flex-1 rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20"
                      />
                      <button
                        type="button"
                        onClick={() => addPreset(field.key)}
                        className="shrink-0 rounded-lg border border-card-border bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        เพิ่ม
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {itemType === "product" && (
        <div className="bg-white border-[0.5px] border-[#E8E6DF] rounded-[10px] p-4 space-y-4">
          <div className="text-[11px] uppercase font-semibold text-[#888780]">
            สต็อก
          </div>
          {!isEdit && (
            <>
              <StockInitialField
                value={initialStock}
                onChange={(value) => setInitialStock(String(value))}
                baseUnit={baseUnit}
                cartonUnit={cartonEnabled ? cartonUnit : null}
                qtyPerCarton={
                  cartonEnabled ? parseFloat(String(qtyPerCarton)) || 0 : 0
                }
              />
              <div>
                <label className="block text-[13px] text-[#1A1A18] mb-1">
                  ต้นทุนเริ่มต้นต่อ {baseUnit}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialCost}
                  onChange={(e) => {
                    setInitialCost(e.target.value);
                    setErrors((prev) => ({ ...prev, initialCost: "" }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20"
                  placeholder="เช่น 45.00"
                />
                <p className="text-[11px] text-[#888780] mt-1">
                  ใช้คำนวณต้นทุนเฉลี่ยและมูลค่าสต็อกเริ่มต้น
                </p>
                {errors.initialCost && (
                  <p className="text-[11px] text-[#C0392B] mt-1">
                    {errors.initialCost}
                  </p>
                )}
              </div>
            </>
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
