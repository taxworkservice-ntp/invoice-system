import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { WHT_RATE_OPTIONS } from "../../../constants";

const TABS = [
  { label: "โปรไฟล์", path: "/settings/profile" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
];

export default function SettingsTaxPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);

  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRate, setVatRate] = useState("7.00");
  const [defaultWhtRate, setDefaultWhtRate] = useState("0");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (clientProfile) {
      setVatRegistered(clientProfile.vat_registered);
      setVatRate(String(clientProfile.vat_rate));
      setDefaultWhtRate(clientProfile.default_wht_rate);
    }
  }, [clientProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const { error: err } = await supabase
      .from("client_profiles")
      .update({
        vat_registered: vatRegistered,
        vat_rate: parseFloat(vatRate),
        default_wht_rate: defaultWhtRate,
      })
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      setSuccess("บันทึกสำเร็จ");
      toast.success("บันทึกตั้งค่าภาษีสำเร็จ");
      setClientProfile({
        ...clientProfile,
        vat_registered: vatRegistered,
        vat_rate: parseFloat(vatRate),
        default_wht_rate: defaultWhtRate as any,
      });
    }
    setSaving(false);
  }

  if (loading) return <AppShell title="ตั้งค่า > ภาษี"><Spinner /></AppShell>;

  return (
    <AppShell title="ตั้งค่า > ภาษี">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-card-border pb-0">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-2 text-sm rounded-t-lg ${
                tab.path === "/settings/tax"
                  ? "bg-white border border-card-border border-b-white text-primary font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Card>
          <div className="space-y-4">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary rounded border-card-border"
              />
              <div>
                <span className="text-sm font-medium">จดทะเบียน VAT</span>
                <p className="text-[11px] text-[#888780] mt-0.5 leading-relaxed">
                  {vatRegistered
                    ? "เปิด: เอกสารจะออกเป็น \"ใบกำกับภาษี\" และแสดงรายการ VAT 7% อัตโนมัติ"
                    : "ปิด: เอกสารจะออกเป็น \"ใบแจ้งหนี้\" ไม่มีรายการ VAT"}
                </p>
              </div>
            </label>

            {vatRegistered && (
              <Input
                label="อัตรา VAT (%)"
                type="number"
                step="0.01"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            )}

            <Select
              label="อัตราหัก ณ ที่จ่ายเริ่มต้น"
              value={defaultWhtRate}
              onChange={(e) => setDefaultWhtRate(e.target.value)}
            >
              {WHT_RATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {success && <p className="text-xs text-green-500">{success}</p>}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
