import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "../ui/Button";
import type { DownloadJobState } from "../../hooks/useDownloadJob";

interface DownloadJobBarProps {
  state: DownloadJobState;
  onCancel: () => void;
  onRetry?: () => void;
  onDismiss: () => void;
}

/**
 * Progress / result bar for a download job. Mirrors the running progress,
 * then reports an honest succeeded/failed breakdown with optional retry.
 */
export function DownloadJobBar({ state, onCancel, onRetry, onDismiss }: DownloadJobBarProps) {
  if (state.status === "idle") return null;

  const percent = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;

  return (
    <div className="rounded-control border border-card-border bg-white px-4 py-3">
      {state.status === "running" && (
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-label font-medium text-ink-900">
              กำลังสร้างไฟล์{state.total > 0 ? ` ${state.current}/${state.total}` : "..."}
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-ink-50">
              <div className="h-2 rounded-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onCancel}>ยกเลิก</Button>
        </div>
      )}

      {state.status === "done" && (
        <div className="flex items-start gap-3">
          {state.result && state.result.failed > 0 ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0 flex-1 text-label leading-5 text-ink-600">
            {state.result
              ? state.result.failed > 0
                ? `ดาวน์โหลดสำเร็จ ${state.result.succeeded}/${state.result.total} ไฟล์ — ล้มเหลว ${state.result.failed} ไฟล์`
                : `ดาวน์โหลด ${state.result.succeeded} ไฟล์เรียบร้อย`
              : "ดาวน์โหลดเรียบร้อย"}
            {state.result?.failures && state.result.failures.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-label text-amber-700">
                {state.result.failures.slice(0, 5).map((failure, index) => (
                  <li key={`${failure.label}-${index}`}>{failure.label}{failure.error ? ` — ${failure.error}` : ""}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onRetry && (state.result?.failed ?? 0) > 0 && (
              <Button variant="secondary" size="sm" onClick={onRetry}>ลองใหม่</Button>
            )}
            <button type="button" onClick={onDismiss} aria-label="ปิด" className="rounded p-1 text-ink-400 hover:bg-ink-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1 text-label leading-5 text-red-600">{state.error || "เกิดข้อผิดพลาด"}</div>
          <div className="flex shrink-0 items-center gap-1">
            {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>ลองใหม่</Button>}
            <button type="button" onClick={onDismiss} aria-label="ปิด" className="rounded p-1 text-ink-400 hover:bg-ink-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
