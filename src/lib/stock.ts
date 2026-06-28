import { supabase } from "./supabase";

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cartonsToBase(cartons: number, qtyPerCarton: number): number {
  return round3(cartons * qtyPerCarton);
}

export function baseToCartons(base: number, qtyPerCarton: number): number {
  return round3(base / qtyPerCarton);
}

function formatStockNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString("th-TH");
  }

  return round3(value).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function formatMixedStock(
  stockBase: number,
  baseUnit: string,
  cartonUnit?: string | null,
  qtyPerCarton?: number | null,
): string {
  if (!cartonUnit || !qtyPerCarton || qtyPerCarton <= 0) {
    return `${formatStockNumber(stockBase)} ${baseUnit}`;
  }

  const normalizedStock = round3(stockBase);
  const fullCartons = Math.floor(normalizedStock / qtyPerCarton);
  const remainderBase = round3(normalizedStock - fullCartons * qtyPerCarton);
  const parts: string[] = [];

  if (fullCartons > 0) {
    parts.push(`${formatStockNumber(fullCartons)} ${cartonUnit}`);
  }

  if (remainderBase > 0 || parts.length === 0) {
    parts.push(`${formatStockNumber(remainderBase)} ${baseUnit}`);
  }

  return parts.join(" ");
}

export function formatMovementQty(
  qtyBase: number,
  baseUnit: string,
  cartonUnit?: string | null,
  qtyPerCarton?: number | null,
): string {
  const sign = qtyBase < 0 ? "−" : "";
  const absQty = Math.abs(qtyBase);
  const body = formatMixedStock(absQty, baseUnit, cartonUnit, qtyPerCarton);
  if (qtyBase === 0) return `0 ${baseUnit}`;
  return `${sign}${body}`;
}

export function formatBaseWithCartonHint(
  stockBase: number,
  baseUnit: string,
  cartonUnit?: string | null,
  qtyPerCarton?: number | null,
): string {
  const baseStr = `${formatStockNumber(stockBase)} ${baseUnit}`;

  if (!cartonUnit || !qtyPerCarton || qtyPerCarton <= 0) {
    return baseStr;
  }

  const cartonStr = formatMixedStock(
    stockBase,
    baseUnit,
    cartonUnit,
    qtyPerCarton,
  );

  if (cartonStr === baseStr) {
    return baseStr;
  }

  return `${baseStr} (หรือ ${cartonStr})`;
}

export function formatStock(
  stockBase: number,
  baseUnit: string,
  cartonUnit?: string | null,
  qtyPerCarton?: number | null,
): string {
  const baseStr = `${formatStockNumber(stockBase)} ${baseUnit}`;
  if (!cartonUnit || !qtyPerCarton || qtyPerCarton <= 0) return baseStr;
  return `${formatMixedStock(stockBase, baseUnit, cartonUnit, qtyPerCarton)} (${baseStr})`;
}

export function isLowStock(stockCount: number, threshold: number): boolean {
  return stockCount > 0 && stockCount <= threshold;
}

export function isOutOfStock(stockCount: number): boolean {
  return stockCount <= 0;
}

export interface StockWarning {
  itemName: string;
  requested: number;
  available: number;
  unit: string;
}

export interface DeductStockResult {
  warnings: StockWarning[];
  movementCreated: boolean;
}

function nextAverageCost(stockCount: number, stockValue: number): number {
  if (stockCount <= 0 || stockValue <= 0) return 0;
  return round2(stockValue / stockCount);
}

