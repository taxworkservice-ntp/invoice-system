import { ChevronRight, GripHorizontal } from "lucide-react";
import { Modal } from "../ui/Modal";

interface NewDealSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: "quotation" | "invoice" | "tax_invoice_receipt" | "delivery_note" | "billing_note" | "invoice_from_delivery_notes") => void;
}

const OPTIONS = [
  {
    icon: "🧾",
    title: "ส่งใบเสนอราคาก่อน",
    subtitle: "เหมาะเมื่อยังไม่ได้ตกลงราคา",
    type: "quotation" as const,
  },
  {
    icon: "🚚",
    title: "ออกใบส่งของ",
    subtitle: "ใช้เมื่อส่งสินค้าก่อน แล้วค่อยรวมออกใบแจ้งหนี้ภายหลัง",
    type: "delivery_note" as const,
  },
  {
    icon: "📄",
    title: "ออกใบแจ้งหนี้ทันที",
    subtitle: "ตกลงราคาแล้ว พร้อมเรียกเก็บเงิน",
    type: "invoice" as const,
  },
  {
    icon: "💳",
    title: "รับเงินแล้ว ออกใบกำกับภาษี/ใบเสร็จรับเงินเลย",
    subtitle: "ใช้เมื่อชำระทันทีและต้องการปิดงานในเอกสารเดียว",
    type: "tax_invoice_receipt" as const,
  },
  {
    icon: "📦",
    title: "รวมใบส่งของเพื่อออกใบแจ้งหนี้",
    subtitle: "ใช้เมื่อส่งของหลายครั้งแล้วค่อยออกบิลรวม",
    type: "invoice_from_delivery_notes" as const,
  },
  {
    icon: "📋",
    title: "รวมใบแจ้งหนี้เพื่อออกใบวางบิล",
    subtitle: "ใช้เมื่อจะวางบิลหลายใบพร้อมกัน",
    type: "billing_note" as const,
  },
];

export function NewDealSheet({ open, onClose, onSelect }: NewDealSheetProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="pb-1">
        <div className="mb-3 flex justify-center">
          <GripHorizontal className="h-5 w-8 text-[#E8E6DF]" />
        </div>
        <div className="px-1 pb-2 text-base font-semibold text-[#1A1A18]">คุณต้องการทำอะไร?</div>
        <div className="mt-1 divide-y divide-card-border">
          {OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => onSelect(option.type)}
              className="w-full rounded-lg px-1 py-4 text-left transition-colors hover:bg-page-bg"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl leading-none">{option.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#1A1A18]">{option.title}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{option.subtitle}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-2 w-full py-4 text-center text-sm text-gray-500">
          ยกเลิก
        </button>
      </div>
    </Modal>
  );
}
