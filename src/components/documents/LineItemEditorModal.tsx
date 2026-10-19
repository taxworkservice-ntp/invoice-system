import { AlertTriangle, Eye, EyeOff, History } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { NumericInput } from "../ui/NumericInput";
import { CatalogAutocomplete } from "../CatalogAutocomplete";
import { PriceReviewControl } from "./PriceReviewControl";
import { priceDeviation, suggestedUnitPrice, type DocumentLine } from "../../lib/documentLine";
import { LineUnitControl } from "./LineUnitControl";
import { calculateLineAmounts } from "../../lib/tax";
import { formatCurrency } from "../../lib/format";
import type { Item } from "../../types";

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatQty(value: number) {
  return round3(value).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/**
 * Line shape the editor works with. Both line types — `DeliveryLine` in the
 * quotation flow and `LineItemForm` in the deal form — extend this, so the
 * editor is guaranteed to accept either.
 */
export type EditableDeliveryLine = DocumentLine;

/** Quotation-side history shown under the name (null = free line, no source). */
export interface DeliverySourceSummary {
  quoted: number;
  delivered: number;
  pending: number;
  unit: string;
}

interface LineItemEditorModalProps {
  open: boolean;
  /** The line being edited — always current (parent state flows straight in). */
  line: EditableDeliveryLine | null;
  isNew: boolean;
  /** Remaining quantity from the quotation, null when the line has no source. */
  remaining: number | null;
  over: boolean;
  requirePriceReview: boolean;
  /** Amount mode hides prices on the PDF — prices here are internal only. */
  pricesInternalOnly: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<EditableDeliveryLine>) => void;
  onQuantity: (value: string) => void;
  /** Shown as ทั้งหมด — omitted when the form has no remaining concept. */
  onSetRemaining?: () => void;
  onDelete: () => void;
  /** "บันทึกและเพิ่มรายการถัดไป" — only offered for freshly added lines. */
  onSaveAndAddAnother?: () => void;
  /** Catalog for name autocomplete (shared stock catalog). */
  items: Item[];
  onNameChange: (value: string) => void;
  onPickCatalogItem: (item: Item) => void;
  onCreateCatalogItem: (input: {
    name: string;
    unit_price: number;
    base_unit: string;
    item_type: "product" | "service";
  }) => Promise<Item>;
  /** Quotation-side history (DN-from-quotation only). */
  sourceSummary?: DeliverySourceSummary | null;
  /**
   * Opens the full catalog item form (SKU, units, carton config, job details)
   * seeded with the typed name. Preferred over the minimal inline create.
   */
  onFullCreateCatalogItem?: () => void;
  /** Whether this user may create catalog items at all. */
  canCreateCatalogItem?: boolean;
  /** Workspace setting: hide the discount field (stored discounts stay intact). */
  allowDiscount?: boolean;
  /** Extra form-specific sections (carton units, job details, …). */
  extra?: React.ReactNode;
  /**
   * Price suggestion rendered directly under the price field ("sold to this
   * customer before at ฿x"). It belongs beside the field it changes, not in the
   * catch-all `extra` area at the bottom.
   */
  priceHint?: React.ReactNode;
  /**
   * Opens the price-history sheet. Rendered beside the price field whenever the
   * host provides it — deliberately independent of `requirePriceReview`, since
   * the lookup is useful on every line-item document (not just delivery notes).
   */
  onOpenPriceHistory?: () => void;
  /**
   * Catalog-price deviation threshold in percent (`price_deviation_warn_pct`).
   * 0 disables the warning. Shared rule — see `src/lib/documentLine.ts`.
   */
  priceWarnPct?: number;
}

/**
 * Single editor for a delivery-note line. The table on the page stays
 * read-only (mirroring the printed PDF); everything editable lives here.
 * All edits apply live to the parent's line state — บันทึก just closes.
 */
