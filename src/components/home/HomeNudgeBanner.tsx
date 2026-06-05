import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";

type NudgeType = "profile" | "customer" | "items";

interface HomeNudgeBannerProps {
  type: NudgeType;
  onDismiss: () => void;
}

const NUDGE_CONTENT: Record<NudgeType, { text: string; actionLabel: string; route: string }> = {
  profile: { text: "เพิ่มที่อยู่บริษัทเพื่อให้ PDF แสดงครบถ้วน", actionLabel: "ตั้งค่า", route: "/settings" },
  customer: { text: "เพิ่มลูกค้าคนแรกเพื่อเริ่มสร้างเอกสาร", actionLabel: "เพิ่มลูกค้า", route: "/customers" },
  items: { text: "เพิ่มสินค้าหรือบริการในแค็ตตาล็อกเพื่อสร้างเอกสารได้เร็วขึ้น", actionLabel: "เพิ่ม", route: "/catalog" },
};

export function HomeNudgeBanner({ type, onDismiss }: HomeNudgeBannerProps) {
  const navigate = useNavigate();
  const { text, actionLabel, route } = NUDGE_CONTENT[type];

  return (
    <div className="flex items-center justify-between gap-2 bg-[#E6F1FB] text-[#0C447C] rounded-[8px] px-3 py-2.5 text-sm mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">ℹ</span>
        <span className="truncate">{text}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => navigate(route)}
          className="text-[#0C447C] font-medium underline underline-offset-2 whitespace-nowrap text-sm"
        >
          {actionLabel} →
        </button>
        <button
          onClick={onDismiss}
          className="text-[#0C447C]/60 hover:text-[#0C447C] p-1 rounded"
          aria-label="ปิด"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