export async function deductStockOnDocumentSent(
  documentId: string,
  userId: string,
): Promise<DeductStockResult> {
  const { data: clientProfile } = await supabase
    .from("client_profiles")
    .select("stock_deduct_trigger")
    .eq("user_id", userId)
    .single();

  const trigger = clientProfile?.stock_deduct_trigger || "invoice";

  const { data: document } = await supabase
    .from("documents")
    .select("doc_type, doc_number")
    .eq("id", documentId)
    .single();

  if (!document) return { warnings: [], movementCreated: false };

  const shouldDeduct =
    (trigger === "invoice" &&
      (document.doc_type === "invoice" ||
        document.doc_type === "tax_invoice_receipt")) ||
    (trigger === "delivery_note" && document.doc_type === "delivery_note");

  if (!shouldDeduct) return { warnings: [], movementCreated: false };

  const { data: existingMovement } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("document_id", documentId)
    .eq("movement_type", "auto_out")
    .limit(1)
    .maybeSingle();

  if (existingMovement) return { warnings: [], movementCreated: false };

  const { data: lineItems } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", documentId);

  if (!lineItems) return { warnings: [], movementCreated: false };

  const warnings: StockWarning[] = [];
  let movementCreated = false;

  for (const li of lineItems) {
    if (li.item_type !== "product" || !li.item_id) continue;

    const { data: item } = await supabase
      .from("items")
      .select("stock_count, avg_cost, stock_value, carton_unit, qty_per_carton")
      .eq("id", li.item_id)
      .single();

    if (!item) continue;

    const baseQuantity = round3(Number(li.base_quantity ?? li.quantity ?? 0));
    const requestedQuantity =
      li.carton_unit && li.unit === li.carton_unit && li.qty_carton != null
        ? Number(li.qty_carton)
        : Number(li.quantity ?? 0);
    const availableQuantity =
      li.carton_unit && li.unit === li.carton_unit && item.qty_per_carton
        ? baseToCartons(item.stock_count, item.qty_per_carton)
        : item.stock_count;
    const newStock = round3(item.stock_count - baseQuantity);
    const finalStock = Math.max(0, newStock);
    const unitCost = round2(Number(item.avg_cost || 0));
    const movementValue = round2(baseQuantity * unitCost);
    const finalStockValue =
      finalStock <= 0
        ? 0
        : Math.max(0, round2(Number(item.stock_value || 0) - movementValue));

    if (newStock < 0) {
      console.warn(
        `Stock clamped to 0 for item ${li.item_id}: would have been ${newStock}`,
      );
      warnings.push({
        itemName: li.item_name,
        requested: requestedQuantity,
        available: availableQuantity,
        unit: li.unit,
      });
    }

    const { error: itemUpdateError } = await supabase
      .from("items")
      .update({
        stock_count: finalStock,
        stock_value: finalStockValue,
        avg_cost: nextAverageCost(finalStock, finalStockValue),
      })
      .eq("id", li.item_id);
    if (itemUpdateError) throw itemUpdateError;

    const reasonLabel =
      document.doc_type === "delivery_note"
        ? "ใบส่งของ"
        : document.doc_type === "tax_invoice_receipt"
          ? "ใบกำกับภาษี/ใบเสร็จรับเงิน"
          : "ใบแจ้งหนี้";

    const { error: movementError } = await supabase.from("stock_movements").insert({
      item_id: li.item_id,
      user_id: userId,
      movement_type: "auto_out",
      qty_base: -baseQuantity,
      qty_carton: li.qty_carton ? -li.qty_carton : null,
      carton_unit: li.carton_unit || null,
      balance_after: finalStock,
      unit_cost: unitCost,
      movement_value: movementValue,
      balance_value_after: finalStockValue,
      reason: `ตัดสต็อกจาก${reasonLabel} ${document.doc_number}`,
      document_id: documentId,
    });
    if (movementError) throw movementError;
    movementCreated = true;
  }

  return { warnings, movementCreated };
}

