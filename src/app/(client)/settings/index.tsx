import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { LogoUpload } from "../../../components/ui/LogoUpload";
import { ImageUpload } from "../../../components/ui/ImageUpload";
import { Spinner } from "../../../components/ui/Spinner";
import { Skeleton } from "../../../components/ui/Skeleton";
import { useToast } from "../../../hooks/useToast";
import { WHT_RATE_OPTIONS, DOC_TYPE_LABELS, LOGO_SIZE_OPTIONS } from "../../../constants";
import { signatureKey as signatureKeyFn, stampKey as stampKeyFn } from "../../../lib/r2";
import type { ClientProfile, DocNumberSequence, DocumentType } from "../../../types";

const DOC_TYPES: DocumentType[] = [
  "quotation",
  "invoice",
  "tax_invoice_receipt",
  "billing_note",
  "receipt",
  "delivery_note",
  "credit_note",
];

const CARD_LABEL = "text-[11px] uppercase font-semibold text-[#888780] tracking-wide";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile, loading: profileLoading, setClientProfile } = useClientProfile(userId);
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [pageLoading, setPageLoading] = useState(true);

  const [companyNameTh, setCompanyNameTh] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [pdfTemplate, setPdfTemplate] = useState("modern");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [signatureKey, setSignatureKey] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState<string | null>(null);
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState("small");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRate, setVatRate] = useState("7.00");
  const [defaultWhtRate, setDefaultWhtRate] = useState("0");
  const [creditTermDays, setCreditTermDays] = useState(7);
  const [savingTax, setSavingTax] = useState(false);
  const [taxError, setTaxError] = useState("");
  const [taxSaved, setTaxSaved] = useState(false);

  const [sequences, setSequences] = useState<Record<string, DocNumberSequence>>({});
  const [prefixesChanged, setPrefixesChanged] = useState(false);
  const [savingNumbers, setSavingNumbers] = useState(false);
  const [numberError, setNumberError] = useState("");
  const [numbersSaved, setNumbersSaved] = useState(false);

  const [stockTrigger, setStockTrigger] = useState("invoice");
  const [savingStock, setSavingStock] = useState(false);
  const [stockError, setStockError] = useState("");

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");

  useEffect(() => {
    if (!userId) return;

    Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("doc_number_sequences")
        .select("*")
        .eq("user_id", userId)
        .order("doc_type"),
    ]).then(([userRes, seqRes]) => {
      if (userRes.data?.user?.email) {
        setEmail(userRes.data.user.email);
      }
      if (!seqRes.error && seqRes.data) {
        const map: Record<string, DocNumberSequence> = {};
        for (const seq of seqRes.data as DocNumberSequence[]) {
          map[seq.doc_type] = seq;
        }
        setSequences(map);
      }
      setPageLoading(false);
    });
  }, [userId]);

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
      setVatRegistered(clientProfile.vat_registered);
      setVatRate(String(clientProfile.vat_rate));
      setDefaultWhtRate(clientProfile.default_wht_rate);
      setCreditTermDays(clientProfile.credit_term_days ?? 7);
      setStockTrigger(clientProfile.stock_deduct_trigger || "invoice");
      setPdfTemplate(clientProfile.pdf_template || "modern");
      setBankName((clientProfile as any).bank_name || "");
      setBankAccount((clientProfile as any).bank_account || "");
      setSignatureKey((clientProfile as any).signature_url || null);
      setStampKey((clientProfile as any).stamp_url || null);
    }
  }, [clientProfile]);

  function getPrefix(docType: DocumentType): string {
    return sequences[docType]?.prefix || "";
  }

  function getResetYearly(docType: DocumentType): boolean {
    return sequences[docType]?.reset_yearly ?? true;
  }

  function setPrefix(docType: DocumentType, value: string) {
    setPrefixesChanged(true);
    setNumbersSaved(false);
    setSequences((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], doc_type: docType, prefix: value } as DocNumberSequence,
    }));
  }

  function setResetYearly(docType: DocumentType, value: boolean) {
    setPrefixesChanged(true);
    setNumbersSaved(false);
    setSequences((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], doc_type: docType, reset_yearly: value } as DocNumberSequence,
    }));
  }

  async function handleSaveProfile() {
    if (!userId || !clientProfile) return;
    setSavingProfile(true);
    setProfileError("");
    setProfileSaved(false);

    if (!companyNameTh.trim()) {
      setProfileError("กรุณากรอกชื่อบริษัท (ภาษาไทย)");
      setSavingProfile(false);
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
      bank_name: bankName.trim() || null,
      bank_account: bankAccount.trim() || null,
      signature_url: signatureKey,
      stamp_url: stampKey,
    };

    let err;
    try {
      const result = await supabase
        .from("client_profiles")
        .update({ ...basePayload, contact_name: contactName.trim() || null })
        .eq("user_id", userId);
      err = result.error;
    } catch {
      const result = await supabase
        .from("client_profiles")
        .update(basePayload)
        .eq("user_id", userId);
      err = result.error;
    }

    if (err) {
      setProfileError(err.message);
      toast.error(err.message);
    } else {
      setProfileSaved(true);
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        company_name_th: companyNameTh.trim(),
        company_name_en: companyNameEn.trim() || null,
        tax_id: taxId || null,
        address: address || null,
        phone: phone || null,
        logo_url: logoKey,
      } as ClientProfile);
    }
    setSavingProfile(false);
  }

  async function handleSaveTax() {
    if (!userId || !clientProfile) return;
    setSavingTax(true);
    setTaxError("");
    setTaxSaved(false);

    const { error: err } = await supabase
      .from("client_profiles")
      .update({
        vat_registered: vatRegistered,
        vat_rate: parseFloat(vatRate),
        default_wht_rate: defaultWhtRate,
        credit_term_days: creditTermDays,
      })
      .eq("user_id", userId);

    if (err) {
      setTaxError(err.message);
      toast.error(err.message);
    } else {
      setTaxSaved(true);
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        vat_registered: vatRegistered,
        vat_rate: parseFloat(vatRate),
        default_wht_rate: defaultWhtRate as any,
        credit_term_days: creditTermDays,
      } as ClientProfile);
    }
    setSavingTax(false);
  }

  async function handleSaveNumbering() {
    if (!userId) return;
    setSavingNumbers(true);
    setNumberError("");
    setNumbersSaved(false);

    const rows = DOC_TYPES.map((docType) => {
      const existing = sequences[docType];
      const prefix = getPrefix(docType);
      const resetYearly = getResetYearly(docType);

      if (existing?.id) {
        return { id: existing.id, prefix, reset_yearly: resetYearly };
      }
      return { user_id: userId, doc_type: docType, prefix, reset_yearly: resetYearly, last_sequence: 0 };
    });

    const upserts = rows.map((row) => {
      if ("id" in row && row.id) {
        return supabase
          .from("doc_number_sequences")
          .update({ prefix: row.prefix, reset_yearly: row.reset_yearly })
          .eq("id", row.id);
      }
      const { id: _id, ...insertRow } = row as any;
      return supabase.from("doc_number_sequences").insert(insertRow);
    });

    const results = await Promise.all(upserts);
    const hasError = results.some((r) => r.error);
    if (hasError) {
      const msg = results.find((r) => r.error)?.error?.message || "เกิดข้อผิดพลาด";
      setNumberError(msg);
      toast.error(msg);
    } else {
      setNumbersSaved(true);
      setPrefixesChanged(false);
      toast.success("บันทึกแล้ว");
    }
    setSavingNumbers(false);
  }

  async function handleSaveStock() {
    if (!userId || !clientProfile) return;
    setSavingStock(true);
    setStockError("");

    const { error: err } = await supabase
      .from("client_profiles")
      .update({ stock_deduct_trigger: stockTrigger })
      .eq("user_id", userId);

    if (err) {
      setStockError(err.message);
      toast.error(err.message);
    } else {
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        stock_deduct_trigger: stockTrigger,
      } as ClientProfile);
    }
    setSavingStock(false);
  }

  async function handleChangePassword() {
    setChangingPassword(true);
    setPasswordError("");
    setPasswordSaved(false);

    if (!currentPassword) {
      setPasswordError("กรุณากรอกรหัสผ่านปัจจุบัน");
      setChangingPassword(false);
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
      setChangingPassword(false);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("รหัสผ่านใหม่ไม่ตรงกัน");
      setChangingPassword(false);
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInErr) {
      setPasswordError("รหัสผ่านปัจจุบันไม่ถูกต้อง");
      setChangingPassword(false);
      return;
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateErr) {
      setPasswordError(updateErr.message);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordSaved(true);
    }
    setChangingPassword(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  if (profileLoading || pageLoading) {
    return (
      <AppShell title="ตั้งค่า">
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!clientProfile) {
    return (
      <AppShell title="ตั้งค่า">
        <p className="text-sm text-gray-500">ไม่พบข้อมูลโปรไฟล์</p>
      </AppShell>
    );
  }

  const isProfileIncomplete = !companyNameTh.trim();

  return (
    <AppShell title="ตั้งค่า">
      <div className="space-y-4">
        {isProfileIncomplete && (
          <div className="bg-[#FAEEDA] border border-[#E8D5B2] rounded-[8px] px-4 py-3 text-sm text-[#633806]">
            <span className="font-medium">⚠ ข้อมูลบริษัทยังไม่ครบ</span>
            <p className="text-xs mt-0.5">
              เพิ่มชื่อบริษัทและที่อยู่เพื่อให้เอกสาร PDF แสดงถูกต้อง
            </p>
          </div>
        )}

        <div className={`${CARD_LABEL} pt-1`}>ข้อมูลบริษัท</div>

        <Card>
          <div className="space-y-3">
            {userId && (
              <LogoUpload userId={userId} currentLogoKey={logoKey} onLogoChange={setLogoKey} />
            )}

            {logoKey && (
              <Select
                label="ขนาดโลโก้บนเอกสาร"
                value={logoSize}
                onChange={(e) => { setLogoSize(e.target.value); setProfileSaved(false); }}
              >
                {LOGO_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label} ({opt.px}px)</option>
                ))}
              </Select>
            )}

            <Input
              label="ชื่อบริษัท (ภาษาไทย) *"
              value={companyNameTh}
              onChange={(e) => { setCompanyNameTh(e.target.value); setProfileSaved(false); }}
              placeholder="บริษัท มาลี จำกัด"
            />
            <Input
              label="ชื่อบริษัท (ภาษาอังกฤษ)"
              value={companyNameEn}
              onChange={(e) => { setCompanyNameEn(e.target.value); setProfileSaved(false); }}
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
                onChange={(e) => { setAddress(e.target.value); setProfileSaved(false); }}
                placeholder="ที่อยู่สำหรับพิมพ์บนเอกสาร"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 placeholder:text-gray-400 resize-none"
              />
            </div>

            <Input
              label="เบอร์โทรศัพท์"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setProfileSaved(false); }}
            />
            <Input
              label="ชื่อผู้ติดต่อ / ชื่อเจ้าของ"
              value={contactName}
              onChange={(e) => { setContactName(e.target.value); setProfileSaved(false); }}
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
                onChange={(e) => { setBankName(e.target.value); setProfileSaved(false); }}
                placeholder="ธนาคารกสิกรไทย"
              />
              <Input
                label="เลขที่บัญชี"
                value={bankAccount}
                onChange={(e) => { setBankAccount(e.target.value); setProfileSaved(false); }}
                placeholder="XXX-X-XXXXX-X"
              />
            </div>

            <div className="border-t border-[#E8E6DF] pt-3">
              <p className="text-[11px] font-semibold text-[#888780] mb-2">ลายเซ็นและตราประทับ</p>
              <div className="grid grid-cols-2 gap-3">
                <ImageUpload
                  userId={userId!}
                  storageKeyFn={signatureKeyFn}
                  currentKey={signatureKey}
                  onKeyChange={(k) => { setSignatureKey(k); setProfileSaved(false); }}
                  label="ลายเซ็น"
                />
                <ImageUpload
                  userId={userId!}
                  storageKeyFn={stampKeyFn}
                  currentKey={stampKey}
                  onKeyChange={(k) => { setStampKey(k); setProfileSaved(false); }}
                  label="ตราประทับ"
                />
              </div>
              <p className="text-[11px] text-[#888780] mt-1">
                ลายเซ็นและตราจะแสดงบนเอกสารใบแจ้งหนี้ ใบกำกับภาษี และใบวางบิล
              </p>
            </div>

            {profileError && <p className="text-xs text-red-500">{profileError}</p>}
            {profileSaved && <p className="text-xs text-green-600">บันทึกแล้ว ✓</p>}

            <div className="relative">
              <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">
                {savingProfile ? "กำลังบันทึก..." : "บันทึกข้อมูลบริษัท"}
              </Button>
              {!profileSaved && (companyNameTh !== clientProfile.company_name_th ||
                address !== (clientProfile.address || "") ||
                phone !== (clientProfile.phone || "") ||
                contactName !== ((clientProfile as any).contact_name || "")) && (
                <div className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-[#378ADD]" />
              )}
            </div>
          </div>
        </Card>

        <div className={CARD_LABEL}>ตั้งค่าภาษี</div>

        <Card>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium text-[#1A1A18]">
                  จดทะเบียนภาษีมูลค่าเพิ่ม
                </span>
              </div>
              <button
                type="button"
                onClick={() => setVatRegistered(!vatRegistered)}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  vatRegistered ? "bg-[#378ADD]" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    vatRegistered ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>

            <p className="text-[11px] text-[#888780] leading-relaxed">
              {vatRegistered
                ? 'เอกสารจะออกเป็น ใบกำกับภาษี และแสดง VAT อัตโนมัติ'
                : 'เอกสารจะออกเป็น ใบแจ้งหนี้ ไม่มีรายการ VAT'}
            </p>

            {vatRegistered && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#1A1A18] shrink-0">
                  อัตราภาษีมูลค่าเพิ่ม
                </label>
                <div className="relative w-20">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={vatRate}
                    onChange={(e) => { setVatRate(e.target.value); setTaxSaved(false); }}
                    className="w-full px-2 py-1.5 pr-7 text-sm text-right border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD]"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-[#888780]">
                    %
                  </span>
                </div>
              </div>
            )}

            <Select
              label="อัตราเริ่มต้น WHT"
              value={defaultWhtRate}
              onChange={(e) => { setDefaultWhtRate(e.target.value); setTaxSaved(false); }}
            >
              {WHT_RATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <p className="text-[11px] text-[#888780] -mt-3">
              ใช้เป็นค่าเริ่มต้นในทุกเอกสาร แก้ไขได้ต่อเอกสาร
            </p>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-[#1A1A18] shrink-0">
                ระยะเวลาเครดิต (วัน)
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={creditTermDays}
                onChange={(e) => { setCreditTermDays(Number(e.target.value)); setTaxSaved(false); }}
                className="w-20 px-2 py-1.5 text-sm text-right border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD]"
              />
              <span className="text-sm text-[#888780]">วัน</span>
            </div>
            <p className="text-[11px] text-[#888780] -mt-3">
              ใช้คำนวณวันที่ครบกำหนดชำระในใบวางบิล
            </p>

            <div className="bg-[#E6F1FB] text-[#0C447C] rounded-[8px] px-3 py-2.5 text-[12px]">
              <span className="font-medium">ℹ</span> การเปลี่ยนแปลงการตั้งค่าภาษีจะมีผลกับเอกสารใหม่เท่านั้น
              เอกสารที่สร้างไปแล้วจะไม่เปลี่ยนแปลง
            </div>

            {taxError && <p className="text-xs text-red-500">{taxError}</p>}
            {taxSaved && <p className="text-xs text-green-600">บันทึกแล้ว ✓</p>}

            <Button onClick={handleSaveTax} disabled={savingTax} className="w-full">
              {savingTax ? "กำลังบันทึก..." : "บันทึกการตั้งค่าภาษี"}
            </Button>
          </div>
        </Card>

        <div className={CARD_LABEL}>เลขที่เอกสาร</div>

        <Card>
          <div className="space-y-4">
            <p className="text-[12px] text-[#888780]">
              ตั้งค่า prefix และรูปแบบเลขที่สำหรับแต่ละประเภทเอกสาร
            </p>

            {DOC_TYPES.map((docType) => (
              <div key={docType} className="flex items-center gap-3 pb-2 border-b border-[#E8E6DF]/50 last:border-0">
                <span className="text-[13px] text-[#1A1A18] w-[110px] shrink-0">
                  {DOC_TYPE_LABELS[docType].th}
                </span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    value={getPrefix(docType)}
                    onChange={(e) => setPrefix(docType, e.target.value.toUpperCase().slice(0, 5))}
                    className="w-[60px] px-2 py-1.5 text-xs text-center uppercase border border-[#E8E6DF] rounded-lg bg-[#F7F6F3] focus:outline-none focus:border-[#378ADD]"
                    maxLength={5}
                  />
                  <span className="text-[11px] text-[#888780] truncate">
                    ตัวอย่าง: {getPrefix(docType) || "..."}-{currentYear}-{currentMonth}-001
                  </span>
                </div>
              </div>
            ))}

            <div className="border-t border-[#E8E6DF] pt-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={getResetYearly("invoice")}
                  onChange={(e) => {
                    DOC_TYPES.forEach((t) => setResetYearly(t, e.target.checked));
                  }}
                  className="mt-0.5 w-4 h-4 text-[#378ADD] rounded border-[#E8E6DF]"
                />
                <div>
                  <span className="text-sm text-[#1A1A18]">
                    รีเซ็ตลำดับทุกปี
                  </span>
                  <p className="text-[11px] text-[#888780] mt-0.5">
                    เลขที่จะเริ่มต้นใหม่ทุกต้นปี
                  </p>
                </div>
              </label>
            </div>

            {prefixesChanged && (
              <div className="bg-[#FAEEDA] text-[#633806] rounded-[8px] px-3 py-2.5 text-[12px]">
                <span className="font-medium">⚠</span> การเปลี่ยน prefix จะมีผลกับเอกสารใหม่เท่านั้น
                เลขที่เดิมจะยังคงอยู่ในระบบ
              </div>
            )}

            {numberError && <p className="text-xs text-red-500">{numberError}</p>}
            {numbersSaved && <p className="text-xs text-green-600">บันทึกแล้ว ✓</p>}

            <Button onClick={handleSaveNumbering} disabled={savingNumbers} className="w-full">
              {savingNumbers ? "กำลังบันทึก..." : "บันทึกการตั้งค่าเลขที่"}
            </Button>
          </div>
        </Card>

        <div className={CARD_LABEL}>การจัดการสต็อก</div>

        <Card>
          <div className="space-y-3">
            <div className="text-[13px] font-medium text-[#1A1A18] mb-1">
              ตัดสต็อกอัตโนมัติเมื่อ
            </div>

            {([
              { value: "invoice", title: "ส่งใบแจ้งหนี้ / ใบกำกับภาษี", desc: "ระบบตัดสต็อกทันทีที่ยืนยันว่าส่งแล้ว เหมาะสำหรับธุรกิจบริการและสินค้าทั่วไป", recommended: true },
              { value: "delivery_note", title: "ออกใบส่งของ", desc: "ระบบตัดสต็อกเมื่อส่งใบส่งของ เหมาะสำหรับธุรกิจที่เบิกสินค้าออกจากคลังก่อนออกบิล", recommended: false },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 cursor-pointer p-2.5 rounded-[8px] border transition-colors ${
                  stockTrigger === opt.value
                    ? "bg-[#F0F7FF] border-[#378ADD]"
                    : "bg-white border-[#E8E6DF]"
                }`}
              >
                <input
                  type="radio"
                  name="stockTrigger"
                  value={opt.value}
                  checked={stockTrigger === opt.value}
                  onChange={() => setStockTrigger(opt.value)}
                  className="mt-0.5 w-[18px] h-[18px] text-[#378ADD] border-[#E8E6DF]"
                />
                <div>
                  <div className="text-[13px] font-medium text-[#1A1A18]">
                    {opt.title}
                  </div>
                  <div className="text-[11px] text-[#888780] mt-0.5">
                    {opt.desc}
                  </div>
                </div>
              </label>
            ))}

            {stockError && <p className="text-xs text-red-500">{stockError}</p>}

            <Button onClick={handleSaveStock} disabled={savingStock} className="w-full">
              {savingStock ? "กำลังบันทึก..." : "บันทึกการตั้งค่าสต็อก"}
            </Button>
          </div>
        </Card>

        <div className={CARD_LABEL}>บัญชี</div>

        <Card>
          <div className="space-y-3">
            <div>
              <p className="text-[12px] text-[#888780]">อีเมล</p>
              <p className="text-[13px] text-[#1A1A18]">{email}</p>
            </div>

            <div className="border-t border-[#E8E6DF] pt-3">
              <Input
                label="รหัสผ่านปัจจุบัน"
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordSaved(false); }}
                placeholder="รหัสผ่านปัจจุบัน"
              />
              <Input
                label="รหัสผ่านใหม่"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordSaved(false); }}
                placeholder="รหัสผ่านอย่างน้อย 6 ตัวอักษร"
              />
              <Input
                label="ยืนยันรหัสผ่านใหม่"
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => { setNewPasswordConfirm(e.target.value); setPasswordSaved(false); }}
                placeholder="ใส่รหัสผ่านอีกครั้ง"
              />

              {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
              {passwordSaved && <p className="text-xs text-green-600">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ✓</p>}

              <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full">
                {changingPassword ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
              </Button>
            </div>

            <button
              onClick={() => {
                if (window.confirm("ออกจากระบบ?")) handleLogout();
              }}
              className="text-red-500 text-[13px] font-medium hover:underline"
            >
              ออกจากระบบ
            </button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
