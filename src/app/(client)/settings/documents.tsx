import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useClientFeatures } from "../../../hooks/useClientFeatures";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Input";
import { LogoUpload } from "../../../components/ui/LogoUpload";
import { ImageUpload } from "../../../components/ui/ImageUpload";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { LOGO_SIZE_OPTIONS, ASSET_SCALE_OPTIONS, CLASSIC_V2_FONT_SCALE_OPTIONS, CLASSIC_V2_SECTION_FONT_KEYS, CLASSIC_V2_SECTION_INHERIT } from "../../../constants";
import type { ClassicV2SectionFontKey } from "../../../constants";
import { signatureKey as signatureKeyFn, stampKey as stampKeyFn } from "../../../lib/r2";
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
  { key: "debit_note", label: "ใบเพิ่มหนี้" },
  { key: "wht", label: "หัก ณ ที่จ่าย (ภ.ง.ด.)" },
];

export default function SettingsDocumentsPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const { hasFeature } = useClientFeatures(profile?.id);
  const toast = useToast();

  const hasClassicV2 = hasFeature("classic_v2_template");
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(LOGO_SIZE_OPTIONS[0].value);
  const [showLogo, setShowLogo] = useState(true);
  const [showCompanyName, setShowCompanyName] = useState(true);
  const [logoLayout, setLogoLayout] = useState<"left" | "above">("left");
  const [pdfTemplate, setPdfTemplate] = useState<"modern" | "classic" | "classic_v2">("modern");
  const [classicV2FontScale, setClassicV2FontScale] = useState("normal");
  const [classicV2SectionScales, setClassicV2SectionScales] = useState<Record<ClassicV2SectionFontKey, string>>({
    header: CLASSIC_V2_SECTION_INHERIT,
    items: CLASSIC_V2_SECTION_INHERIT,
    totals: CLASSIC_V2_SECTION_INHERIT,
    footer: CLASSIC_V2_SECTION_INHERIT,
  });
  const [classicTerms, setClassicTerms] = useState("");
  const [signatureKey, setSignatureKey] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState<string | null>(null);
  const [signatureScale, setSignatureScale] = useState("medium");
  const [stampScale, setStampScale] = useState("medium");
  const [showSignatureOnWht, setShowSignatureOnWht] = useState(true);
  const [showStampOnWht, setShowStampOnWht] = useState(true);
  const [showSignatureMaster, setShowSignatureMaster] = useState(true);
  const [showStampMaster, setShowStampMaster] = useState(true);
  const [showSignatureOnDocs, setShowSignatureOnDocs] = useState<Record<string, boolean>>({});
  const [showStampOnDocs, setShowStampOnDocs] = useState<Record<string, boolean>>({});
  const [dnShowFullTotals, setDnShowFullTotals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (clientProfile) {
      setLogoKey(clientProfile.logo_url);
      setLogoSize(clientProfile.logo_size || "square");
      setShowLogo(clientProfile.show_logo !== false);
      setShowCompanyName(clientProfile.show_company_name !== false);
      setLogoLayout(clientProfile.logo_layout === "above" ? "above" : "left");
      setPdfTemplate((["modern", "classic", "classic_v2"] as const).includes(clientProfile.pdf_template) ? clientProfile.pdf_template : "modern");
      setClassicV2FontScale(clientProfile.classic_v2_font_scale || "normal");
      setClassicV2SectionScales({
        header: CLASSIC_V2_SECTION_INHERIT,
        items: CLASSIC_V2_SECTION_INHERIT,
        totals: CLASSIC_V2_SECTION_INHERIT,
        footer: CLASSIC_V2_SECTION_INHERIT,
        ...(clientProfile.classic_v2_section_font_scales || {}),
      });
      setClassicTerms(clientProfile.classic_terms || "");
      setSignatureKey(clientProfile.signature_url || null);
      setStampKey(clientProfile.stamp_url || null);
      setSignatureScale(clientProfile.signature_scale || "medium");
      setStampScale(clientProfile.stamp_scale || "medium");
      setShowSignatureOnWht(clientProfile.show_signature_on_wht !== false);
      setShowStampOnWht(clientProfile.show_stamp_on_wht !== false);
      setShowSignatureOnDocs(DOC_VISIBILITY_TYPES.reduce((acc, t) => {
        if (t.key === "wht") {
          acc[t.key] = clientProfile.show_signature_on_wht !== false;
        } else {
          const map = clientProfile.show_signature_on_docs as Record<string, boolean> | null;
          acc[t.key] = map ? (map[t.key] !== false) : true;
        }
        return acc;
      }, {} as Record<string, boolean>));
      const sigDocsAllOn = DOC_VISIBILITY_TYPES
        .filter(t => t.key !== "wht")
        .every(t => showSignatureOnDocs[t.key] !== false);
      // Need computed from above, but above state hasn't updated yet. Compute raw:
      const sigMap = clientProfile.show_signature_on_docs as Record<string, boolean> | null;
      setShowSignatureMaster(!sigMap || !Object.values(sigMap).every(v => v === false));
      const stpMap = clientProfile.show_stamp_on_docs as Record<string, boolean> | null;
      setShowStampMaster(!stpMap || !Object.values(stpMap).every(v => v === false));
      setShowStampOnDocs(DOC_VISIBILITY_TYPES.reduce((acc, t) => {
        if (t.key === "wht") {
          acc[t.key] = clientProfile.show_stamp_on_wht !== false;
        } else {
          const map = clientProfile.show_stamp_on_docs as Record<string, boolean> | null;
          acc[t.key] = map ? (map[t.key] !== false) : true;
        }
        return acc;
      }, {} as Record<string, boolean>));
      setDnShowFullTotals(clientProfile.delivery_note_show_full_totals === true);
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
      show_logo: showLogo,
      show_company_name: showCompanyName,
      logo_layout: logoLayout,
      pdf_template: pdfTemplate,
      classic_v2_font_scale: classicV2FontScale,
      classic_v2_section_font_scales: classicV2SectionScales,
      classic_terms: classicTerms.trim() || null,
      signature_url: signatureKey,
      stamp_url: stampKey,
      signature_scale: signatureScale,
      stamp_scale: stampScale,
      show_signature_on_wht: showSignatureOnWht,
      show_stamp_on_wht: showStampOnWht,
      delivery_note_show_full_totals: dnShowFullTotals,
      show_signature_on_docs: !showSignatureMaster
        ? DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: false }), {})
        : (DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").every(t => showSignatureOnDocs[t.key] !== false) ? null : DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: showSignatureOnDocs[t.key] !== false }), {} as Record<string, boolean>)),
      show_stamp_on_docs: !showStampMaster
        ? DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: false }), {})
        : (DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").every(t => showStampOnDocs[t.key] !== false) ? null : DOC_VISIBILITY_TYPES.filter(t => t.key !== "wht").reduce((acc, t) => ({ ...acc, [t.key]: showStampOnDocs[t.key] !== false }), {} as Record<string, boolean>)),
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

  async function saveAssetField(field: "logo_url" | "signature_url" | "stamp_url", key: string | null) {
    if (!profile || !clientProfile) return;

    setError("");
    setSaved(false);

    const payload: Record<string, unknown> = { [field]: key };
    if (field === "logo_url" && key) {
      payload.show_logo = true;
    }

    const { error: err } = await supabase
      .from("client_profiles")
      .update(payload)
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
      return;
    }

    setSaved(true);
    setClientProfile({
      ...clientProfile,
      ...payload,
    } as ClientProfile);
  }

  if (loading) return <AppShell title="ตั้งค่า > รูปแบบเอกสาร"><Spinner /></AppShell>;

  const isDirty =
    pdfTemplate !== (clientProfile?.pdf_template || "modern") ||
    classicV2FontScale !== (clientProfile?.classic_v2_font_scale || "normal") ||
    CLASSIC_V2_SECTION_FONT_KEYS.some(
      (key) => (classicV2SectionScales[key] || CLASSIC_V2_SECTION_INHERIT) !== (clientProfile?.classic_v2_section_font_scales?.[key] || CLASSIC_V2_SECTION_INHERIT),
    ) ||
    classicTerms !== (clientProfile?.classic_terms || "") ||
    logoKey !== (clientProfile?.logo_url ?? null) ||
    logoSize !== (clientProfile?.logo_size || "square") ||
    showLogo !== (clientProfile?.show_logo !== false) ||
    showCompanyName !== (clientProfile?.show_company_name !== false) ||
    logoLayout !== (clientProfile?.logo_layout === "above" ? "above" : "left") ||
    signatureKey !== (clientProfile?.signature_url ?? null) ||
    stampKey !== (clientProfile?.stamp_url ?? null) ||
    signatureScale !== (clientProfile?.signature_scale || "medium") ||
    stampScale !== (clientProfile?.stamp_scale || "medium");

  return (
    <AppShell title="ตั้งค่า > รูปแบบเอกสาร">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/documents" />

        <Card>
          <div className="space-y-3">
            {profile && (
              <LogoUpload
                userId={profile.id}
                currentLogoKey={logoKey}
                onLogoChange={(k) => {
                  setLogoKey(k);
                  if (k) setShowLogo(true);
                  void saveAssetField("logo_url", k);
                }}
              />
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

            {logoKey && (
              <div>
                <p className="text-[11px] font-semibold text-[#888780] mb-1.5">ตำแหน่งโลโก้</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setLogoLayout("left"); setSaved(false); }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs ${logoLayout === "left" ? "border-[#378ADD] bg-[#EEF6FF] text-[#1A56DB]" : "border-[#E8E6DF] bg-white text-[#5F5B54]"}`}
                  >
                    ชิดซ้าย (ข้างชื่อ)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLogoLayout("above"); setSaved(false); }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs ${logoLayout === "above" ? "border-[#378ADD] bg-[#EEF6FF] text-[#1A56DB]" : "border-[#E8E6DF] bg-white text-[#5F5B54]"}`}
                  >
                    ด้านบน (เหนือชื่อ)
                  </button>
                </div>
                <p className="text-[11px] text-[#888780] mt-1">
                  {!showLogo
                    ? "โลโก้ถูกซ่อนในเอกสาร — ตำแหน่งจะมีผลเมื่อเปิดแสดงโลโก้"
                    : !showCompanyName
                      ? "เมื่อปิดชื่อบริษัท โลโก้จะแสดงด้านบนอยู่แล้ว — ตำแหน่งมีผลเมื่อเปิดชื่อบริษัท"
                      : "“ด้านบน” วางโลโก้ชิดซ้ายเหนือชื่อบริษัท — แก้การเลื่อนเมื่อชื่อยาว"}
                </p>
              </div>
            )}

            {logoKey && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLogo}
                  onChange={(e) => { setShowLogo(e.target.checked); setSaved(false); }}
                  className="w-3.5 h-3.5 accent-primary rounded"
                />
                <span className="text-xs text-gray-600">แสดงโลโก้ในเอกสาร</span>
              </label>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompanyName}
                onChange={(e) => { setShowCompanyName(e.target.checked); setSaved(false); }}
                className="w-3.5 h-3.5 accent-primary rounded"
              />
              <span className="text-xs text-gray-600">แสดงชื่อบริษัทในเอกสาร</span>
            </label>
            {!showCompanyName && (
              <p className="text-[11px] text-[#888780] -mt-1">
                เมื่อปิดชื่อบริษัท โลโก้จะถูกใช้แทน ให้เลือกขนาด "ใหญ่ (แทนชื่อบริษัท)" และอัปโหลดโลโก้ที่มีรายละเอียดครบ
              </p>
            )}

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">เทมเพลต PDF</p>
              <Select
                value={pdfTemplate}
                onChange={(e) => { setPdfTemplate(e.target.value as "modern" | "classic" | "classic_v2"); setSaved(false); }}
              >
                <option value="modern">โมเดิร์น (Modern)</option>
                <option value="classic">คลาสสิก (Thai Classic)</option>
                {hasClassicV2 && <option value="classic_v2">คลาสสิก V2</option>}
              </Select>
              <p className="text-[11px] text-[#888780] mt-1">
                เทมเพลตเริ่มต้นสำหรับเอกสารทุกประเภท มีผลกับเอกสารใหม่เท่านั้น
              </p>
              {pdfTemplate === "classic_v2" && (
                <div className="mt-3">
                  <Select
                    label="ขนาดตัวอักษร (คลาสสิก V2)"
                    value={classicV2FontScale}
                    onChange={(e) => { setClassicV2FontScale(e.target.value); setSaved(false); }}
                  >
                    {CLASSIC_V2_FONT_SCALE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-[#888780] mt-1">
                    ปรับขนาดตัวอักษรทั้งเอกสาร — ระบบจะคำนวณจำนวนรายการต่อหน้าให้อัตโนมัติ
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
                    {(
                      [
                        { key: "header" as const, label: "ส่วนหัว (ชื่อบริษัท/ลูกค้า)" },
                        { key: "items" as const, label: "ตารางรายการ" },
                        { key: "totals" as const, label: "ยอดรวม/เงื่อนไข" },
                        { key: "footer" as const, label: "ลายเซ็น/ท้ายเอกสาร" },
                      ]
                    ).map(({ key, label }) => (
                      <Select
                        key={key}
                        label={label}
                        value={classicV2SectionScales[key] || CLASSIC_V2_SECTION_INHERIT}
                        onChange={(e) => {
                          setClassicV2SectionScales({ ...classicV2SectionScales, [key]: e.target.value });
                          setSaved(false);
                        }}
                      >
                        <option value={CLASSIC_V2_SECTION_INHERIT}>ตามขนาดหลัก</option>
                        {CLASSIC_V2_FONT_SCALE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </Select>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#888780] mt-1">
                    ปรับขนาดเฉพาะส่วน — ค่าเริ่มต้น “ตามขนาดหลัก” ใช้ขนาดตัวอักษรด้านบน
                  </p>
                </div>
              )}
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  ข้อความเงื่อนไขท้ายเอกสาร
                </label>
                <textarea
                  value={classicTerms}
                  onChange={(e) => { setClassicTerms(e.target.value); setSaved(false); }}
                  rows={4}
                  placeholder="เว้นว่าง = ไม่แสดงเงื่อนไขท้ายเอกสาร"
                  className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 resize-none"
                />
                <p className="text-[11px] text-[#888780] mt-1">
                  ใช้ข้อความของคุณเองเท่านั้น (หนึ่งบรรทัดต่อหนึ่งข้อ) หากเว้นว่างจะไม่พิมพ์เงื่อนไขท้ายเอกสาร
                </p>
              </div>
            </div>

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">ใบส่งของ</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dnShowFullTotals}
                  onChange={(e) => { setDnShowFullTotals(e.target.checked); setSaved(false); }}
                  className="w-3.5 h-3.5 accent-primary rounded"
                />
                <span className="text-xs text-gray-600">แสดงยอดรวมแบบใบแจ้งหนี้สำหรับใบส่งของ (ค่าเริ่มต้น)</span>
              </label>
              <p className="text-[11px] text-[#888780] mt-1">
                ค่าเริ่มต้นสำหรับใบส่งของใหม่ แสดง VAT / หัก ณ ที่จ่าย / ยอดสุทธิแบบใบแจ้งหนี้ หากปิดจะแสดงเฉพาะมูลค่ารวม สามารถปรับแต่งได้รายเอกสาร
              </p>
            </div>

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">ลายเซ็นและตราประทับ</p>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <ImageUpload
                    userId={profile!.id}
                    storageKeyFn={signatureKeyFn}
                    currentKey={signatureKey}
                    onKeyChange={(k) => {
                      setSignatureKey(k);
                      void saveAssetField("signature_url", k);
                    }}
                    label="ลายเซ็น"
                  />
                  {signatureKey && (
                    <div className="flex items-center gap-2 ml-1">
                      <label className="text-xs text-gray-600 shrink-0">ขนาด:</label>
                      <select
                        value={signatureScale}
                        onChange={(e) => { setSignatureScale(e.target.value); setSaved(false); }}
                        className="rounded-lg border border-card-border bg-white px-2 py-1.5 text-xs"
                      >
                        {ASSET_SCALE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {signatureKey && (
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={showSignatureMaster}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setShowSignatureMaster(on);
                            const next: Record<string, boolean> = {};
                            DOC_VISIBILITY_TYPES.forEach(t => { next[t.key] = on; });
                            setShowSignatureOnDocs(next);
                            if (!on) setShowSignatureOnWht(false);
                            else setShowSignatureOnWht(true);
                            setSaved(false);
                          }}
                          className="w-3.5 h-3.5 accent-primary rounded"
                        />
                        <span className="text-xs text-gray-600">แสดงลายเซ็นในเอกสาร</span>
                      </label>
                      {showSignatureMaster && (
                        <div className="grid grid-cols-4 gap-x-3 gap-y-1 ml-5">
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
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <ImageUpload
                    userId={profile!.id}
                    storageKeyFn={stampKeyFn}
                    currentKey={stampKey}
                    onKeyChange={(k) => {
                      setStampKey(k);
                      void saveAssetField("stamp_url", k);
                    }}
                    label="ตราประทับ"
                  />
                  {stampKey && (
                    <div className="flex items-center gap-2 ml-1">
                      <label className="text-xs text-gray-600 shrink-0">ขนาด:</label>
                      <select
                        value={stampScale}
                        onChange={(e) => { setStampScale(e.target.value); setSaved(false); }}
                        className="rounded-lg border border-card-border bg-white px-2 py-1.5 text-xs"
                      >
                        {ASSET_SCALE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {stampKey && (
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={showStampMaster}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setShowStampMaster(on);
                            const next: Record<string, boolean> = {};
                            DOC_VISIBILITY_TYPES.forEach(t => { next[t.key] = on; });
                            setShowStampOnDocs(next);
                            if (!on) setShowStampOnWht(false);
                            else setShowStampOnWht(true);
                            setSaved(false);
                          }}
                          className="w-3.5 h-3.5 accent-primary rounded"
                        />
                        <span className="text-xs text-gray-600">แสดงตราประทับในเอกสาร</span>
                      </label>
                      {showStampMaster && (
                        <div className="grid grid-cols-4 gap-x-3 gap-y-1 ml-5">
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
                      )}
                    </div>
                  )}
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