export async function restoreStockOnVoid(
  voidedDocumentId: string,
  userId: string,
): Promise<void> {
  const { data: document } = await supabase
    .from("documents")
    .select("doc_number")
    .eq("id", voidedDocumentId)
    .maybeSingle();

  const docNumber = document?.doc_number || voidedDocumentId;

  const { data: outboundMovements } = await supabase
    .from("stock_movements")
    .select("id, item_id, qty_base, qty_carton, carton_unit, movement_value, unit_cost")
    .eq("document_id", voidedDocumentId)
    .eq("movement_type", "auto_out");

  if (!outboundMovements || outboundMovements.length === 0) return;

  const movementIds = outboundMovements.map((movement) => movement.id);
  const { data: existingRestores } = await supabase
    .from("stock_movements")
    .select("parent_movement_id")
    .in("parent_movement_id", movementIds)
    .eq("movement_type", "return_in");

  const restoredMovementIds = new Set(
    (existingRestores || [])
      .map((movement) => movement.parent_movement_id)
      .filter(Boolean),
  );

  for (const movement of outboundMovements) {
    if (!movement.item_id || restoredMovementIds.has(movement.id)) continue;

    const { data: item } = await supabase
      .from("items")
      .select("stock_count, avg_cost, stock_value")
      .eq("id", movement.item_id)
      .single();

    if (!item) continue;

    const baseQuantity = round3(Math.abs(Number(movement.qty_base || 0)));
    if (baseQuantity <= 0) continue;

    const newStock = round3(item.stock_count + baseQuantity);
    const unitCost = round2(
      movement.unit_cost != null
        ? Number(movement.unit_cost)
        : Number(item.avg_cost || 0),
    );
    const movementValue =
      movement.movement_value != null
        ? round2(Math.abs(Number(movement.movement_value)))
        : round2(baseQuantity * unitCost);
    const newStockValue = round2(Number(item.stock_value || 0) + movementValue);
    const avgCost = nextAverageCost(newStock, newStockValue);

    await supabase
      .from("items")
      .update({ stock_count: newStock, stock_value: newStockValue, avg_cost: avgCost })
      .eq("id", movement.item_id);

    await supabase.from("stock_movements").insert({
      item_id: movement.item_id,
      user_id: userId,
      movement_type: "return_in",
      qty_base: baseQuantity,
      qty_carton: movement.qty_carton != null ? Math.abs(Number(movement.qty_carton)) : null,
      carton_unit: movement.carton_unit || null,
      balance_after: newStock,
      unit_cost: unitCost,
      movement_value: movementValue,
      balance_value_after: newStockValue,
      reason: `Restore stock from voided document ${docNumber}`,
      document_id: voidedDocumentId,
      parent_movement_id: movement.id,
    });
  }
}

export async function manualStockIn(
  itemId: string,
  userId: string,
  qtyBase: number,
  unitCost: number,
  reason?: string,
): Promise<void> {
  const { data: item } = await supabase
    .from("items")
    .select("stock_count, stock_value")
    .eq("id", itemId)
    .single();

  if (!item) return;

  const newStock = round3(item.stock_count + qtyBase);
  const movementValue = round2(qtyBase * unitCost);
  const newStockValue = round2(Number(item.stock_value || 0) + movementValue);
  const avgCost = nextAverageCost(newStock, newStockValue);

  await supabase
    .from("items")
    .update({ stock_count: newStock, stock_value: newStockValue, avg_cost: avgCost })
    .eq("id", itemId);

  await supabase.from("stock_movements").insert({
    item_id: itemId,
    user_id: userId,
    movement_type: "manual_in",
    qty_base: qtyBase,
    balance_after: newStock,
    unit_cost: round2(unitCost),
    movement_value: movementValue,
    balance_value_after: newStockValue,
    reason: reason || null,
    document_id: null,
  });
}

export async function manualStockOut(
  itemId: string,
  userId: string,
  qtyBase: number,
  reason?: string,
): Promise<void> {
  const { data: item } = await supabase
    .from("items")
    .select("stock_count, avg_cost, stock_value")
    .eq("id", itemId)
    .single();

  if (!item) return;

  const newStock = round3(item.stock_count - qtyBase);
  const finalStock = Math.max(0, newStock);
  const unitCost = round2(Number(item.avg_cost || 0));
  const movementValue = round2(qtyBase * unitCost);
  const finalStockValue =
    finalStock <= 0
      ? 0
      : Math.max(0, round2(Number(item.stock_value || 0) - movementValue));

  if (newStock < 0) {
    console.warn(
      `Stock clamped to 0 for item ${itemId}: would have been ${newStock}`,
    );
  }

  await supabase
    .from("items")
    .update({
      stock_count: finalStock,
      stock_value: finalStockValue,
      avg_cost: nextAverageCost(finalStock, finalStockValue),
    })
    .eq("id", itemId);

  await supabase.from("stock_movements").insert({
    item_id: itemId,
    user_id: userId,
    movement_type: "manual_out",
    qty_base: -qtyBase,
    balance_after: finalStock,
    unit_cost: unitCost,
    movement_value: movementValue,
    balance_value_after: finalStockValue,
    reason: reason || "ตัดสต็อกด้วยตนเอง",
    document_id: null,
  });
}

export type CorrectResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_manual" | "already_reverted" | "insufficient_stock"; currentStock: number; requiredQty: number };

