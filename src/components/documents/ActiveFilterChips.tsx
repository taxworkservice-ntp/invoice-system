import { X } from "lucide-react";
import { DOC_TYPE_LABELS, PAYMENT_METHOD_LABELS, STATUS_LABELS } from "../../constants";
import type { DocumentFilters } from "../../lib/documentFilters";
import { formatCurrency } from "../../lib/format";

const MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const STATUS_FILTER_LABELS: Record<string, string> = {
  processing: "กำลังดำเนินการ",
  done: "เสร็จแล้ว",
  overdue: "เกินกำหนด",
};

const AGING_LABELS: Record<string, string> = {
  "0-30": "ค้าง 0-30 วัน",
  "31-60": "ค้าง 31-60 วัน",
  "61-90": "ค้าง 61-90 วัน",
  "90+": "ค้างเกิน 90 วัน",
  "due-soon": "ครบกำหนดใน 7 วัน",
};

interface ActiveFilterChipsProps {
  filters: DocumentFilters;
  customerName?: string | null;
  onRemove: (patch: Partial<DocumentFilters>) => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({
  filters,
  customerName,
  onRemove,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips: { key: string; label: string; clear: Partial<DocumentFilters> }[] = [];

  if (filters.q) chips.push({ key: "q", label: `ค้นหา: ${filters.q}`, clear: { q: "" } });
  if (filters.type !== "all")
    chips.push({ key: "type", label: DOC_TYPE_LABELS[filters.type].th, clear: { type: "all" } });
  if (filters.status !== "all")
    chips.push({
      key: "status",
      label: STATUS_FILTER_LABELS[filters.status] || STATUS_LABELS[filters.status as keyof typeof STATUS_LABELS] || filters.status,
      clear: { status: "all" },
    });
  if (filters.month !== "all")
    chips.push({ key: "month", label: `เดือน ${MONTH_LABELS[Number(filters.month) - 1] || filters.month}`, clear: { month: "all" } });
  if (filters.year !== "all") chips.push({ key: "year", label: `ปี ${filters.year}`, clear: { year: "all" } });
  if (filters.from) chips.push({ key: "from", label: `จาก ${filters.from}`, clear: { from: "" } });
  if (filters.to) chips.push({ key: "to", label: `ถึง ${filters.to}`, clear: { to: "" } });
  if (filters.amountMin != null)
    chips.push({ key: "amountMin", label: `≥ ฿${formatCurrency(filters.amountMin)}`, clear: { amountMin: null } });
  if (filters.amountMax != null)
    chips.push({ key: "amountMax", label: `≤ ฿${formatCurrency(filters.amountMax)}`, clear: { amountMax: null } });
  if (filters.aging !== "all")
    chips.push({ key: "aging", label: AGING_LABELS[filters.aging] || filters.aging, clear: { aging: "all" } });
  if (filters.customerId)
    chips.push({ key: "customerId", label: customerName || "ลูกค้าที่เลือก", clear: { customerId: null } });
  if (filters.item) chips.push({ key: "item", label: `รายการ: ${filters.item}`, clear: { item: "" } });
  if (filters.method !== "all")
    chips.push({ key: "method", label: PAYMENT_METHOD_LABELS[filters.method] || filters.method, clear: { method: "all" } });
  if (filters.vatOnly) chips.push({ key: "vatOnly", label: "จด VAT", clear: { vatOnly: false } });
  if (filters.whtOnly) chips.push({ key: "whtOnly", label: "มีหัก ณ ที่จ่าย", clear: { whtOnly: false } });
  if (filters.hideVoided) chips.push({ key: "hideVoided", label: "ซ่อนที่ยกเลิก", clear: { hideVoided: false } });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-primary-border bg-primary-soft py-1 pl-2.5 pr-1 text-label text-primary-deep md:py-0.5"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`ลบตัวกรอง ${chip.label}`}
            onClick={() => onRemove(chip.clear)}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-primary/15 md:h-4 md:w-4"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 inline-flex min-h-11 items-center text-label font-medium text-primary hover:underline md:min-h-0"
      >
        ล้างทั้งหมด
      </button>
    </div>
  );
}
