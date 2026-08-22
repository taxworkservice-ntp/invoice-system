import type { DocumentLineItem, TaxResult } from "../types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampAmount(value: number, max: number): number {
  return Math.max(0, Math.min(round2(value), round2(max)));
}

export type ReceiptInputBasis = "pre_tax" | "gross" | "net_cash";

// Non-VAT-registered documents store a default vat_rate but must never be
// charged VAT — zero the effective rate unless the client is registered.
function effectiveVatRate(vatRate: number, vatRegistered?: boolean): number {
  return vatRegistered === false ? 0 : vatRate;
}

export function convertReceiptInputToPreTax({
  amount,
  basis,
  vatRate,
  whtRate,
  vatRegistered,
}: {
  amount: number;
  basis: ReceiptInputBasis;
  vatRate: number;
  whtRate: number;
  vatRegistered?: boolean;
}) {
  const rate = effectiveVatRate(vatRate, vatRegistered);
  const vatFactor = 1 + rate / 100;
  const netFactor = vatFactor - whtRate / 100;
  if (basis === "gross") return round2(amount / vatFactor);
  if (basis === "net_cash") return round2(amount / netFactor);
  return round2(amount);
}

export function convertReceiptInputAmount({
  amount,
  from,
  to,
  vatRate,
  whtRate,
  vatRegistered,
}: {
  amount: number;
  from: ReceiptInputBasis;
  to: ReceiptInputBasis;
  vatRate: number;
  whtRate: number;
  vatRegistered?: boolean;
}) {
  const rate = effectiveVatRate(vatRate, vatRegistered);
  const preTax = convertReceiptInputToPreTax({ amount, basis: from, vatRate: rate, whtRate });
  const gross = round2(preTax * (1 + rate / 100));
  const netCash = round2(gross - preTax * whtRate / 100);
  if (to === "gross") return gross;
  if (to === "net_cash") return netCash;
  return preTax;
}

export function calculateReceiptAllocation({
  preTaxAmount,
  vatRate,
  whtRate,
  expectedWht = 0,
  previousWht = 0,
  isFullyPaid = false,
  vatRegistered,
}: {
  preTaxAmount: number;
  vatRate: number;
  whtRate: number;
  expectedWht?: number;
  previousWht?: number;
  isFullyPaid?: boolean;
  vatRegistered?: boolean;
}) {
  const rate = effectiveVatRate(vatRate, vatRegistered);
  const preTax = round2(Math.max(0, preTaxAmount));
  const vatAmount = round2(preTax * rate / 100);
  const grossAmount = round2(preTax + vatAmount);
  const expected = Math.max(0, round2(expectedWht));
  const remainingWht = Math.max(0, round2(expected - previousWht));
  const calculatedWht = round2(preTax * whtRate / 100);
  const whtAmount = expected <= 0 || whtRate <= 0
    ? 0
    : isFullyPaid
      ? remainingWht
      : Math.min(remainingWht, calculatedWht);
  const netAmount = round2(grossAmount - whtAmount);

  return { preTax, vatAmount, grossAmount, whtAmount, netAmount };
}

export function calculateReceiptAllocationFromInput({
  amount,
  basis,
  vatRate,
  whtRate,
  expectedWht = 0,
  previousWht = 0,
  isFullyPaid = false,
  vatRegistered,
}: {
  amount: number;
  basis: ReceiptInputBasis;
  vatRate: number;
  whtRate: number;
  expectedWht?: number;
  previousWht?: number;
  isFullyPaid?: boolean;
  vatRegistered?: boolean;
}) {
  return calculateReceiptAllocation({
    preTaxAmount: convertReceiptInputToPreTax({ amount, basis, vatRate, whtRate, vatRegistered }),
    vatRate,
    whtRate,
    expectedWht,
    previousWht,
    isFullyPaid,
    vatRegistered,
  });
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
