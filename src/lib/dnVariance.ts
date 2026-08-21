const EPS = 1e-9;

export type VarianceSourceKind = "delivery_note" | "quotation";

export type DnVarianceInput = {
  deliveredQty: number | null | undefined;
  billedQty: number;
  unit: string;
  dnUnitPrice: number | null | undefined;
  unitPrice: number;
  dnDocNumber?: string;
  sourceKind?: VarianceSourceKind;
};

export function getSourceVarianceLabel(kind: VarianceSourceKind | null | undefined): string {
  return kind === "quotation" ? "ส่วนต่างจากใบเสนอราคา" : "ส่วนต่างจากใบส่งของ";
}

export function hasDnVariance(input: DnVarianceInput): boolean {
  const { deliveredQty, billedQty, dnUnitPrice, unitPrice } = input;
  const qtyReduced =
    deliveredQty != null && billedQty < Number(deliveredQty) - EPS;
  const priceChanged =
    dnUnitPrice != null && Math.abs(Number(dnUnitPrice) - unitPrice) > EPS;
  return qtyReduced || priceChanged;
}

export function getDnVarianceParts(input: DnVarianceInput): string[] {
  const { deliveredQty, billedQty, unit, dnUnitPrice, unitPrice, dnDocNumber, sourceKind } =
    input;
  const parts: string[] = [];
  if (deliveredQty != null && billedQty < Number(deliveredQty) - EPS) {
    const ref = dnDocNumber ? `อ้างอิง ${dnDocNumber}: ` : "";
    const offeredWord = sourceKind === "quotation" ? "เสนอราคา" : "ส่ง";
    parts.push(
      `${ref}${offeredWord} ${String(Number(deliveredQty))} ${unit} / เรียกเก็บ ${String(Number(billedQty))} ${unit}`,
    );
  }
  if (dnUnitPrice != null && Math.abs(Number(dnUnitPrice) - unitPrice) > EPS) {
    parts.push(
      `ราคาปรับจาก ${formatVarianceCurrency(Number(dnUnitPrice))} เป็น ${formatVarianceCurrency(unitPrice)} บาท`,
    );
  }
  return parts;
}

function formatVarianceCurrency(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
