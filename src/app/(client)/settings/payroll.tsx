import { useState, useEffect } from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { SettingsTabs } from "./_components/SettingsTabs";
import { supabase } from "../../../lib/supabase";
import { calculateBreakdown, type PayrollSettings as EngineSettings } from "../../../lib/payroll/calculations";
import { formatPayRangeLabel, suggestNextWindow } from "../../../lib/payroll/schedule";
import type { ClientPayrollSettings, PayFrequency } from "../../../types";

const DEFAULTS = {
  prorate_mode: "fixed_30",
  absence_deduction: true,
  rounding_rule: "round",
  sso_ceiling_override: null as number | null,
  pay_frequency: "monthly" as PayFrequency,
  pay_anchor_day: 1,
  pay_cycle_len_days: null as number | null,
};

export default function SettingsPayrollPage() {
  const toast = useToast();
  const { workspaceUserId } = useWorkspaceRole();
  const userId = workspaceUserId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [otDivisor, setOtDivisor] = useState("30");
  const [normalOtMultiplier, setNormalOtMultiplier] = useState("1.5");
  const [holidayOtMultiplier, setHolidayOtMultiplier] = useState("3.0");
  const [prorateMode, setProrateMode] = useState<string>(DEFAULTS.prorate_mode);
  const [absenceDeduction, setAbsenceDeduction] = useState(true);
  const [roundingRule, setRoundingRule] = useState<string>("round");
  const [ssoCeilingOverride, setSsoCeilingOverride] = useState("");
  const [payFrequency, setPayFrequency] = useState<PayFrequency>("monthly");
  const [payAnchorDay, setPayAnchorDay] = useState("1");
  const [payCycleLenDays, setPayCycleLenDays] = useState("");

  // Mini-calculator state (unsaved values preview)
  const [calcBase, setCalcBase] = useState("15000");
  const [calcAbsent, setCalcAbsent] = useState("");

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("client_payroll_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const s = data as ClientPayrollSettings;
          setOtDivisor(String(s.ot_divisor));
          setNormalOtMultiplier(String(s.normal_ot_multiplier));
          setHolidayOtMultiplier(String(s.holiday_ot_multiplier));
          setProrateMode(s.prorate_mode ?? DEFAULTS.prorate_mode);
          setAbsenceDeduction(s.absence_deduction ?? DEFAULTS.absence_deduction);
          setRoundingRule(s.rounding_rule ?? DEFAULTS.rounding_rule);
          setSsoCeilingOverride(s.sso_ceiling_override != null ? String(s.sso_ceiling_override) : "");
          setPayFrequency(s.pay_frequency ?? DEFAULTS.pay_frequency);
          setPayAnchorDay(String(s.pay_anchor_day ?? 1));
          setPayCycleLenDays(s.pay_cycle_len_days != null ? String(s.pay_cycle_len_days) : "");
        }
        setLoading(false);
      });
  }, [userId]);

  const draftEngineSettings: EngineSettings = {
    ot_divisor: parseFloat(otDivisor) || 30,
    normal_ot_multiplier: parseFloat(normalOtMultiplier) || 1.5,
    holiday_ot_multiplier: parseFloat(holidayOtMultiplier) || 3.0,
    prorate_mode: prorateMode as EngineSettings["prorate_mode"],
    absence_deduction: absenceDeduction,
    rounding_rule: roundingRule as EngineSettings["rounding_rule"],
    sso_ceiling_override: ssoCeilingOverride.trim() === "" ? null : parseFloat(ssoCeilingOverride),
  };

  const calcBaseNum = parseFloat(calcBase) || 0;
  const calcPreview = calculateBreakdown(
    {
      salary_type: "monthly",
      base_salary: calcBaseNum,
      days_worked: null,
      absent_days: calcAbsent.trim() === "" ? null : parseFloat(calcAbsent) || 0,
      ot_entries: [],
      additions: [],
      deductions: [],
    },
    draftEngineSettings,
    new Date().getMonth() + 1,
    new Date().getFullYear(),
  );

  const cyclePreviewWin =
    payFrequency !== "monthly"
      ? suggestNextWindow(payFrequency, { anchorDay: parseInt(payAnchorDay) || 1, cycleLenDays: parseInt(payCycleLenDays) || undefined }, null)
      : null;

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from("client_payroll_settings")
      .upsert(
        {
          user_id: userId,
          ot_divisor: parseFloat(otDivisor) || 30,
          normal_ot_multiplier: parseFloat(normalOtMultiplier) || 1.5,
          holiday_ot_multiplier: parseFloat(holidayOtMultiplier) || 3.0,
          prorate_mode: prorateMode,
          absence_deduction: absenceDeduction,
          rounding_rule: roundingRule,
          sso_ceiling_override: ssoCeilingOverride.trim() === "" ? null : parseFloat(ssoCeilingOverride) || null,
          pay_frequency: payFrequency,
          pay_anchor_day: parseInt(payAnchorDay) || 1,
          pay_cycle_len_days: payCycleLenDays.trim() === "" ? null : parseInt(payCycleLenDays) || null,
        },
        { onConflict: "user_id" }
      );

    if (error) {
      toast.error("บันทึกไม่สำเร็จ");
    } else {
      setSaved(true);
      toast.success("บันทึกแล้ว");
    }
    setSaving(false);
  }

  if (loading) return <AppShell title="ตั้งค่า > เงินเดือน"><Spinner /></AppShell>;

  return (
    <AppShell title="ตั้งค่า > เงินเดือน">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/payroll" />

        {/* Calculation conventions */}
        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-[#1A1A18]">กฎการคำนวณ</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#888780]">
                ตั้งค่าวิธีแปลงเงินเดือนรายเดือนเป็นอัตรารายวัน/รายชั่วโมง การหักวันขาดงาน และการปัดเศษ
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="ฐานคำนวณรายวัน"
                value={prorateMode}
                onChange={(e) => setProrateMode(e.target.value)}
              >
                <option value="fixed_30">ตายที่นิยม (ตามตัวหารด้านล่าง)</option>
                <option value="actual_days">จำนวนวันจริงของเดือน</option>
              </Select>

              <Select
                label="กฎการปัดเศษ"
                value={roundingRule}
                onChange={(e) => setRoundingRule(e.target.value)}
              >
                <option value="round">ปัดเศษปกติ (0.5 ขึ้นไป)</option>
                <option value="floor">ปัดลง (ฝ่ายนายจ้าง)</option>
                <option value="ceil">ปัดขึ้น (ฝ่ายพนักงาน)</option>
              </Select>

              <Select
                label="หักค่าจ้างเมื่อขาดงาน"
                value={absenceDeduction ? "on" : "off"}
                onChange={(e) => setAbsenceDeduction(e.target.value === "on")}
              >
                <option value="on">หักอัตโนมัติตามวันขาด</option>
                <option value="off">ไม่หัก (บันทึกเอง)</option>
              </Select>

              <Input
                label="เพดานประกันสังคม (บาท) — เว้นว่าง = ตามกฎหมาย"
                type="number"
                min="0"
                value={ssoCeilingOverride}
                onChange={(e) => setSsoCeilingOverride(e.target.value)}
                placeholder="17500"
              />
            </div>
          </div>
        </Card>

        {/* OT */}
        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-[#1A1A18]">การคำนวณ OT (ล่วงเวลา)</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#888780]">
                ตั้งค่าอัตราการคำนวณค่าแรงล่วงเวลา ใช้กับระบบจัดการเงินเดือน
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="ตัวหารอัตรารายชั่วโมง"
                type="number"
                min="1"
                value={otDivisor}
                onChange={(e) => setOtDivisor(e.target.value)}
                placeholder="30"
              />
              <p className="text-[11px] text-[#888780] -mt-2 sm:col-span-3">
                {prorateMode === "actual_days"
                  ? "ใช้จำนวนวันจริงของเดือนแทนตัวหารนี้ในการแปลงเป็นอัตรารายชั่วโมง (ตั้ง \"ฐานคำนวณรายวัน\" ด้านบน)"
                  : "อัตรารายชั่วโมง = เงินเดือน ÷ ตัวหาร ÷ 8 (ค่าเริ่มต้น: 30 วัน)"}
              </p>

              <Input
                label="OT ปกติ (เท่า)"
                type="number"
                min="0"
                step="0.5"
                value={normalOtMultiplier}
                onChange={(e) => setNormalOtMultiplier(e.target.value)}
                placeholder="1.5"
              />
              <p className="text-[11px] text-[#888780] -mt-2">
                ค่าคูณสำหรับ OT วันปกติ (ค่าเริ่มต้น: 1.5×)
              </p>

              <Input
                label="OT วันหยุด (เท่า)"
                type="number"
                min="0"
                step="0.5"
                value={holidayOtMultiplier}
                onChange={(e) => setHolidayOtMultiplier(e.target.value)}
                placeholder="3.0"
              />
              <p className="text-[11px] text-[#888780] -mt-2">
                ค่าคูณสำหรับ OT วันหยุด (ค่าเริ่มต้น: 3×)
              </p>
            </div>
          </div>
        </Card>

        {/* Pay cycle */}
        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-[#1A1A18]">รอบการจ่ายเงิน</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#888780]">
                เลือกรอบที่บริษัทจ่ายค่าจ้าง ระบบจะเสนอช่วงรอบถัดไปให้อัตโนมัติ (ภาษี/ประกันสังคมสรุปตามเดือนเสมอ)
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="ความถี่การจ่าย"
                value={payFrequency}
                onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
              >
                <option value="monthly">รายเดือน</option>
                <option value="semimonthly">ครึ่งเดือน (2 ครั้ง/เดือน)</option>
                <option value="weekly">รายสัปดาห์</option>
                <option value="custom">กำหนดเอง (ทุก N วัน)</option>
              </Select>

              {payFrequency === "semimonthly" && (
                <Input
                  label="วันตัดรอบ (1–27)"
                  type="number"
                  min="1"
                  max="27"
                  value={payAnchorDay}
                  onChange={(e) => setPayAnchorDay(e.target.value)}
                  placeholder="15"
                />
              )}

              {payFrequency === "custom" && (
                <Input
                  label="จำนวนวันต่อรอบ"
                  type="number"
                  min="1"
                  max="31"
                  value={payCycleLenDays}
                  onChange={(e) => setPayCycleLenDays(e.target.value)}
                  placeholder="5"
                />
              )}
            </div>

            {cyclePreviewWin && (
              <p className="text-[11px] text-primary-deep bg-primary-soft rounded-lg px-3 py-2 inline-block">
                ตัวอย่างช่วงรอบแรก: {formatPayRangeLabel(cyclePreviewWin)} ({cyclePreviewWin.start} → {cyclePreviewWin.end})
              </p>
            )}
          </div>
        </Card>

        {/* Mini-calculator */}
        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-[#1A1A18]">ทดลองคำนวณ</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#888780]">
                ใช้ค่าที่กรอกด้านบน (ยังไม่บันทึก) คำนวณตัวอย่างสลิปพนักงานรายเดือน
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="เงินเดือนฐาน (บาท)"
                type="number"
                min="0"
                value={calcBase}
                onChange={(e) => setCalcBase(e.target.value)}
                placeholder="15000"
              />
              <Input
                label="วันขาดงานในรอบ"
                type="number"
                min="0"
                step="0.5"
                value={calcAbsent}
                onChange={(e) => setCalcAbsent(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="rounded-lg border border-card-border bg-cool-25 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-cool-500">ค่าแรงรวม (หลังหักวันขาด)</span>
                <span className="tabular-nums font-medium">฿{calcPreview.gross_pay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cool-500">ประกันสังคม (พนักงาน 5%)</span>
                <span className="tabular-nums font-medium text-red-500">-฿{calcPreview.sso_employee.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cool-500">ภาษีหัก ณ ที่จ่าย</span>
                <span className="tabular-nums font-medium text-red-500">-฿{calcPreview.withholding_tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-t border-card-border pt-1.5 mt-1.5">
                <span className="font-semibold">เงินเดือนสุทธิ</span>
                <span className="tabular-nums font-bold text-primary-deep">฿{calcPreview.net_pay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </Card>

        {saved && <p className="text-xs text-green-600">บันทึกแล้ว</p>}

        <div className="relative">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
