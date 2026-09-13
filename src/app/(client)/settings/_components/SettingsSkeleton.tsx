import { Skeleton } from "../../../../components/ui/Skeleton";

// Loading placeholder for settings pages. Mirrors the real layout (tabs row
// + section cards) so navigating between settings never flashes a blank
// spinner page and content never swaps mid-view.
export function SettingsPageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="กำลังโหลดการตั้งค่า">
      <div className="flex gap-1 border-b border-card-border pb-0" aria-hidden="true">
        {[0, 1, 2, 3].map((tab) => (
          <Skeleton key={tab} className="h-9 w-24 rounded-b-none rounded-t-lg" />
        ))}
      </div>
      {[0, 1].map((card) => (
        <div
          key={card}
          className="bg-white border border-card-border rounded-card p-4"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-44 mb-1.5" />
          <Skeleton className="h-4 w-72 mb-4" />
          <div className="divide-y divide-[#F0EEE8]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 py-2.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-9 w-56" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Inline variant for loading blocks inside an already-rendered card
// (team tab content, bank accounts) — no nested card, just rows.
export function SettingsRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1" role="status" aria-label="กำลังโหลด">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center justify-between gap-3" aria-hidden="true">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-9 w-1/2" />
        </div>
      ))}
    </div>
  );
}
