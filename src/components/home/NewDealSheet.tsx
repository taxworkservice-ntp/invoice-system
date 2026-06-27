import type { ElementType } from "react";
import { ChevronRight, ClipboardList, CreditCard, FileStack, FileText, GripHorizontal, ReceiptText, Truck } from "lucide-react";
import { Modal } from "../ui/Modal";

interface NewDealSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: "quotation" | "invoice" | "tax_invoice_receipt" | "delivery_note" | "billing_note" | "invoice_from_delivery_notes") => void;
}

type NewDealType = "quotation" | "invoice" | "tax_invoice_receipt" | "delivery_note" | "billing_note" | "invoice_from_delivery_notes";

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
      { icon: ClipboardList, title: "ส่งใบเสนอราคาก่อน", subtitle: "เริ่มจากราคาและรายการที่ลูกค้าต้องยืนยัน", type: "quotation", recommended: true },
      { icon: FileText, title: "ออกใบแจ้งหนี้ทันที", subtitle: "ตกลงราคาแล้ว พร้อมเรียกเก็บเงิน", type: "invoice" },
      { icon: CreditCard, title: "รับเงินแล้ว ออกใบกำกับภาษี/ใบเสร็จ", subtitle: "ชำระทันทีและปิดงานในเอกสารเดียว", type: "tax_invoice_receipt" },
    ],
  },
  {
    title: "ส่งของก่อน ออกบิลทีหลัง",
    options: [
      { icon: Truck, title: "สร้างใบส่งของฉบับร่าง", subtitle: "เตรียมส่งสินค้า แล้วกดยืนยันเมื่อส่งจริง", type: "delivery_note" },
      { icon: FileStack, title: "รวมใบส่งของเพื่อออกใบแจ้งหนี้", subtitle: "ใช้สำหรับออกบิลรายรอบ เช่น สิ้นเดือน", type: "invoice_from_delivery_notes" },
    ],
  },
  {
    title: "เก็บเงิน",
    options: [
      { icon: ReceiptText, title: "รวมใบแจ้งหนี้เพื่อออกใบวางบิล", subtitle: "วางบิลหลายใบพร้อมกัน", type: "billing_note" },
    ],
  },
];

export function NewDealSheet({ open, onClose, onSelect }: NewDealSheetProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="pb-1">
        <div className="mb-3 flex justify-center">
          <GripHorizontal className="h-5 w-8 text-[#E8E6DF]" />
        </div>
        <div className="px-1 pb-2 text-base font-semibold text-[#1A1A18]">เริ่มงานแบบไหน?</div>
        <div className="mt-1 space-y-4">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{group.title}</div>
              <div className="divide-y divide-card-border rounded-xl border border-card-border bg-white">
                {group.options.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.type}
                      onClick={() => onSelect(option.type)}
                      className="w-full px-3 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-page-bg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-[#1A1A18]">{option.title}</div>
                            {option.recommended && (
                              <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">แนะนำ</span>
                            )}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">{option.subtitle}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-2 w-full py-4 text-center text-sm text-gray-500">
          ยกเลิก
        </button>
      </div>
    </Modal>
  );
}
