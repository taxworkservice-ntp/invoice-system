import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";

const TABS = [
  { label: "โปรไฟล์", path: "/settings/profile" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
];

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

  if (loading) return <AppShell title="ตั้งค่า > สต็อก"><Spinner /></AppShell>;

  return (
    <AppShell title="ตั้งค่า > สต็อก">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-card-border pb-0">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-2 text-sm rounded-t-lg ${
                tab.path === "/settings/stock"
                  ? "bg-white border border-card-border border-b-white text-primary font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="text-[11px] uppercase font-semibold text-[#888780] pt-2">
          การจัดการสต็อก
        </div>

        <Card>
          <div className="space-y-4">
            <div className="text-[13px] font-medium text-[#1A1A18]">
              ตัดสต็อกอัตโนมัติเมื่อ
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="stockTrigger"
                value="invoice"
                checked={trigger === "invoice"}
                onChange={() => setTrigger("invoice")}
                className="mt-0.5 w-4 h-4 text-[#378ADD] border-[#E8E6DF] focus:ring-[#378ADD]"
              />
              <div>
                <div className="text-[14px] text-[#1A1A18]">ส่งใบแจ้งหนี้</div>
                <div className="text-[12px] text-[#888780] mt-0.5">
                  ระบบตัดสต็อกทันทีที่ยืนยันว่าส่งใบแจ้งหนี้แล้ว
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="stockTrigger"
                value="delivery_note"
                checked={trigger === "delivery_note"}
                onChange={() => setTrigger("delivery_note")}
                className="mt-0.5 w-4 h-4 text-[#378ADD] border-[#E8E6DF] focus:ring-[#378ADD]"
              />
              <div>
                <div className="text-[14px] text-[#1A1A18]">ออกใบส่งของ</div>
                <div className="text-[12px] text-[#888780] mt-0.5">
                  ระบบตัดสต็อกเมื่อส่งใบส่งของ เหมาะสำหรับธุรกิจที่เบิกสินค้าออกจากคลังก่อน
                </div>
              </div>
            </label>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
