import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";

interface BannerDoc {
  status: string;
  updated_at?: string;
}

interface BannerDeal {
  isDone: boolean;
  isOverdue: boolean;
  updatedAt: string;
  documents: BannerDoc[];
}

interface OwnerMonitorBannerProps {
  deals: BannerDeal[];
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function OwnerMonitorBanner({ deals }: OwnerMonitorBannerProps) {
  const navigate = useNavigate();

  const alerts = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - STALE_MS;
    let overdue = 0;
    let stale = 0;
    let voided = 0;
    for (const deal of deals) {
      if (deal.isDone) continue;
      if (deal.isOverdue) overdue += 1;
      if (now - new Date(deal.updatedAt).getTime() > STALE_MS) stale += 1;
      for (const doc of deal.documents || []) {
        if (
          doc.status === "voided" &&
          doc.updated_at &&
          new Date(doc.updated_at).getTime() >= weekAgo
        ) {
          voided += 1;
          break;
        }
      }
    }
    return { overdue, stale, voided, total: overdue + stale + voided };
  }, [deals]);

  if (alerts.total === 0) return null;

  const parts: string[] = [];
  if (alerts.overdue > 0) parts.push(`เกินกำหนด ${alerts.overdue}`);
  if (alerts.stale > 0) parts.push(`ไม่ขยับ 7 วัน ${alerts.stale}`);
  if (alerts.voided > 0) parts.push(`ยกเลิก ${alerts.voided}`);

  const urgent = alerts.overdue > 0 || alerts.voided > 0;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-control px-3 py-2.5 text-body mb-3 ${urgent ? "bg-danger-soft text-danger-text" : "bg-paper-field text-ink-600 border-[0.5px] border-card-border"}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span>{parts.join(" · ")}</span>
      </div>
      <button
        type="button"
        onClick={() => navigate("/monitoring")}
        className="font-medium underline underline-offset-2 whitespace-nowrap text-body shrink-0"
      >
        ดูติดตามงาน →
      </button>
    </div>
  );
}
