import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { SectionCard } from "../../../components/ui/SectionCard";
import { SaveBar } from "../../../components/ui/SaveBar";
import { SettingsPageSkeleton } from "./_components/SettingsSkeleton";
import { useToast } from "../../../hooks/useToast";
import { SettingsTabs } from "./_components/SettingsTabs";

export default function SettingsStockPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const toast = useToast();

  const [trigger, setTrigger] = useState<string>("invoice");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (clientProfile) {
      setTrigger(clientProfile.stock_deduct_trigger || "invoice");
    }
  }, [clientProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");

    const { error: err } = await supabase
      .from("client_profiles")
      .update({ stock_deduct_trigger: trigger })
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      toast.success("บันทึกการตั้งค่าสต็อกสำเร็จ");
      setClientProfile({
        ...clientProfile,
        stock_deduct_trigger: trigger,
      });
    }
    setSaving(false);
  }

  if (loading) return <AppShell width="form" title="ตั้งค่า > สต็อก"><SettingsPageSkeleton /></AppShell>;

  return (
    <AppShell width="form" title="ตั้งค่า > สต็อก">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/stock" />

        <SectionCard title="การตัดสต็อก" description="เลือกจุดที่ระบบตัดสต็อกสินค้าอัตโนมัติ">
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer rounded-control border border-card-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50">
              <input
                type="radio"
                name="stockTrigger"
                value="invoice"
                checked={trigger === "invoice"}
                onChange={() => setTrigger("invoice")}
                className="mt-0.5 w-4 h-4 text-primary border-card-border focus:ring-primary"
              />
              <div>
                <div className="text-body text-ink-900">ส่งใบแจ้งหนี้</div>
                <div className="text-label text-ink-300 mt-0.5">
                  ระบบตัดสต็อกทันทีที่ยืนยันว่าส่งใบแจ้งหนี้แล้ว
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer rounded-control border border-card-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50">
              <input
                type="radio"
                name="stockTrigger"
                value="delivery_note"
                checked={trigger === "delivery_note"}
                onChange={() => setTrigger("delivery_note")}
                className="mt-0.5 w-4 h-4 text-primary border-card-border focus:ring-primary"
              />
              <div>
                <div className="text-body text-ink-900">ออกใบส่งของ</div>
                <div className="text-label text-ink-300 mt-0.5">
                  ระบบตัดสต็อกเมื่อส่งใบส่งของ เหมาะสำหรับธุรกิจที่เบิกสินค้าออกจากคลังก่อน
                </div>
              </div>
            </label>
          </div>
        </SectionCard>

        <SaveBar
          tone={error ? "error" : "muted"}
          label={error || "เลือกจุดตัดสต็อกแล้วกดบันทึก"}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    </AppShell>
  );
}
