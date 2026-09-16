import { formatCurrency } from "../../lib/format";

interface Props {
  baseUnit: string;
  cartonUnit: string;
  qtyPerCarton: number;
  unitPrice: number;
}

export function CartonPreview({
  baseUnit,
  cartonUnit,
  qtyPerCarton,
  unitPrice,
}: Props) {
  if (qtyPerCarton <= 0) return null;

  const cartonPrice = unitPrice * qtyPerCarton;

  return (
    <div className="bg-sent-bg rounded-control px-3 py-2 space-y-0.5 text-label text-primary-deep">
      <div>
        1 {cartonUnit} = {qtyPerCarton} {baseUnit}
      </div>
      <div>
        ราคาต่อ{cartonUnit} = ฿ {formatCurrency(cartonPrice)}
      </div>
    </div>
  );
}