export async function correctManualStockIn(
  movementId: string,
  userId: string,
  newQtyBase: number,
  newUnitCost: number,
  reasonNote?: string,
): Promise<CorrectResult> {
  const { data: original, error: originalErr } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("id", movementId)
    .eq("user_id", userId)
    .single();

  if (originalErr || !original) return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };
  if (original.movement_type !== "manual_in") return { ok: false, reason: "not_manual", currentStock: 0, requiredQty: 0 };

  const { data: reversal } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("parent_movement_id", movementId)
    .maybeSingle();
  if (reversal) return { ok: false, reason: "already_reverted", currentStock: 0, requiredQty: 0 };

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("stock_count, stock_value")
    .eq("id", original.item_id)
    .single();
  if (itemErr || !item) return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };

  const oldQty = Number(original.qty_base);
  const oldValue = Number(original.movement_value || 0);
  const newValue = round2(newQtyBase * newUnitCost);

  const qtyDelta = round3(newQtyBase - oldQty);
  const valueDelta = round2(newValue - oldValue);

  const newStockCount = round3(Number(item.stock_count) + qtyDelta);
  if (newStockCount < 0) {
    return { ok: false, reason: "insufficient_stock", currentStock: Number(item.stock_count), requiredQty: -qtyDelta };
  }

  const newStockValue = round2(Number(item.stock_value || 0) + valueDelta);
  const newAvgCost = nextAverageCost(newStockCount, newStockValue);

  const reason = reasonNote
    ? `${original.reason || "สต็อกเริ่มต้น"} [แก้ไข: ${reasonNote}]`
    : original.reason;

  await supabase.from("items")
    .update({ stock_count: newStockCount, stock_value: newStockValue, avg_cost: newAvgCost })
    .eq("id", original.item_id);

  await supabase.from("stock_movements")
    .update({
      qty_base: newQtyBase,
      unit_cost: round2(newUnitCost),
      movement_value: newValue,
      balance_after: newStockCount,
      balance_value_after: newStockValue,
      reason,
    })
    .eq("id", movementId);

  return { ok: true };
}

export async function correctManualStockOut(
  movementId: string,
  userId: string,
  newQtyBase: number,
  reasonNote?: string,
): Promise<CorrectResult> {
  const { data: original, error: originalErr } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("id", movementId)
    .eq("user_id", userId)
    .single();

  if (originalErr || !original) return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };
  if (original.movement_type !== "manual_out") return { ok: false, reason: "not_manual", currentStock: 0, requiredQty: 0 };

  const { data: reversal } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("parent_movement_id", movementId)
    .maybeSingle();
  if (reversal) return { ok: false, reason: "already_reverted", currentStock: 0, requiredQty: 0 };

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("stock_count, avg_cost, stock_value")
    .eq("id", original.item_id)
    .single();
  if (itemErr || !item) return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };

  const oldQty = Math.abs(Number(original.qty_base));
  const qtyDelta = round3(oldQty - newQtyBase);

  const unitCost = round2(Number(item.avg_cost || 0));
  const valueDelta = round2(qtyDelta * unitCost);

  const newStockCount = round3(Number(item.stock_count) + qtyDelta);
  const newStockValue = round2(Number(item.stock_value || 0) + valueDelta);
  const newMoveValue = round2(newQtyBase * unitCost);

  const reason = reasonNote
    ? `${original.reason || "ตัดสต็อกด้วยตนเอง"} [แก้ไข: ${reasonNote}]`
    : original.reason;

  await supabase.from("items")
    .update({ stock_count: newStockCount, stock_value: newStockValue, avg_cost: nextAverageCost(newStockCount, newStockValue) })
    .eq("id", original.item_id);

  await supabase.from("stock_movements")
    .update({
      qty_base: -newQtyBase,
      unit_cost: unitCost,
      movement_value: newMoveValue,
      balance_after: newStockCount,
      balance_value_after: newStockValue,
      reason,
    })
    .eq("id", movementId);

  return { ok: true };
}

export type RevertReason =
  | "not_found"
  | "not_manual_in"
  | "not_manual_out"
  | "already_reverted"
  | "insufficient_stock";

export type RevertResult =
  | { ok: true; reversalMovementId: string; prefillQty: number }
  | { ok: false; reason: RevertReason; currentStock: number; requiredQty: number };

