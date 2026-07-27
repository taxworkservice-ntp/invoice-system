import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { ClientProfile } from "../../../types";

export default function SettingsCompanyPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const toast = useToast();

  const [companyNameTh, setCompanyNameTh] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (clientProfile) {
      setCompanyNameTh(clientProfile.company_name_th || "");
      setCompanyNameEn(clientProfile.company_name_en || "");
      setTaxId(clientProfile.tax_id || "");
      setAddress(clientProfile.address || "");
      setPhone(clientProfile.phone || "");
      setContactName(clientProfile.contact_name || "");
      setBankName(clientProfile.bank_name || "");
      setBankAccount(clientProfile.bank_account || "");
    }
  }, [clientProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSaved(false);

    if (!companyNameTh.trim()) {
      setError("กรุณากรอกชื่อบริษัท (ภาษาไทย)");
      setSaving(false);
      return;
    }

    const payload = {
      company_name_th: companyNameTh.trim(),
      company_name_en: companyNameEn.trim() || null,
      tax_id: taxId || null,
      address: address || null,
      phone: phone || null,
      contact_name: contactName.trim() || null,
      bank_name: bankName.trim() || null,
      bank_account: bankAccount.trim() || null,
    };

    const { error: err } = await supabase
      .from("client_profiles")
      .update(payload)
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      setSaved(true);
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        ...payload,
      } as ClientProfile);
    }
    setSaving(false);
  }

  if (loading) return <AppShell title="ตั้งค่า > ข้อมูลบริษัท"><Spinner /></AppShell>;

  const isDirty =
    companyNameTh !== (clientProfile?.company_name_th || "") ||
    companyNameEn !== (clientProfile?.company_name_en || "") ||
    taxId !== (clientProfile?.tax_id || "") ||
    address !== (clientProfile?.address || "") ||
    phone !== (clientProfile?.phone || "") ||
    contactName !== (clientProfile?.contact_name || "") ||
    bankName !== (clientProfile?.bank_name || "") ||
    bankAccount !== (clientProfile?.bank_account || "");

  return (
    <AppShell title="ตั้งค่า > ข้อมูลบริษัท">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/company" />

        <Card>
          <div className="space-y-3">
            <Input
              label="ชื่อบริษัท (ภาษาไทย) *"
              value={companyNameTh}
              onChange={(e) => { setCompanyNameTh(e.target.value); setSaved(false); }}
              placeholder="บริษัท มาลี จำกัด"
            />
            <Input
              label="ชื่อบริษัท (ภาษาอังกฤษ)"
              value={companyNameEn}
              onChange={(e) => { setCompanyNameEn(e.target.value); setSaved(false); }}
              placeholder="Malee Co., Ltd. (ไม่บังคับ)"
            />

            <Input
              label="เลขประจำตัวผู้เสียภาษี"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
              placeholder="0000000000000"
              maxLength={13}
            />
            <p className="text-[11px] text-[#888780] -mt-2">
              13 หลัก จำเป็นสำหรับใบกำกับภาษี
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                ที่อยู่
              </label>
              <textarea
                value={address}
                onChange={(e) => { setAddress(e.target.value); setSaved(false); }}
                placeholder="ที่อยู่สำหรับพิมพ์บนเอกสาร"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 placeholder:text-gray-400 resize-none"
              />
            </div>

            <Input
              label="เบอร์โทรศัพท์"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
            />
            <Input
              label="ชื่อผู้ติดต่อ / ชื่อเจ้าของ"
              value={contactName}
              onChange={(e) => { setContactName(e.target.value); setSaved(false); }}
              placeholder="ชื่อที่ใช้แสดงในการทักทาย"
            />
            <p className="text-[11px] text-[#888780] -mt-2">
              ใช้สำหรับข้อความทักทายในแอป
            </p>

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">ข้อมูลธนาคาร</p>
              <Input
                label="ชื่อธนาคาร"
                value={bankName}
                onChange={(e) => { setBankName(e.target.value); setSaved(false); }}
                placeholder="ธนาคารกสิกรไทย"
              />
              <Input
                label="เลขที่บัญชี"
                value={bankAccount}
                onChange={(e) => { setBankAccount(e.target.value); setSaved(false); }}
                placeholder="XXX-X-XXXXX-X"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs text-green-600">บันทึกแล้ว</p>}

            <div className="relative">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลบริษัท"}
              </Button>
              {isDirty && !saved && (
                <div className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-[#378ADD]" />
              )}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
