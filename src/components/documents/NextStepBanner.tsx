import { ArrowDown, CheckCircle2, ListTodo } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * Single "next step" guide strip for document forms. Always names exactly one
 * pending action (first-incomplete wins) with a button that either performs
 * the fix directly or jumps to it — never a list of warnings, never a lock.
 */
export type NextStepState =
  | { kind: "pick-customer" }
  | { kind: "pick-date" }
  | { kind: "add-lines" }
  | { kind: "fill-quantities" }
  | { kind: "fill-markers"; count: number }
  | { kind: "pick-amount" }
  | { kind: "confirm-prices"; count: number }
  | { kind: "ready"; saveLabel: string };

export function NextStepBanner({
  state,
  onFillAll,
  onGoto,
}: {
  state: NextStepState;
  /** Primary fix action — fill-all-remaining on DN-from-quotation, add-line on the deal form. */
  onFillAll: () => void;
  /** Jump to the current blocker (uses the parent's precomputed target). */
  onGoto: () => void;
}) {
  if (state.kind === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-success-border bg-success-soft px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" />
        <p className="min-w-0 flex-1 text-body font-medium text-success-text">พร้อมบันทึกแล้ว</p>
        <span className="text-label leading-5 text-ink-500">
          ตรวจสรุปด้านล่างแล้วกด {state.saveLabel}
        </span>
      </div>
    );
  }

  const message =
    state.kind === "pick-customer"
      ? "เลือกลูกค้าก่อนสร้างเอกสาร"
      : state.kind === "pick-date"
        ? "เลือกวันที่ออกเอกสาร"
        : state.kind === "add-lines"
          ? "เพิ่มรายการสินค้าอย่างน้อย 1 รายการ"
          : state.kind === "fill-quantities"
            ? "ใส่จำนวนส่งอย่างน้อย 1 รายการ"
            : state.kind === "fill-markers"
              ? `กรอกชื่อหัวข้อกลุ่มให้ครบ (${state.count} หัวข้อ)`
              : state.kind === "pick-amount"
                ? "เลือกการแสดงจำนวนเงิน 1 แบบ"
                : `ยืนยันราคาอีก ${state.count} รายการ`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-amber-300 bg-amber-50/60 px-3 py-2.5">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-pending-bg px-2 py-0.5 text-label font-medium text-pending-text">
        <ListTodo className="h-3.5 w-3.5" />
        ขั้นตอนต่อไป
      </span>
      <p className="min-w-0 flex-1 text-body text-amber-900">{message}</p>
      {state.kind === "fill-quantities" ? (
        <Button size="sm" onClick={onFillAll}>
          ใส่คงเหลือทั้งหมด
        </Button>
      ) : state.kind === "add-lines" ? (
        <Button size="sm" onClick={onFillAll}>
          เพิ่มรายการ
        </Button>
      ) : state.kind === "pick-customer" ? (
        <Button size="sm" onClick={onGoto}>
          เลือกลูกค้า
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={onGoto}>
          ไปยัง
          <ArrowDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
