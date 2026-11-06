const STEPS = ["ร่าง", "ส่ง", "รับเงิน"] as const;

/**
 * First-run concept strip: teaches the deal's mental model (draft → sent →
 * paid) while a deal has never progressed past drafts. The page hides it on
 * its own once any document is sent — no dismiss button, no storage.
 */
export function DealConceptStrip() {
  return (
    <div className="mb-3 rounded-control border border-primary-border bg-primary-soft px-3 py-2">
      <div
        aria-hidden="true"
        className="flex items-center justify-center gap-1.5 text-label font-semibold text-primary-deep"
      >
        {STEPS.map((step, index) => (
          <span key={step} className="flex items-center gap-1.5">
            {index > 0 ? <span className="text-primary">→</span> : null}
            <span
              className={`rounded-full px-2 py-0.5 ${
                index === 0 ? "bg-primary text-white" : "bg-white text-primary-deep"
              }`}
            >
              {step}
            </span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-center text-label leading-5 text-primary-deep">
        ส่งเอกสารเพื่อให้งานเดินหน้า — ฉบับร่างยังไม่นับว่าทำแล้ว
      </p>
    </div>
  );
}
