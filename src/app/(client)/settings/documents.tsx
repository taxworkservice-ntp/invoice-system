import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Input";
import { LogoUpload } from "../../../components/ui/LogoUpload";
import { ImageUpload } from "../../../components/ui/ImageUpload";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { LOGO_SIZE_OPTIONS } from "../../../constants";
import { signatureKey as signatureKeyFn, stampKey as stampKeyFn } from "../../../lib/r2";
import { defaultTerms } from "../../../lib/terms";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { ClientProfile } from "../../../types";

const DOC_VISIBILITY_TYPES = [
  { key: "quotation", label: "ใบเสนอราคา" },
  { key: "invoice", label: "ใบแจ้งหนี้" },
  { key: "tax_invoice_receipt", label: "ใบกำกับภาษี" },
  { key: "billing_note", label: "ใบวางบิล" },
  { key: "receipt", label: "ใบเสร็จ" },
  { key: "delivery_note", label: "ใบส่งของ" },
  { key: "credit_note", label: "ใบลดหนี้" },
  { key: "wht", label: "WHT (ภ.ง.ด.)" },
];

export default function SettingsDocumentsPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const toast = useToast();

  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(LOGO_SIZE_OPTIONS[0].value);
  const [pdfTemplate, setPdfTemplate] = useState<"modern" | "classic">("modern");
  const [classicTerms, setClassicTerms] = useState("");
  const [signatureKey, setSignatureKey] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState<string | null>(null);
  const [showSignatureOnWht, setShowSignatureOnWht] = useState(true);
  const [showStampOnWht, setShowStampOnWht] = useState(true);
  const [showSignatureOnDocs, setShowSignatureOnDocs] = useState<Record<string, boolean>>({});
  const [showStampOnDocs, setShowStampOnDocs] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (clientProfile) {
      setLogoKey(clientProfile.logo_url);
      setLogoSize((clientProfile as any).logo_size || "square");
      setPdfTemplate(clientProfile.pdf_template === "classic" ? "classic" : "modern");
      setClassicTerms(clientProfile.classic_terms || "");
      setSignatureKey((clientProfile as any).signature_url || null);
      setStampKey((clientProfile as any).stamp_url || null);
      setShowSignatureOnWht((clientProfile as any).show_signature_on_wht !== false);
      setShowStampOnWht((clientProfile as any).show_stamp_on_wht !== false);
      setShowSignatureOnDocs(DOC_VISIBILITY_TYPES.reduce((acc, t) => {
        if (t.key === "wht") {
          acc[t.key] = clientProfile.show_signature_on_wht !== false;
        } else {
          const map = (clientProfile as any).show_signature_on_docs as Record<string, boolean> | null;
          acc[t.key] = map ? (map[t.key] !== false) : true;
        }
        return acc;
      }, {} as Record<string, boolean>));
      setShowStampOnDocs(DOC_VISIBILITY_TYPES.reduce((acc, t) => {
        if (t.key === "wht") {
          acc[t.key] = clientProfile.show_stamp_on_wht !== false;
        } else {
          const map = (clientProfile as any).show_stamp_on_docs as Record<string, boolean> | null;
          acc[t.key] = map ? (map[t.key] !== false) : true;
        }
        return acc;
      }, {} as Record<string, boolean>));
    }
  }, [clientProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSaved(false);

    const payload: Record<string, unknown> = {
      logo_url: logoKey,
      logo_size: logoSize,
      pdf_template: pdfTemplate,
      classic_terms: classicTerms.trim() || null,
      signature_url: signatureKey,
      stamp_url: stampKey,
      show_signature_on_wht: showSignatureOnWht,
      show_stamp_on_wht: showStampOnWht,
      show_signature_on_docs: Object.values(showSignatureOnDocs).every(Boolean) ? null : showSignatureOnDocs,
      show_stamp_on_docs: Object.values(showStampOnDocs).every(Boolean) ? null : showStampOnDocs,
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

  if (loading) return <AppShell title="ตั้งค่า > รูปแบบเอกสาร"><Spinner /></AppShell>;

  const isDirty =
    pdfTemplate !== (clientProfile?.pdf_template === "classic" ? "classic" : "modern") ||
    classicTerms !== (clientProfile?.classic_terms || "");

  return (
    <AppShell title="ตั้งค่า > รูปแบบเอกสาร">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/documents" />

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
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <ImageUpload
                    userId={profile!.id}
                    storageKeyFn={signatureKeyFn}
                    currentKey={signatureKey}
                    onKeyChange={(k) => { setSignatureKey(k); setSaved(false); }}
                    label="ลายเซ็น"
                  />
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 mb-1.5">แสดงลายเซ็นในเอกสาร:</p>
                    <div className="grid grid-cols-4 gap-x-3 gap-y-1">
                      {DOC_VISIBILITY_TYPES.map((t) => (
                        <label key={t.key} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showSignatureOnDocs[t.key] !== false}
                            onChange={(e) => {
                              setShowSignatureOnDocs({ ...showSignatureOnDocs, [t.key]: e.target.checked });
                              if (t.key === "wht") setShowSignatureOnWht(e.target.checked);
                              setSaved(false);
                            }}
                            className="w-3 h-3 accent-primary rounded"
                          />
                          <span className="text-[11px] text-gray-500 select-none">{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <ImageUpload
                    userId={profile!.id}
                    storageKeyFn={stampKeyFn}
                    currentKey={stampKey}
                    onKeyChange={(k) => { setStampKey(k); setSaved(false); }}
                    label="ตราประทับ"
                  />
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 mb-1.5">แสดงตราประทับในเอกสาร:</p>
                    <div className="grid grid-cols-4 gap-x-3 gap-y-1">
                      {DOC_VISIBILITY_TYPES.map((t) => (
                        <label key={t.key} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showStampOnDocs[t.key] !== false}
                            onChange={(e) => {
                              setShowStampOnDocs({ ...showStampOnDocs, [t.key]: e.target.checked });
                              if (t.key === "wht") setShowStampOnWht(e.target.checked);
                              setSaved(false);
                            }}
                            className="w-3 h-3 accent-primary rounded"
                          />
                          <span className="text-[11px] text-gray-500 select-none">{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[#888780] mt-2">
                ลายเซ็นและตราสามารถตั้งค่าแยกแต่ละประเภทเอกสารได้ การตั้งค่านี้มีผลกับเอกสารใหม่ที่สร้างหลังจากบันทึก
              </p>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs text-green-600">บันทึกแล้ว</p>}

            <div className="relative">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "กำลังบันทึก..." : "บันทึกรูปแบบเอกสาร"}
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
