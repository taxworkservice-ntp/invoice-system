import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useBankAccounts } from "../../../hooks/useBankAccounts";
import { AppShell } from "../../../components/layout/AppShell";
import { SectionCard } from "../../../components/ui/SectionCard";
import { SettingRow } from "../../../components/ui/SettingRow";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { ClientProfile, BankAccount } from "../../../types";

export default function SettingsCompanyPage() {
  const { profile } = useAuth();
  const { clientProfile, loading, setClientProfile } = useClientProfile(profile?.id);
  const toast = useToast();
  const {
    bankAccounts,
    loading: bankLoading,
    refetch: refetchBankAccounts,
    updateBankAccountLocal,
    removeBankAccountLocal,
  } = useBankAccounts(profile?.id);

  const [companyNameTh, setCompanyNameTh] = useState("");
  const [companyNameEn, setCompanyNameEn] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [savingBank, setSavingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);

  const hydrateFromProfile = useCallback(() => {
    if (!clientProfile) return;
    setCompanyNameTh(clientProfile.company_name_th || "");
    setCompanyNameEn(clientProfile.company_name_en || "");
    setTaxId(clientProfile.tax_id || "");
    setAddress(clientProfile.address || "");
    setPhone(clientProfile.phone || "");
    setContactName(clientProfile.contact_name || "");
  }, [clientProfile]);

  useEffect(() => {
    hydrateFromProfile();
  }, [hydrateFromProfile]);

  function startAddBank() {
    setEditingBankId(null);
    setBankName("");
    setBankAccount("");
    setAccountHolder("");
  }

  function startEditBank(account: BankAccount) {
    setEditingBankId(account.id);
    setBankName(account.bank_name);
    setBankAccount(account.account_number);
    setAccountHolder(account.account_holder_name || "");
  }

  async function syncLegacyBank(userId: string, account: BankAccount | null) {
    const payload: Partial<ClientProfile> = {
      bank_name: account?.bank_name || null,
      bank_account: account?.account_number || null,
    };
    await supabase.from("client_profiles").update(payload).eq("user_id", userId);
    setClientProfile((prev: ClientProfile | null) => ({ ...(prev as ClientProfile), ...payload }));
  }

  async function handleSaveBank() {
    if (!profile) return;
    if (!bankName.trim() || !bankAccount.trim()) {
      setError("กรุณากรอกชื่อธนาคารและเลขที่บัญชี");
      return;
    }
    setSavingBank(true);
    setError("");

    if (!editingBankId) {
      const { data, error: err } = await supabase
        .from("bank_accounts")
        .insert({
          user_id: profile.id,
          bank_name: bankName.trim(),
          account_number: bankAccount.trim(),
          account_holder_name: accountHolder.trim() || null,
          is_primary: bankAccounts.length === 0,
          sort_order: bankAccounts.length,
        })
        .select("*")
        .single();

      if (err) {
        setError(err.message);
        toast.error(err.message);
      } else {
        await refetchBankAccounts();
        if (bankAccounts.length === 0) {
          await syncLegacyBank(profile.id, data as BankAccount);
        }
        toast.success("เพิ่มบัญชีธนาคารแล้ว");
      }
    } else {
      const { error: err } = await supabase
        .from("bank_accounts")
        .update({
          bank_name: bankName.trim(),
          account_number: bankAccount.trim(),
          account_holder_name: accountHolder.trim() || null,
        })
        .eq("id", editingBankId);

      if (err) {
        setError(err.message);
        toast.error(err.message);
      } else {
        updateBankAccountLocal(editingBankId, {
          bank_name: bankName.trim(),
          account_number: bankAccount.trim(),
          account_holder_name: accountHolder.trim() || null,
        });
        const updated = bankAccounts.find((b) => b.id === editingBankId);
        if (updated?.is_primary) {
          await syncLegacyBank(profile.id, {
            ...updated,
            bank_name: bankName.trim(),
            account_number: bankAccount.trim(),
          } as BankAccount);
        }
        toast.success("บันทึกบัญชีธนาคารแล้ว");
      }
    }
    setSavingBank(false);
  }

  async function handleSetPrimary(account: BankAccount) {
    if (!profile) return;
    const { error: err } = await supabase
      .from("bank_accounts")
      .update({ is_primary: false })
      .eq("user_id", profile.id)
      .eq("is_primary", true);
    if (err) {
      toast.error(err.message);
      return;
    }
    const { error: err2 } = await supabase
      .from("bank_accounts")
      .update({ is_primary: true })
      .eq("id", account.id);
    if (err2) {
      toast.error(err2.message);
      return;
    }
    await refetchBankAccounts();
    await syncLegacyBank(profile.id, account);
    toast.success("ตั้งเป็นบัญชีหลักแล้ว");
  }

  async function handleDeleteBank(account: BankAccount) {
    if (!profile) return;
    if (account.is_primary) {
      toast.error("ไม่สามารถลบบัญชีหลักได้ ตั้งบัญชีอื่นเป็นหลักก่อน");
      return;
    }
    const { error: err } = await supabase
      .from("bank_accounts")
      .delete()
      .eq("id", account.id);
    if (err) {
      toast.error(err.message);
      return;
    }
    removeBankAccountLocal(account.id);
    toast.success("ลบบัญชีธนาคารแล้ว");
  }

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
    contactName !== (clientProfile?.contact_name || "");

  return (
    <AppShell title="ตั้งค่า > ข้อมูลบริษัท">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/company" />

        <SectionCard title="ข้อมูลบริษัท" description="ข้อมูลที่พิมพ์บนเอกสารทุกฉบับ">
          <div className="divide-y divide-[#F0EEE8]">
            <SettingRow label="ชื่อบริษัท (ภาษาไทย) *" controlWidthClass="sm:flex-1 sm:max-w-none">
              <Input
                value={companyNameTh}
                onChange={(e) => { setCompanyNameTh(e.target.value); setSaved(false); }}
                placeholder="บริษัท มาลี จำกัด"
              />
            </SettingRow>
            <SettingRow label="ชื่อบริษัท (ภาษาอังกฤษ)" controlWidthClass="sm:flex-1 sm:max-w-none">
              <Input
                value={companyNameEn}
                onChange={(e) => { setCompanyNameEn(e.target.value); setSaved(false); }}
                placeholder="Malee Co., Ltd. (ไม่บังคับ)"
              />
            </SettingRow>
            <SettingRow
              label="เลขที่ผู้เสียภาษี"
              description="13 หลัก จำเป็นสำหรับใบกำกับภาษี"
              controlWidthClass="sm:w-[240px]"
            >
              <Input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
                placeholder="0000000000000"
                maxLength={13}
              />
            </SettingRow>
            <div className="py-2.5">
              <label className="block text-xs font-medium text-gray-700 mb-1">
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
            <SettingRow label="เบอร์โทรศัพท์" controlWidthClass="sm:w-[240px]">
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
              />
            </SettingRow>
            <SettingRow
              label="ชื่อผู้ติดต่อ / ชื่อเจ้าของ"
              description="ใช้สำหรับข้อความทักทายในแอป"
              controlWidthClass="sm:flex-1 sm:max-w-none"
            >
              <Input
                value={contactName}
                onChange={(e) => { setContactName(e.target.value); setSaved(false); }}
                placeholder="ชื่อที่ใช้แสดงในการทักทาย"
              />
            </SettingRow>
          </div>
        </SectionCard>

        <SectionCard title="บัญชีธนาคาร" description="เพิ่มได้หลายบัญชี เลือกตอนรับชำระเงินแบบโอนและแสดงบนเอกสาร">
          {bankLoading ? (
            <Spinner />
          ) : (
            <>
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-[#888780] mb-3">
                  ยังไม่มีบัญชีธนาคาร เพิ่มบัญชีแรกด้านล่าง
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {bankAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-lg border border-[#E8E6DF] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {account.bank_name}
                          </p>
                          {account.is_primary && (
                            <span className="rounded bg-[#378ADD]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#378ADD]">
                              บัญชีหลัก
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {account.account_number}
                          {account.account_holder_name
                            ? ` · ${account.account_holder_name}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!account.is_primary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetPrimary(account)}
                          >
                            ตั้งหลัก
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => startEditBank(account)}>
                          แก้ไข
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteBank(account)}>
                          ลบ
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-[#E8E6DF] bg-[#FAFAF8] p-3">
                <p className="text-[11px] font-semibold text-[#888780] mb-2">
                  {editingBankId ? "แก้ไขบัญชีธนาคาร" : "เพิ่มบัญชีธนาคาร"}
                </p>
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
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
                  <Input
                    label="ชื่อบัญชี"
                    value={accountHolder}
                    onChange={(e) => { setAccountHolder(e.target.value); setSaved(false); }}
                    placeholder="บจก. ... (ไม่บังคับ)"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={handleSaveBank} disabled={savingBank}>
                    {savingBank ? "กำลังบันทึก..." : editingBankId ? "บันทึกบัญชีธนาคาร" : "เพิ่มบัญชีธนาคาร"}
                  </Button>
                  {editingBankId && (
                    <Button onClick={startAddBank} variant="ghost" size="sm">
                      ยกเลิก
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SectionCard>

        <div className="sticky bottom-3 z-10">
          <div className="rounded-xl border border-card-border bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 text-xs">
                {error ? (
                  <span className="text-red-500">{error}</span>
                ) : saved ? (
                  <span className="text-green-600">บันทึกแล้ว</span>
                ) : isDirty ? (
                  <span className="flex items-center gap-1.5 text-[#888780]">
                    <span className="w-[6px] h-[6px] rounded-full bg-[#378ADD] inline-block" />
                    ยังไม่ได้บันทึก
                  </span>
                ) : (
                  <span className="text-gray-400">การตั้งค่าทั้งหมดถูกบันทึกแล้ว</span>
                )}
              </div>
              {isDirty && !saving && (
                <button
                  type="button"
                  onClick={hydrateFromProfile}
                  className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
              <Button onClick={handleSave} disabled={saving} className="shrink-0">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
