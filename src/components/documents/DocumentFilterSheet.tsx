import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input, Select } from "../ui/Input";
import { Button } from "../ui/Button";
import { EMPTY_FILTERS, type AgingBucket, type DocumentFilters } from "../../lib/documentFilters";
import { PAYMENT_METHOD_LABELS } from "../../constants";

interface CustomerOption {
  id: string;
  name: string;
}

interface DocumentFilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: DocumentFilters;
  customers: CustomerOption[];
  itemNames: string[];
  onApply: (filters: DocumentFilters) => void;
}

const AGING_OPTIONS: { value: AgingBucket; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "0-30", label: "ค้าง 0-30 วัน" },
  { value: "31-60", label: "31-60 วัน" },
  { value: "61-90", label: "61-90 วัน" },
  { value: "90+", label: "เกิน 90 วัน" },
  { value: "due-soon", label: "ครบกำหนดใน 7 วัน" },
];

function parseAmount(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-label font-semibold text-ink-300">
      {children}
    </div>
  );
}

/**
 * Right-side drawer holding every advanced document filter. Toolbar keeps the
 * high-frequency controls; this sheet owns date range, money, aging, customer,
 * item and payment flags.
 */
export function DocumentFilterSheet({
  open,
  onClose,
  filters,
  customers,
  itemNames,
  onApply,
}: DocumentFilterSheetProps) {
  const [draft, setDraft] = useState<DocumentFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const patch = (values: Partial<DocumentFilters>) => setDraft((prev) => ({ ...prev, ...values }));

  function resetAll() {
    setDraft({ ...EMPTY_FILTERS });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 animate-overlay-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ตัวกรองเอกสาร"
        className="relative flex h-full w-full max-w-md flex-col bg-white animate-drawer-in"
      >
        <div className="flex items-center justify-between border-b border-card-border px-5 py-4">
          <h2 className="text-title font-semibold text-ink-900">ตัวกรองเอกสาร</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-600 md:h-8 md:w-8"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <SectionTitle>ช่วงวันที่</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                label="จากวันที่"
                value={draft.from}
                onChange={(event) => patch({ from: event.target.value })}
              />
              <Input
                type="date"
                label="ถึงวันที่"
                value={draft.to}
                onChange={(event) => patch({ to: event.target.value })}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>จำนวนเงิน (บาท)</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                label="ต่ำสุด"
                placeholder="0"
                value={draft.amountMin ?? ""}
                onChange={(event) => patch({ amountMin: parseAmount(event.target.value) })}
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                label="สูงสุด"
                placeholder="ไม่จำกัด"
                value={draft.amountMax ?? ""}
                onChange={(event) => patch({ amountMax: parseAmount(event.target.value) })}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>อายุหนี้</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {AGING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patch({ aging: option.value })}
                  className={`rounded-full border px-3 py-1 text-label transition-colors ${ draft.aging === option.value ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-600 hover:border-line-strong" }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle>ลูกค้า</SectionTitle>
            <Select
              value={draft.customerId ?? "all"}
              onChange={(event) =>
                patch({ customerId: event.target.value === "all" ? null : event.target.value })
              }
            >
              <option value="all">ลูกค้าทั้งหมด</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </section>

          <section className="space-y-2">
            <SectionTitle>รายการสินค้า</SectionTitle>
            <Input
              list="document-filter-item-options"
              placeholder="ชื่อสินค้า หรือรหัสสินค้า"
              value={draft.item}
              onChange={(event) => patch({ item: event.target.value })}
            />
            <datalist id="document-filter-item-options">
              {itemNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </section>

          <section className="space-y-2">
            <SectionTitle>การชำระเงินและภาษี</SectionTitle>
            <Select
              label="วิธีชำระเงิน"
              value={draft.method}
              onChange={(event) => patch({ method: event.target.value })}
            >
              <option value="all">ทั้งหมด</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-body text-ink-700">
              <input
                type="checkbox"
                checked={draft.vatOnly}
                onChange={(event) => patch({ vatOnly: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              เฉพาะเอกสารที่จด VAT
            </label>
            <label className="flex items-center gap-2 text-body text-ink-700">
              <input
                type="checkbox"
                checked={draft.whtOnly}
                onChange={(event) => patch({ whtOnly: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              เฉพาะเอกสารที่มีหัก ณ ที่จ่าย
            </label>
            <label className="flex items-center gap-2 text-body text-ink-700">
              <input
                type="checkbox"
                checked={draft.hideVoided}
                onChange={(event) => patch({ hideVoided: event.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              ซ่อนเอกสารที่ยกเลิก
            </label>
          </section>
        </div>

        <div className="flex gap-2 border-t border-card-border px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={resetAll}>
            ล้างทั้งหมด
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            ใช้ตัวกรอง
          </Button>
        </div>
      </div>
    </div>
  );
}
