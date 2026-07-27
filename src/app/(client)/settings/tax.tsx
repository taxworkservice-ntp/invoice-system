import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { WHT_RATE_OPTIONS } from "../../../constants";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { WhtRate } from "../../../types";

export default function SettingsTaxPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const toast = useToast();

  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRate, setVatRate] = useState("7.00");
  const [defaultWhtRate, setDefaultWhtRate] = useState<WhtRate>("0");
  const [creditTermDays, setCreditTermDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [vatChangeOpen, setVatChangeOpen] = useState(false);
  const [pendingVatRegistered, setPendingVatRegistered] = useState<boolean | null>(null);
  const [vatChangeConfirmed, setVatChangeConfirmed] = useState(false);

  useEffect(() => {
    if (clientProfile) {
      setVatRegistered(clientProfile.vat_registered);
      setVatRate(String(clientProfile.vat_rate));
      setDefaultWhtRate(clientProfile.default_wht_rate);
      setCreditTermDays(clientProfile.credit_term_days ?? 7);
    }
  }, [clientProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSaved(false);

    const parsedVatRate = parseFloat(vatRate);
    if (vatRegistered && (!Number.isFinite(parsedVatRate) || parsedVatRate < 0 || parsedVatRate > 100)) {
      setError("กรุณากรอกอัตรา VAT ระหว่าง 0-100%");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(creditTermDays) || creditTermDays < 0 || creditTermDays > 90) {
      setError("กรุณากรอกเครดิตเทอมระหว่าง 0-90 วัน");
      setSaving(false);
      return;
    }

    const { error: err } = await supabase
      .from("client_profiles")
      .update({
        vat_registered: vatRegistered,
        vat_rate: vatRegistered ? parsedVatRate : clientProfile.vat_rate,
        default_wht_rate: defaultWhtRate,
        credit_term_days: creditTermDays,
      })
      .eq("user_id", profile.id);

    if (err) {
      setError(err.message);
      toast.error(err.message);
    } else {
      setSaved(true);
      toast.success("บันทึกแล้ว");
      setClientProfile({
        ...clientProfile,
        vat_registered: vatRegistered,
        vat_rate: vatRegistered ? parsedVatRate : clientProfile.vat_rate,
        default_wht_rate: defaultWhtRate,
        credit_term_days: creditTermDays,
      });
    }
    setSaving(false);
  }

  function openVatChange(nextValue: boolean) {
    if (nextValue === vatRegistered) return;
    setPendingVatRegistered(nextValue);
    setVatChangeConfirmed(false);
    setVatChangeOpen(true);
  }

  function confirmVatChange() {
    if (pendingVatRegistered === null || !vatChangeConfirmed) return;
    setVatRegistered(pendingVatRegistered);
    setSaved(false);
    setVatChangeOpen(false);
    setPendingVatRegistered(null);
    setVatChangeConfirmed(false);
  }

  if (loading) return <AppShell title="ตั้งค่า > ภาษี"><Spinner /></AppShell>;

  const isDirty =
    vatRegistered !== clientProfile?.vat_registered ||
    (vatRegistered && vatRate !== String(clientProfile?.vat_rate)) ||
    defaultWhtRate !== clientProfile?.default_wht_rate ||
    creditTermDays !== (clientProfile?.credit_term_days ?? 7);
  const effectiveVatRate = vatRegistered ? vatRate || "0" : "0";

  return (
    <AppShell title="ตั้งค่า > ภาษี">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/tax" />

        <Card>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#1A1A18]">สถานะ VAT ของกิจการ</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#888780]">
                  ใช้กำหนดชื่อเอกสาร การแสดง VAT และยอดภาษีของเอกสารใหม่
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                vatRegistered ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
              }`}>
                {vatRegistered ? "จด VAT" : "ไม่จด VAT"}
              </span>
            </div>

            <div className={`rounded-[8px] border p-3 ${
              vatRegistered ? "border-emerald-200 bg-emerald-50/60" : "border-[#E8E6DF] bg-[#FAF8F3]"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-[#1A1A18]">
                    {vatRegistered ? "ใช้โหมดจดทะเบียน VAT" : "ใช้โหมดไม่จด VAT"}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#66625C]">
                    {vatRegistered
                      ? "เอกสารขายใหม่จะเป็นใบกำกับภาษีและคำนวณ VAT ตามอัตราที่ตั้งไว้"
                      : "เอกสารขายใหม่จะไม่มีรายการ VAT และรับเงินทันทีจะออกเป็นใบเสร็จรับเงิน"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openVatChange(!vatRegistered)}
                  className="shrink-0 !w-auto px-3 py-1.5 text-xs"
                >
                  เปลี่ยน
                </Button>
              </div>
              <div className="mt-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                สถานะ VAT ถูกล็อกไว้เพื่อกันการกดผิด ต้องยืนยันแยกต่างหากก่อนเปลี่ยน
              </div>
            </div>

            {vatRegistered && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  อัตราภาษีมูลค่าเพิ่ม
                </label>
                <div className="relative max-w-[120px]">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={vatRate}
                  onChange={(e) => { setVatRate(e.target.value); setSaved(false); }}
                  className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 pr-8 text-right text-sm focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#888780]">%</span>
                </div>
              </div>
            )}

            <div className="rounded-[8px] border border-[#E8E6DF] bg-[#FAF8F3] px-3 py-2.5 text-[12px] text-[#444441]">
              <div className="font-medium text-[#1A1A18]">ตัวอย่างผลกับเอกสารใหม่</div>
              <div className="mt-1 grid gap-1 sm:grid-cols-3">
                <span>ใบขาย: {vatRegistered ? "ใบกำกับภาษี" : "ใบแจ้งหนี้"}</span>
                <span>รับเงินทันที: {vatRegistered ? "ใบกำกับภาษี/ใบเสร็จ" : "ใบเสร็จรับเงิน"}</span>
                <span>VAT: {effectiveVatRate}%</span>
              </div>
            </div>

            <Select
              label="อัตราเริ่มต้น WHT"
              value={defaultWhtRate}
              onChange={(e) => { setDefaultWhtRate(e.target.value as WhtRate); setSaved(false); }}
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
                onChange={(e) => { setCreditTermDays(Number(e.target.value)); setSaved(false); }}
                className="w-20 px-2 py-1.5 text-sm text-right border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD]"
              />
              <span className="text-sm text-[#888780]">วัน</span>
            </div>
            <p className="text-[11px] text-[#888780] -mt-3">
              ใช้คำนวณวันที่ครบกำหนดชำระในใบวางบิล
            </p>

            <div className="bg-[#E6F1FB] text-[#0C447C] rounded-[8px] px-3 py-2.5 text-[12px]">
              การเปลี่ยนแปลงการตั้งค่าภาษีจะมีผลกับเอกสารใหม่เท่านั้น
              เอกสารที่สร้างไปแล้วจะไม่เปลี่ยนแปลง
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {saved && <p className="text-xs text-green-600">บันทึกแล้ว</p>}

            <div className="relative">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าภาษี"}
              </Button>
              {isDirty && !saved && (
                <div className="absolute right-1 top-1 h-[6px] w-[6px] rounded-full bg-[#378ADD]" />
              )}
            </div>
          </div>
        </Card>

        <Modal
          open={vatChangeOpen}
          title="ยืนยันการเปลี่ยนสถานะ VAT"
          onClose={() => {
            setVatChangeOpen(false);
            setPendingVatRegistered(null);
            setVatChangeConfirmed(false);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
              คุณกำลังจะเปลี่ยนจาก
              <span className="font-semibold"> {vatRegistered ? "จด VAT" : "ไม่จด VAT"} </span>
              เป็น
              <span className="font-semibold"> {pendingVatRegistered ? "จด VAT" : "ไม่จด VAT"} </span>
              สำหรับเอกสารใหม่หลังจากบันทึกการตั้งค่า
            </div>

            <div className="text-[12px] leading-relaxed text-[#66625C]">
              เอกสารที่สร้างไปแล้วจะไม่ถูกเปลี่ยนย้อนหลัง แต่เอกสารใหม่จะใช้ชื่อเอกสารและการคำนวณภาษีตามสถานะใหม่
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-[8px] border border-[#E8E6DF] p-3 text-[12px] leading-relaxed text-[#444441]">
              <input
                type="checkbox"
                checked={vatChangeConfirmed}
                onChange={(e) => setVatChangeConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#D8D5CC] text-[#378ADD]"
              />
              <span>ฉันเข้าใจว่าสถานะ VAT มีผลกับเอกสารใหม่และยอดภาษีที่จะคำนวณหลังจากนี้</span>
            </label>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setVatChangeOpen(false);
                  setPendingVatRegistered(null);
                  setVatChangeConfirmed(false);
                }}
              >
                ยกเลิก
              </Button>
              <Button onClick={confirmVatChange} disabled={!vatChangeConfirmed}>
                ยืนยันเปลี่ยนสถานะ
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