export async function revertManualStockIn(
  movementId: string,
  userId: string,
  reason: string,
): Promise<RevertResult> {
  const { data: original, error: originalErr } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("id", movementId)
    .eq("user_id", userId)
    .single();

  if (originalErr || !original) {
    return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };
  }

  if (original.movement_type !== "manual_in") {
    return { ok: false, reason: "not_manual_in", currentStock: 0, requiredQty: 0 };
  }

  const { data: existingReversal } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("parent_movement_id", movementId)
    .maybeSingle();

  if (existingReversal) {
    return { ok: false, reason: "already_reverted", currentStock: 0, requiredQty: 0 };
  }

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("stock_count, stock_value")
    .eq("id", original.item_id)
    .single();

  if (itemErr || !item) {
    return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };
  }

  const requiredQty = Number(original.qty_base);
  const currentStock = Number(item.stock_count || 0);

  if (currentStock < requiredQty) {
    return { ok: false, reason: "insufficient_stock", currentStock, requiredQty };
  }

  const originalUnitCost = Number(original.unit_cost || 0);
  const originalMovementValue = Number(original.movement_value || 0);

  const newStock = round3(currentStock - requiredQty);
  const reversalMovementValue = round2(-originalMovementValue);
  const newStockValue = round2(Number(item.stock_value || 0) + reversalMovementValue);
  const newAvgCost = nextAverageCost(newStock, newStockValue);

  const { error: updateErr } = await supabase
    .from("items")
    .update({ stock_count: newStock, stock_value: newStockValue, avg_cost: newAvgCost })
    .eq("id", original.item_id);

  if (updateErr) {
    return { ok: false, reason: "not_found", currentStock, requiredQty };
  }

  const reasonText = reason
    ? `ยกเลิกรายการรับสินค้าเข้า: ${reason}`
    : "ยกเลิกรายการรับสินค้าเข้า";

  const { data: reversal, error: insertErr } = await supabase
    .from("stock_movements")
    .insert({
      item_id: original.item_id,
      user_id: userId,
      movement_type: "manual_out",
      qty_base: -requiredQty,
      balance_after: newStock,
      unit_cost: originalUnitCost,
      movement_value: reversalMovementValue,
      balance_value_after: newStockValue,
      reason: reasonText,
      document_id: null,
      parent_movement_id: original.id,
    })
    .select("id")
    .single();

  if (insertErr || !reversal) {
    return { ok: false, reason: "not_found", currentStock, requiredQty };
  }

  return { ok: true, reversalMovementId: reversal.id, prefillQty: requiredQty };
}

export async function revertManualStockOut(
  movementId: string,
  userId: string,
  reason: string,
): Promise<RevertResult> {
  const { data: original, error: originalErr } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("id", movementId)
    .eq("user_id", userId)
    .single();

  if (originalErr || !original) {
    return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };
  }

  if (original.movement_type !== "manual_out") {
    return { ok: false, reason: "not_manual_out", currentStock: 0, requiredQty: 0 };
  }

  const { data: existingReversal } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("parent_movement_id", movementId)
    .maybeSingle();

  if (existingReversal) {
    return { ok: false, reason: "already_reverted", currentStock: 0, requiredQty: 0 };
  }

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("stock_count, avg_cost, stock_value")
    .eq("id", original.item_id)
    .single();

  if (itemErr || !item) {
    return { ok: false, reason: "not_found", currentStock: 0, requiredQty: 0 };
  }

  const requiredQty = Math.abs(Number(original.qty_base));
  const unitCost = round2(Number(item.avg_cost || 0));
  const movementValue = round2(requiredQty * unitCost);

  const newStock = round3(Number(item.stock_count) + requiredQty);
  const newStockValue = round2(Number(item.stock_value || 0) + movementValue);
  const newAvgCost = nextAverageCost(newStock, newStockValue);

  await supabase
    .from("items")
    .update({ stock_count: newStock, stock_value: newStockValue, avg_cost: newAvgCost })
    .eq("id", original.item_id);

  const reasonText = reason
    ? `ยกเลิกรายการตัดสต็อก: ${reason}`
    : "ยกเลิกรายการตัดสต็อก";

  const { data: reversal, error: insertErr } = await supabase
    .from("stock_movements")
    .insert({
      item_id: original.item_id,
      user_id: userId,
      movement_type: "manual_in",
      qty_base: requiredQty,
      balance_after: newStock,
      unit_cost: unitCost,
      movement_value: movementValue,
      balance_value_after: newStockValue,
      reason: reasonText,
      document_id: null,
      parent_movement_id: original.id,
    })
    .select("id")
    .single();

  if (insertErr || !reversal) {
    return { ok: false, reason: "not_found", currentStock: Number(item.stock_count), requiredQty };
  }

  return { ok: true, reversalMovementId: reversal.id, prefillQty: requiredQty };
}
