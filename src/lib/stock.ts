import { supabase } from "./supabase";

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function cartonsToBase(cartons: number, qtyPerCarton: number): number {
  return round3(cartons * qtyPerCarton);
}

export function baseToCartons(base: number, qtyPerCarton: number): number {
  return round3(base / qtyPerCarton);
}

export function formatStock(
  stockBase: number,
  baseUnit: string,
  cartonUnit?: string | null,
  qtyPerCarton?: number | null,
): string {
  const baseStr = `${stockBase} ${baseUnit}`;
  if (!cartonUnit || !qtyPerCarton || qtyPerCarton <= 0) return baseStr;
  const cartons = baseToCartons(stockBase, qtyPerCarton);
  return `${baseStr} (${cartons} ${cartonUnit})`;
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

  if (!document) return { warnings: [] };

  const shouldDeduct =
    (trigger === "invoice" && (document.doc_type === "invoice" || document.doc_type === "tax_invoice_receipt")) ||
    (trigger === "delivery_note" && document.doc_type === "delivery_note");

  if (!shouldDeduct) return { warnings: [] };

  const { data: lineItems } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", documentId);

  if (!lineItems) return { warnings: [] };

  const warnings: StockWarning[] = [];

  for (const li of lineItems) {
    if (li.item_type !== "product" || !li.item_id) continue;

    const { data: item } = await supabase
      .from("items")
      .select("stock_count, carton_unit, qty_per_carton")
      .eq("id", li.item_id)
      .single();

    if (!item) continue;

    const newStock = round3(item.stock_count - li.quantity);
    const finalStock = Math.max(0, newStock);

    if (newStock < 0) {
      console.warn(
        `Stock clamped to 0 for item ${li.item_id}: would have been ${newStock}`,
      );
      warnings.push({
        itemName: li.item_name,
        requested: li.quantity,
        available: item.stock_count,
        unit: li.unit,
      });
    }

    await supabase
      .from("items")
      .update({ stock_count: finalStock })
      .eq("id", li.item_id);

    const reasonLabel =
      document.doc_type === "delivery_note"
        ? "ใบส่งของ"
        : document.doc_type === "tax_invoice_receipt"
          ? "ใบกำกับภาษี/ใบเสร็จรับเงิน"
          : "ใบแจ้งหนี้";

    await supabase.from("stock_movements").insert({
      item_id: li.item_id,
      user_id: userId,
      movement_type: "auto_out",
      qty_base: -li.quantity,
      qty_carton: li.qty_carton ? -li.qty_carton : null,
      carton_unit: li.carton_unit || null,
      balance_after: finalStock,
      reason: `ตัดสต็อกจาก${reasonLabel} ${document.doc_number}`,
      document_id: documentId,
    });
  }

  return { warnings };
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

  const { data: lineItems } = await supabase
    .from("document_line_items")
    .select("*")
    .eq("document_id", voidedDocumentId);

  if (!lineItems) return;

  for (const li of lineItems) {
    if (li.item_type !== "product" || !li.item_id) continue;

    const { data: item } = await supabase
      .from("items")
      .select("stock_count")
      .eq("id", li.item_id)
      .single();

    if (!item) continue;

    const newStock = round3(item.stock_count + li.quantity);

    await supabase
      .from("items")
      .update({ stock_count: newStock })
      .eq("id", li.item_id);

    await supabase.from("stock_movements").insert({
      item_id: li.item_id,
      user_id: userId,
      movement_type: "return_in",
      qty_base: li.quantity,
      qty_carton: li.qty_carton || null,
      carton_unit: li.carton_unit || null,
      balance_after: newStock,
      reason: `คืนสต็อกจากการยกเลิก ${docNumber}`,
      document_id: voidedDocumentId,
    });
  }
}

export async function manualStockIn(
  itemId: string,
  userId: string,
  qtyBase: number,
  reason?: string,
): Promise<void> {
  const { data: item } = await supabase
    .from("items")
    .select("stock_count")
    .eq("id", itemId)
    .single();

  if (!item) return;

  const newStock = round3(item.stock_count + qtyBase);

  await supabase
    .from("items")
    .update({ stock_count: newStock })
    .eq("id", itemId);

  await supabase.from("stock_movements").insert({
    item_id: itemId,
    user_id: userId,
    movement_type: "manual_in",
    qty_base: qtyBase,
    balance_after: newStock,
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
    .select("stock_count")
    .eq("id", itemId)
    .single();

  if (!item) return;

  const newStock = round3(item.stock_count - qtyBase);
  const finalStock = Math.max(0, newStock);

  if (newStock < 0) {
    console.warn(
      `Stock clamped to 0 for item ${itemId}: would have been ${newStock}`,
    );
  }

  await supabase
    .from("items")
    .update({ stock_count: finalStock })
    .eq("id", itemId);

  await supabase.from("stock_movements").insert({
    item_id: itemId,
    user_id: userId,
    movement_type: "manual_out",
    qty_base: -qtyBase,
    balance_after: finalStock,
    reason: reason || "ตัดสต็อกด้วยตนเอง",
    document_id: null,
  });
}
