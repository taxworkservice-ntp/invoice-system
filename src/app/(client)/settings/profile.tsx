import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { LogoUpload } from "../../../components/ui/LogoUpload";
import { ImageUpload } from "../../../components/ui/ImageUpload";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { LOGO_SIZE_OPTIONS } from "../../../constants";
import { signatureKey as signatureKeyFn, stampKey as stampKeyFn } from "../../../lib/r2";
import { defaultTerms } from "../../../lib/terms";
import type { ClientProfile } from "../../../types";

const TABS = [
  { label: "โปรไฟล์", path: "/settings/profile" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
  { label: "บัญชี", path: "/settings/account" },
];

export default function SettingsProfilePage() {
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
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(LOGO_SIZE_OPTIONS[0].value);
  const [pdfTemplate, setPdfTemplate] = useState<"modern" | "classic">("modern");
  const [classicTerms, setClassicTerms] = useState("");
  const [signatureKey, setSignatureKey] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState<string | null>(null);
  const [showSignatureOnWht, setShowSignatureOnWht] = useState(true);
  const [showStampOnWht, setShowStampOnWht] = useState(true);
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
      setContactName((clientProfile as any).contact_name || "");
      setLogoKey(clientProfile.logo_url);
      setLogoSize((clientProfile as any).logo_size || "square");
      setBankName((clientProfile as any).bank_name || "");
      setBankAccount((clientProfile as any).bank_account || "");
      setSignatureKey((clientProfile as any).signature_url || null);
      setStampKey((clientProfile as any).stamp_url || null);
      setShowSignatureOnWht((clientProfile as any).show_signature_on_wht !== false);
      setShowStampOnWht((clientProfile as any).show_stamp_on_wht !== false);
      setPdfTemplate(clientProfile.pdf_template === "classic" ? "classic" : "modern");
      setClassicTerms(clientProfile.classic_terms || "");
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

    const basePayload: Record<string, unknown> = {
      company_name_th: companyNameTh.trim(),
      company_name_en: companyNameEn.trim() || null,
      tax_id: taxId || null,
      address: address || null,
      phone: phone || null,
      logo_url: logoKey,
      logo_size: logoSize,
      pdf_template: pdfTemplate,
      classic_terms: classicTerms.trim() || null,
      bank_name: bankName.trim() || null,
      bank_account: bankAccount.trim() || null,
      signature_url: signatureKey,
      stamp_url: stampKey,
      show_signature_on_wht: showSignatureOnWht,
      show_stamp_on_wht: showStampOnWht,
    };

    let err;
    try {
      const result = await supabase
        .from("client_profiles")
        .update({ ...basePayload, contact_name: contactName.trim() || null })
        .eq("user_id", profile.id);
      err = result.error;
    } catch {
      const result = await supabase
        .from("client_profiles")
        .update(basePayload)
        .eq("user_id", profile.id);
      err = result.error;
    }

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      setSaved(true);
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        company_name_th: companyNameTh.trim(),
        company_name_en: companyNameEn.trim() || null,
        tax_id: taxId || null,
        address: address || null,
        phone: phone || null,
        contact_name: contactName.trim() || null,
        logo_url: logoKey,
        logo_size: logoSize,
        pdf_template: pdfTemplate,
        classic_terms: classicTerms.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        signature_url: signatureKey,
        stamp_url: stampKey,
        show_signature_on_wht: showSignatureOnWht,
        show_stamp_on_wht: showStampOnWht,
      } as ClientProfile);
    }
    setSaving(false);
  }

  if (loading) return <AppShell title="ตั้งค่า > โปรไฟล์"><Spinner /></AppShell>;

  const isDirty = companyNameTh !== (clientProfile?.company_name_th || "") ||
    address !== (clientProfile?.address || "") ||
    phone !== (clientProfile?.phone || "") ||
    contactName !== ((clientProfile as any)?.contact_name || "") ||
    pdfTemplate !== (clientProfile?.pdf_template === "classic" ? "classic" : "modern") ||
    classicTerms !== (clientProfile?.classic_terms || "");

  return (
    <AppShell title="ตั้งค่า > โปรไฟล์">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-card-border pb-0">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-2 text-sm rounded-t-lg ${
                tab.path === "/settings/profile"
                  ? "bg-white border border-card-border border-b-white text-primary font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Card>
          <div className="space-y-3">
            {profile && (
              <LogoUpload userId={profile.id} currentLogoKey={logoKey} onLogoChange={setLogoKey} />
            )}

            {logoKey && (
              <Select
                label="ขนาดโลโก้บนเอกสาร"
                value={logoSize}
                onChange={(e) => { setLogoSize(e.target.value); setSaved(false); }}
              >
                {LOGO_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label} ({opt.px}px)</option>
                ))}
              </Select>
            )}

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

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">เทมเพลต PDF</p>
              <Select
                value={pdfTemplate}
                onChange={(e) => { setPdfTemplate(e.target.value as "modern" | "classic"); setSaved(false); }}
              >
                <option value="modern">โมเดิร์น (Modern)</option>
                <option value="classic">คลาสสิก (Thai Classic)</option>
              </Select>
              <p className="text-[11px] text-[#888780] mt-1">
                เทมเพลตเริ่มต้นสำหรับเอกสารทุกประเภท มีผลกับเอกสารใหม่เท่านั้น
              </p>
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  ข้อความเงื่อนไขท้ายเอกสาร
                </label>
                <textarea
                  value={classicTerms}
                  onChange={(e) => { setClassicTerms(e.target.value); setSaved(false); }}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 resize-none"
                />
                {!classicTerms.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setClassicTerms(defaultTerms("").join("\n"));
                      setSaved(false);
                    }}
                    className="mt-2 text-xs text-[#378ADD] hover:underline"
                  >
                    + ใช้ข้อความเริ่มต้น
                  </button>
                )}
                <p className="text-[11px] text-[#888780] mt-1">
                  หนึ่งบรรทัดต่อหนึ่งข้อ ถ้าเว้นว่างระบบจะใช้ข้อความมาตรฐานและชื่อบริษัทปัจจุบัน
                </p>
              </div>
            </div>

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">ลายเซ็นและตราประทับ</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <ImageUpload
                    userId={profile!.id}
                    storageKeyFn={signatureKeyFn}
                    currentKey={signatureKey}
                    onKeyChange={(k) => { setSignatureKey(k); setSaved(false); }}
                    label="ลายเซ็น"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showSignatureOnWht} onChange={(e) => { setShowSignatureOnWht(e.target.checked); setSaved(false); }} className="w-3.5 h-3.5 accent-primary rounded" />
                    <span className="text-[11px] text-gray-500 select-none">แสดงในเอกสาร WHT (ภ.ง.ด.)</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <ImageUpload
                    userId={profile!.id}
                    storageKeyFn={stampKeyFn}
                    currentKey={stampKey}
                    onKeyChange={(k) => { setStampKey(k); setSaved(false); }}
                    label="ตราประทับ"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showStampOnWht} onChange={(e) => { setShowStampOnWht(e.target.checked); setSaved(false); }} className="w-3.5 h-3.5 accent-primary rounded" />
                    <span className="text-[11px] text-gray-500 select-none">แสดงในเอกสาร WHT (ภ.ง.ด.)</span>
                  </label>
                </div>
              </div>
              <p className="text-[11px] text-[#888780] mt-1">
                ลายเซ็นและตราแสดงบนเอกสารทุกประเภท สำหรับเอกสาร WHT สามารถเปิด/ปิดได้ที่นี่ และปรับเพิ่มเติมได้ที่หน้า WHT
              </p>
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
