import { useState, useEffect } from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { useWorkspaceRole } from "../../../hooks/useAuth";
import { SettingsTabs } from "./_components/SettingsTabs";
import { supabase } from "../../../lib/supabase";
import type { ClientPayrollSettings } from "../../../types";

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
        }
        setLoading(false);
      });
  }, [userId]);

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
                value={otDivisor}
                onChange={(e) => setOtDivisor(e.target.value)}
                placeholder="30"
              />
              <p className="text-[11px] text-[#888780] -mt-2 sm:col-span-3">
                อัตรารายชั่วโมง = เงินเดือน ÷ ตัวหาร ÷ 8 (ค่าเริ่มต้น: 30 วัน)
              </p>

              <Input
                label="OT ปกติ (เท่า)"
                type="number"
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
                value={holidayOtMultiplier}
                onChange={(e) => setHolidayOtMultiplier(e.target.value)}
                placeholder="3.0"
              />
              <p className="text-[11px] text-[#888780] -mt-2">
                ค่าคูณสำหรับ OT วันหยุด (ค่าเริ่มต้น: 3×)
              </p>
            </div>

            {saved && <p className="text-xs text-green-600">บันทึกแล้ว</p>}

            <div className="relative">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
