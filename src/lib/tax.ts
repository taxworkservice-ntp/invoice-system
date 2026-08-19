import type { DocumentLineItem, TaxResult } from "../types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampAmount(value: number, max: number): number {
  return Math.max(0, Math.min(round2(value), round2(max)));
}

export function calculateReceiptWhtAmount({
  expectedWht,
  netPayable,
  paymentAmount,
  previousWht = 0,
  isFullyPaid = false,
}: {
  expectedWht: number;
  netPayable: number;
  paymentAmount: number;
  previousWht?: number;
  isFullyPaid?: boolean;
}) {
  const expected = Math.max(0, round2(expectedWht));
  const remaining = Math.max(0, round2(expected - previousWht));
  if (expected <= 0 || netPayable <= 0 || paymentAmount <= 0) return 0;
  if (isFullyPaid) return remaining;
  // expectedWht comes from the source document's taxable subtotal. The net
  // payable is only the allocation base for partial receipts, never the WHT base.
  return Math.min(remaining, round2(expected * paymentAmount / netPayable));
}

type TaxLineInput = Partial<Pick<DocumentLineItem, "unit_price" | "quantity" | "discount_percent" | "discount_amount" | "line_total">>;

interface DiscountOptions {
  discountPercent?: number;
  discountAmount?: number;
}

export function calculateLineAmounts(lineItem: TaxLineInput) {
  const unitPrice = Number(lineItem.unit_price || 0);
  const quantity = Number(lineItem.quantity || 0);
  const baseAmount =
    unitPrice > 0 || quantity > 0
      ? round2(unitPrice * quantity)
      : round2(Number(lineItem.line_total || 0));
  const discountPercent = Number(lineItem.discount_percent || 0);
  const explicitDiscountAmount = Number(lineItem.discount_amount || 0);
  const discountAmount = clampAmount(
    explicitDiscountAmount > 0 && discountPercent <= 0
      ? explicitDiscountAmount
      : baseAmount * discountPercent / 100,
    baseAmount,
  );
  const lineTotal = round2(baseAmount - discountAmount);

  return {
    grossTotal: baseAmount,
    discountPercent,
    discountAmount,
    lineTotal,
  };
}

export function calculateTax(
  lineItems: TaxLineInput[],
  vatRegistered: boolean,
  vatRate: number,
  whtRate: number,
  discount: DiscountOptions = {},
): TaxResult {
  const grossSubtotal = round2(
    lineItems.reduce((sum, item) => sum + calculateLineAmounts(item).grossTotal, 0)
  );
  const lineDiscountAmount = round2(
    lineItems.reduce((sum, item) => sum + calculateLineAmounts(item).discountAmount, 0)
  );
  const subtotalBeforeDiscount = round2(grossSubtotal - lineDiscountAmount);
  const discountPercent = Number(discount.discountPercent || 0);
  const explicitDiscountAmount = Number(discount.discountAmount || 0);
  const discountAmount = clampAmount(
    explicitDiscountAmount > 0 && discountPercent <= 0
      ? explicitDiscountAmount
      : subtotalBeforeDiscount * discountPercent / 100,
    subtotalBeforeDiscount,
  );
  const subtotal = round2(subtotalBeforeDiscount - discountAmount);
  const vatAmount = vatRegistered ? round2(subtotal * vatRate / 100) : 0;
  const total = round2(subtotal + vatAmount);
  const whtAmount = whtRate > 0 ? round2(subtotal * whtRate / 100) : 0;
  const netPayable = round2(total - whtAmount);
  return {
    grossSubtotal,
    lineDiscountAmount,
    subtotalBeforeDiscount,
    discountAmount,
    subtotal,
    vatAmount,
    total,
    whtAmount,
    netPayable,
  };
}

export { round2 };
