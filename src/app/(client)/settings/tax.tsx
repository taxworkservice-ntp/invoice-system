import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { AppShell } from "../../../components/layout/AppShell";
import { SectionCard } from "../../../components/ui/SectionCard";
import { SettingRow } from "../../../components/ui/SettingRow";
import { SaveBar } from "../../../components/ui/SaveBar";
import { Select } from "../../../components/ui/Input";
import { SettingsPageSkeleton } from "./_components/SettingsSkeleton";
import { useToast } from "../../../hooks/useToast";
import { WHT_RATE_OPTIONS } from "../../../constants";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { WhtRate } from "../../../types";

export default function SettingsTaxPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const toast = useToast();

  // VAT status and rate are managed by the platform administrator (see
  // sql/20261027_vat_admin_only.sql) — this page only displays them.
  const vatRegistered = clientProfile?.vat_registered === true;
  const vatRate = String(clientProfile?.vat_rate ?? "0");
  const [defaultWhtRate, setDefaultWhtRate] = useState<WhtRate>("0");
  const [creditTermDays, setCreditTermDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const hydrateFromProfile = useCallback(() => {
    if (!clientProfile) return;
    setDefaultWhtRate(clientProfile.default_wht_rate);
    setCreditTermDays(clientProfile.credit_term_days ?? 7);
  }, [clientProfile]);

  useEffect(() => {
    hydrateFromProfile();
  }, [hydrateFromProfile]);

  async function handleSave() {
    if (!profile || !clientProfile) return;
    setSaving(true);
    setError("");
    setSaved(false);

    if (!Number.isFinite(creditTermDays) || creditTermDays < 0 || creditTermDays > 90) {
      setError("กรุณากรอกเครดิตเทอมระหว่าง 0-90 วัน");
      setSaving(false);
      return;
    }

    const { error: err } = await supabase
      .from("client_profiles")
      .update({
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
        default_wht_rate: defaultWhtRate,
        credit_term_days: creditTermDays,
      });
    }
    setSaving(false);
  }

  if (loading)
    return (
      <AppShell width="form" title="ตั้งค่า > ภาษี">
        <SettingsPageSkeleton />
      </AppShell>
    );

  const isDirty =
    defaultWhtRate !== clientProfile?.default_wht_rate ||
    creditTermDays !== (clientProfile?.credit_term_days ?? 7);
  const effectiveVatRate = vatRegistered ? vatRate || "0" : "0";

  return (
    <AppShell width="form" title="ตั้งค่า > ภาษี">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/tax" />

        <SectionCard
          title="ภาษีและการชำระเงิน"
          description="การตั้งค่ามีผลกับเอกสารใหม่เท่านั้น — เอกสารที่สร้างไปแล้วจะไม่เปลี่ยนแปลง"
        >
          <div className="divide-y divide-line-faint">
            <div className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-label font-medium text-ink-700">สถานะ VAT ของกิจการ</div>
                  <p className="mt-0.5 text-label leading-relaxed text-ink-300">
                    ใช้กำหนดชื่อเอกสาร การแสดง VAT และยอดภาษีของเอกสารใหม่
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-label font-medium ${vatRegistered ? "bg-emerald-50 text-emerald-700" : "bg-ink-50 text-ink-600"}`}
                >
                  {vatRegistered ? "จด VAT" : "ไม่จด VAT"}
                </span>
              </div>
            </div>

            <div className="py-2.5">
              <div
                className={`rounded-[8px] border p-3 ${vatRegistered ? "border-emerald-200 bg-emerald-50/60" : "border-card-border bg-paper-soft"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-body font-semibold text-ink-900">
                      {vatRegistered ? "ใช้โหมดจดทะเบียน VAT" : "ใช้โหมดไม่จด VAT"}
                    </div>
                    <p className="mt-0.5 text-label leading-relaxed text-ink-600">
                      {vatRegistered
                        ? "เอกสารขายใหม่จะเป็นใบกำกับภาษีและคำนวณ VAT ตามอัตราที่ตั้งไว้"
                        : "เอกสารขายใหม่จะไม่มีรายการ VAT และรับเงินทันทีจะออกเป็นใบเสร็จรับเงิน"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-card-border bg-white px-2.5 py-1 text-label font-medium text-ink-500">
                    ดูแลโดยผู้ดูแลระบบ
                  </span>
                </div>
                <div className="mt-2 rounded-[8px] border border-card-border bg-white px-3 py-2 text-label leading-relaxed text-ink-600">
                  สถานะ VAT กำหนดโดยผู้ดูแลระบบ — หากต้องการเปลี่ยน กรุณาติดต่อผู้ดูแลระบบ
                  การเปลี่ยนแปลงมีผลกับเอกสารใหม่เท่านั้น
                </div>
              </div>
            </div>

            {vatRegistered && (
              <SettingRow
                label="อัตราภาษีมูลค่าเพิ่ม"
                description="กำหนดโดยผู้ดูแลระบบ"
                controlWidthClass="sm:w-[140px]"
              >
                <div className="flex items-center justify-end gap-1 rounded-control border border-card-border bg-paper-soft px-3 py-2 text-body tabular-nums text-ink-700">
                  <span>{vatRate}</span>
                  <span className="text-ink-300">%</span>
                </div>
              </SettingRow>
            )}

            <div className="py-2.5">
              <div className="rounded-[8px] border border-card-border bg-paper-soft px-3 py-2.5 text-label text-ink-700">
                <div className="font-medium text-ink-900">ตัวอย่างผลกับเอกสารใหม่</div>
                <div className="mt-1 grid gap-1 sm:grid-cols-3">
                  <span>ใบขาย: {vatRegistered ? "ใบกำกับภาษี" : "ใบแจ้งหนี้"}</span>
                  <span>
                    รับเงินทันที: {vatRegistered ? "ใบกำกับภาษี/ใบเสร็จ" : "ใบเสร็จรับเงิน"}
                  </span>
                  <span>VAT: {effectiveVatRate}%</span>
                </div>
              </div>
            </div>

            <SettingRow
              label="อัตราเริ่มต้นหัก ณ ที่จ่าย"
              description="ใช้เป็นค่าเริ่มต้นในทุกเอกสาร แก้ไขได้ต่อเอกสาร"
              controlWidthClass="sm:w-[220px]"
            >
              <Select
                value={defaultWhtRate}
                onChange={(e) => {
                  setDefaultWhtRate(e.target.value as WhtRate);
                  setSaved(false);
                }}
              >
                {WHT_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow
              label="ระยะเวลาเครดิต"
              description="ใช้คำนวณวันที่ครบกำหนดชำระในใบวางบิล (0-90 วัน)"
              controlWidthClass="sm:w-[140px]"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={creditTermDays}
                  onChange={(e) => {
                    setCreditTermDays(Number(e.target.value));
                    setSaved(false);
                  }}
                  className="w-20 px-2 py-1.5 text-body text-right border border-card-border rounded-control bg-white focus:outline-none focus:border-primary"
                />
                <span className="text-body text-ink-300">วัน</span>
              </div>
            </SettingRow>
          </div>
        </SectionCard>

        <SaveBar
          tone={error ? "error" : saved ? "success" : isDirty ? "dirty" : "muted"}
          label={
            error ||
            (saved ? "บันทึกแล้ว" : isDirty ? "ยังไม่ได้บันทึก" : "การตั้งค่าทั้งหมดถูกบันทึกแล้ว")
          }
          onSave={handleSave}
          saving={saving}
          onDiscard={isDirty && !saving ? hydrateFromProfile : undefined}
        />
      </div>
    </AppShell>
  );
}
