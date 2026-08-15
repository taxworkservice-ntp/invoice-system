import { useMemo, useState } from "react";
import type { ElementType } from "react";
import { ChevronRight, ClipboardList, CreditCard, FileStack, FileText, Gauge, GripHorizontal, ReceiptText, Truck } from "lucide-react";
import { Modal } from "../ui/Modal";

interface NewDealSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: "quotation" | "invoice" | "tax_invoice_receipt" | "delivery_note" | "billing_note" | "invoice_from_delivery_notes" | "utility_bill") => void;
  vatRegistered?: boolean;
}

type NewDealType = "quotation" | "invoice" | "tax_invoice_receipt" | "delivery_note" | "billing_note" | "invoice_from_delivery_notes" | "utility_bill";

const GROUPS: {
  title: string;
  options: {
    icon: ElementType;
    title: string;
    subtitle: string;
    type: NewDealType;
    recommended?: boolean;
  }[];
}[] = [
  {
    title: "ขายแบบปกติ",
    options: [
      { icon: ClipboardList, title: "ส่งใบเสนอราคาก่อน", subtitle: "Flow ครบ: เสนอราคา → ส่งของถ้าต้องใช้ → ออกบิล → วางบิลถ้าต้องใช้", type: "quotation", recommended: true },
      { icon: FileText, title: "ข้ามใบเสนอราคา ออกใบแจ้งหนี้ทันที", subtitle: "ใช้เมื่อตกลงงานแล้ว และไม่ต้องมีใบเสนอราคาในระบบ", type: "invoice" },
      { icon: CreditCard, title: "รับเงินแล้ว ออกใบกำกับภาษี/ใบเสร็จ", subtitle: "ชำระทันทีและปิดงานในเอกสารเดียว", type: "tax_invoice_receipt" },
    ],
  },
  {
    title: "ส่งของก่อน ออกบิลทีหลัง",
    options: [
      { icon: Truck, title: "สร้างใบส่งของฉบับร่าง", subtitle: "ใช้เป็นทางลัดเมื่อต้องเตรียมส่งของก่อน ไม่ผูกกับใบเสนอราคา", type: "delivery_note" },
      { icon: FileStack, title: "รวมใบส่งของเพื่อออกใบแจ้งหนี้", subtitle: "ใช้สำหรับออกบิลรายรอบ เช่น สิ้นเดือน", type: "invoice_from_delivery_notes" },
    ],
  },
  {
    title: "ออกบิลตามรอบ",
    options: [
      { icon: Gauge, title: "ออกบิลประจำรอบ", subtitle: "ค่าน้ำ ค่าไฟ ค่าเช่า หรือค่าบริการรายเดือน", type: "utility_bill" },
      { icon: ReceiptText, title: "รวมใบแจ้งหนี้เพื่อออกใบวางบิล", subtitle: "ใช้เมื่อลูกค้าต้องการวางบิลก่อนชำระเงิน", type: "billing_note" },
    ],
  },
];

const RECENT_OPTIONS_KEY = "new_deal_recent_options";
const QUICK_OPTION_TYPES: NewDealType[] = ["quotation", "invoice", "tax_invoice_receipt"];

export function NewDealSheet({ open, onClose, onSelect, vatRegistered = true }: NewDealSheetProps) {
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [recentTypes, setRecentTypes] = useState<NewDealType[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_OPTIONS_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((type): type is NewDealType => GROUPS.some((group) => group.options.some((option) => option.type === type))) : [];
    } catch {
      return [];
    }
  });

  const allOptions = useMemo(() => GROUPS.flatMap((group) => group.options), []);
  const quickOptions = useMemo(() => {
    const recent = recentTypes
      .map((type) => allOptions.find((option) => option.type === type))
      .filter((option): option is (typeof allOptions)[number] => Boolean(option));
    const fallback = QUICK_OPTION_TYPES
      .map((type) => allOptions.find((option) => option.type === type))
      .filter((option): option is (typeof allOptions)[number] => Boolean(option));
    return [...recent, ...fallback].filter((option, index, options) => options.findIndex((item) => item.type === option.type) === index).slice(0, 3);
  }, [allOptions, recentTypes]);

  function handleSelect(type: NewDealType) {
    const nextRecent = [type, ...recentTypes.filter((item) => item !== type)].slice(0, 3);
    setRecentTypes(nextRecent);
    localStorage.setItem(RECENT_OPTIONS_KEY, JSON.stringify(nextRecent));
    onSelect(type);
  }

  function optionTitle(option: (typeof allOptions)[number]) {
    return option.type === "tax_invoice_receipt" && !vatRegistered
      ? "รับเงินแล้ว ออกใบเสร็จรับเงิน"
      : option.title;
  }

  function optionSubtitle(option: (typeof allOptions)[number]) {
    return option.type === "tax_invoice_receipt" && !vatRegistered
      ? "ชำระทันที ปิดงานในเอกสารเดียว และไม่มี VAT"
      : option.subtitle;
  }

  function renderOption(option: (typeof allOptions)[number]) {
    const Icon = option.icon;
    return (
      <button
        key={option.type}
        onClick={() => handleSelect(option.type)}
        className="w-full px-3 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-page-bg focus:outline-none focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-[#1A1A18]">{optionTitle(option)}</div>
              {option.recommended && (
                <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">แนะนำ</span>
              )}
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-gray-500">{optionSubtitle(option)}</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
        </div>
      </button>
    );
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="pb-1">
        <div className="mb-3 flex justify-center">
          <GripHorizontal className="h-5 w-8 text-[#E8E6DF]" />
        </div>
        <div className="px-1 pb-1 text-base font-semibold text-[#1A1A18]">เริ่มงานแบบไหน?</div>
        <div className="px-1 text-xs leading-5 text-gray-500">เลือกตามสิ่งที่ต้องทำตอนนี้ ระบบจะพาไปขั้นตอนถัดไปให้</div>
        <div className="mt-4">
          <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">เริ่มเร็ว</div>
          <div className="divide-y divide-card-border rounded-xl border border-card-border bg-white">
            {quickOptions.map(renderOption)}
          </div>
          {recentTypes.length > 0 && <div className="mt-1 px-1 text-[10px] text-gray-400">เรียงจากรายการที่คุณใช้ล่าสุด</div>}
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAllOptions((current) => !current)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-600 hover:bg-page-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-expanded={showAllOptions}
          >
            <span>{showAllOptions ? "ซ่อนตัวเลือกเพิ่มเติม" : "ตัวเลือกเพิ่มเติม"}</span>
            <ChevronRight className={`h-4 w-4 transition-transform ${showAllOptions ? "rotate-90" : ""}`} />
          </button>
          {showAllOptions && (
            <div className="mt-2 space-y-4">
              {GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{group.title}</div>
                  <div className="divide-y divide-card-border rounded-xl border border-card-border bg-white">
                    {group.options.map(renderOption)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={onClose} className="mt-2 w-full py-4 text-center text-sm text-gray-500">
          ยกเลิก
        </button>
      </div>
    </Modal>
  );
}