export function LineItemEditorModal({
  open,
  line,
  isNew,
  remaining,
  over,
  requirePriceReview,
  pricesInternalOnly,
  onClose,
  onPatch,
  onQuantity,
  onSetRemaining,
  onDelete,
  onSaveAndAddAnother,
  items,
  onNameChange,
  onPickCatalogItem,
  onCreateCatalogItem,
  sourceSummary = null,
  onFullCreateCatalogItem,
  canCreateCatalogItem = true,
  allowDiscount = true,
  extra = null,
  priceHint = null,
  priceWarnPct = 0,
  onOpenPriceHistory,
}: LineItemEditorModalProps) {
  if (!open || !line) return null;

  // No silent pass-through: while review is required and the price is
  // unconfirmed, the modal's save buttons stay disabled until ยืนยันราคา.
  const needsPriceConfirm = requirePriceReview && !line.price_confirmed;

  // Shared with the deal form: warn when the typed price drifts from the
  // catalog price for the line's unit (carton-aware). Non-blocking.
  const catalogItem = line.item_id ? items.find((item) => item.id === line.item_id) : null;
  const catalogExpectedPrice = catalogItem
    ? priceDeviation({
        unitPrice: line.unit_price,
        baseUnitPrice: catalogItem.unit_price,
        unit: line.unit,
        cartonUnit: line.carton_unit,
        qtyPerCarton: line.qty_carton,
        warnPct: priceWarnPct,
      })
    : null;

  const lineCalc = calculateLineAmounts({
    unit_price: line.unit_price,
    quantity: line.quantity,
    discount_percent: line.discount_percent ?? 0,
  });
  const itemSku = line.item_sku ?? null;
  const unitLabel = sourceSummary?.unit ?? line.unit;
  const pct =
    sourceSummary && sourceSummary.quoted > 0
      ? Math.min(
          100,
          Math.round(
            ((sourceSummary.delivered + sourceSummary.pending) / sourceSummary.quoted) * 100,
          ),
        )
      : 0;

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "เพิ่มรายการ" : "แก้ไขรายการ"}>
      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-label font-medium text-ink-600">
            ชื่อสินค้า / รายละเอียด
          </span>
          <CatalogAutocomplete
            items={items}
            value={line.item_name}
            onChange={onNameChange}
            onSelect={onPickCatalogItem}
            matched={line.item_id != null}
            placeholder="พิมพ์ชื่อสินค้าหรือบริการ — เลือกจากแค็ตตาล็อกหรือพิมพ์ใหม่"
            createDefaultUnit={line.unit || "ชิ้น"}
            onCreate={canCreateCatalogItem ? onCreateCatalogItem : undefined}
            onFullCreate={canCreateCatalogItem ? onFullCreateCatalogItem : undefined}
          />
          {itemSku && <div className="mt-0.5 text-label text-ink-500">SKU: {itemSku}</div>}
        </div>

        {sourceSummary && (
          <div>
            <div className="text-label leading-5 text-ink-500">
              เสนอ {formatQty(sourceSummary.quoted)} · ส่งแล้ว {formatQty(sourceSummary.delivered)}
              {sourceSummary.pending > 0
                ? ` · ร่างค้าง ${formatQty(sourceSummary.pending)}`
                : ""} ·{" "}
              <span
                className={`font-medium ${remaining != null && remaining < 0 ? "text-red-700" : "text-ink-800"}`}
              >
                คงเหลือให้ส่ง {formatQty(Math.max(0, remaining ?? 0))} {unitLabel}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-line-soft" aria-hidden>
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {catalogItem?.carton_unit && Number(catalogItem.qty_per_carton) > 0 && (
          <LineUnitControl
            baseUnit={catalogItem.base_unit || line.unit}
            cartonUnit={catalogItem.carton_unit}
            qtyPerCarton={Number(catalogItem.qty_per_carton)}
            unit={line.unit}
            quantity={line.quantity}
            unitLabel={unitLabel}
            stockCount={catalogItem.stock_count}
            onSelectUnit={(nextUnit) =>
              onPatch({
                unit: nextUnit,
                carton_unit: catalogItem.carton_unit,
                // Mirror the deal form: switching unit re-prices from the catalog.
                unit_price: suggestedUnitPrice(
                  catalogItem.unit_price,
                  nextUnit,
                  catalogItem.carton_unit,
                  Number(catalogItem.qty_per_carton),
                ),
              })
            }
          />
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <NumericInput
              label="จำนวนส่ง"
              value={line.quantity}
              onValueChange={(next) => onQuantity(String(next))}
              maxFractionDigits={3}
            />
          </div>
          <div className="w-24">
            <Input
              label="หน่วย"
              value={line.unit}
              onChange={(event) => onPatch({ unit: event.target.value })}
              placeholder="ชิ้น"
            />
          </div>
          {onSetRemaining && remaining != null && remaining > 0 && line.quantity !== remaining && (
            <button
              type="button"
              onClick={onSetRemaining}
              className="mb-0.5 rounded-full border border-primary-border bg-primary-soft px-2.5 py-1 text-label font-medium text-primary-deep hover:bg-primary-soft/70"
            >
              ทั้งหมด {formatQty(remaining)}
            </button>
          )}
          <div className="mb-1 ml-auto text-right">
            <div className="text-label font-medium tabular-nums text-ink-700">
              ฿{formatCurrency(lineCalc.lineTotal)}
            </div>
            <div className="text-label tabular-nums text-ink-400">
              {formatQty(line.quantity)} × ฿{formatCurrency(line.unit_price)}
            </div>
          </div>
        </div>

        {over && (
          <div className="text-label font-medium text-amber-800">
            เกินคงเหลือ {formatQty(round3(line.quantity - Math.max(0, remaining ?? 0)))} {unitLabel}{" "}
            — ตรวจสอบกับลูกค้าก่อนส่ง
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <NumericInput
            label={`ราคา/หน่วย${requirePriceReview && !line.price_confirmed ? " • ต้องยืนยัน" : ""}${pricesInternalOnly ? " (เก็บไว้คิดบิลต่อ)" : ""}`}
            value={line.unit_price}
            onValueChange={(next) =>
              onPatch({ unit_price: Math.max(0, next), price_confirmed: true })
            }
            maxFractionDigits={2}
            minFractionDigits={2}
          />
          {allowDiscount && (
            <NumericInput
              label="ส่วนลด %"
              value={line.discount_percent ?? 0}
              onValueChange={(next) => onPatch({ discount_percent: Math.max(0, next) })}
              maxFractionDigits={2}
              maxValue={100}
            />
          )}
        </div>

        {(priceHint || onOpenPriceHistory) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {priceHint}
            {onOpenPriceHistory ? (
              <button
                type="button"
                onClick={onOpenPriceHistory}
                className="ml-auto inline-flex items-center gap-1 text-label font-medium text-primary transition-colors hover:underline"
              >
                <History className="h-3.5 w-3.5" />
                ประวัติราคาขาย
              </button>
            ) : null}
          </div>
        )}

        {catalogExpectedPrice != null && (
          <div className="flex items-start gap-1.5 rounded-control border border-warning-border bg-warning-soft px-3 py-2 text-label leading-4 text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              ต่างจากราคาแค็ตตาล็อก ฿{formatCurrency(catalogExpectedPrice)}/{line.unit}{" "}
              — ตรวจสอบก่อนยืนยัน
            </span>
          </div>
        )}

        {requirePriceReview && (
          <PriceReviewControl
            className={
              line.price_confirmed
                ? "rounded-control border border-line bg-paper-field px-3 py-2"
                : "rounded-control border border-amber-300 bg-amber-50/60 px-3 py-2"
            }
            confirmed={line.price_confirmed}
            onConfirm={() => onPatch({ price_confirmed: true })}
            onUnconfirm={() => onPatch({ price_confirmed: false })}
            confirmLabel={`ยืนยันราคา ฿${formatCurrency(line.unit_price)}`}
            hint="แก้ตัวเลขราคา = ยืนยันอัตโนมัติ"
          />
        )}

        <Input
          label="หมายเหตุของรายการ"
          value={line.line_note}
          onChange={(event) => onPatch({ line_note: event.target.value })}
          placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
        />

        {extra}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPatch({ hide_amounts_on_print: !line.hide_amounts_on_print })}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-label transition-colors ${
              line.hide_amounts_on_print
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-card-border bg-white text-ink-500 hover:border-primary hover:text-primary"
            }`}
            title={
              line.hide_amounts_on_print ? "คลิกเพื่อแสดงราคาในเอกสาร" : "คลิกเพื่อซ่อนราคาในเอกสาร"
            }
          >
            {line.hide_amounts_on_print ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {line.hide_amounts_on_print ? "ซ่อนราคาแล้ว" : "ซ่อนราคาเฉพาะรายการนี้"}
          </button>
        </div>
        {pricesInternalOnly && (
          <p className="-mt-1 text-label leading-5 text-ink-400">
            โหมดนี้ซ่อนราคาใน PDF — ราคาด้านบนมีไว้คิดยอดออกบิลต่อเท่านั้น
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDelete}
          className="mr-auto text-label font-medium text-red-600 hover:text-red-700"
        >
          ลบรายการนี้
        </button>
        {needsPriceConfirm && (
          <span className="w-full text-right text-label font-medium text-amber-800">
            กรุณากดยืนยันราคาด้านบนก่อนบันทึก
          </span>
        )}
        <Button variant="secondary" onClick={onClose}>
          ยกเลิก
        </Button>
        {isNew && onSaveAndAddAnother ? (
          <Button variant="secondary" onClick={onSaveAndAddAnother} disabled={needsPriceConfirm}>
            บันทึกและเพิ่มต่อ
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={needsPriceConfirm}>
          บันทึก
        </Button>
      </div>
    </Modal>
  );
}
