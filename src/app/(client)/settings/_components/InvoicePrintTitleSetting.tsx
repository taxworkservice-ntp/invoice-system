import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useAuth, useWorkspaceRole } from "../../../../hooks/useAuth";
import { useToast } from "../../../../hooks/useToast";
import { SectionCard } from "../../../../components/ui/SectionCard";
import { Button } from "../../../../components/ui/Button";
import { Select } from "../../../../components/ui/Input";
import {
  PRINT_TITLE_PRESETS,
  defaultInvoicePrintTitleVariant,
  invoiceLabel,
  type PrintTitleVariant,
} from "../../../../lib/docLabels";
import type { ClientProfile } from "../../../../types";
import { InvoicePrintTitleConfirmModal } from "./InvoicePrintTitleConfirmModal";

export function InvoicePrintTitleSetting() {
  const { clientProfile, setClientProfile } = useAuth();
  const { workspaceUserId, isWorkspaceOwner } = useWorkspaceRole();
  const toast = useToast();

  const saved = defaultInvoicePrintTitleVariant(clientProfile);
  const [selected, setSelected] = useState(saved);
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState("");
  const pendingPresetRef = useRef("");
  const [reason, setReason] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (touched) return;
    setSelected(saved);
  }, [saved, touched]);

  if (!clientProfile) return null;

  const vatRegistered = clientProfile.vat_registered === true;
  const defaultTitle = invoiceLabel(true);
  const preset = selected ? PRINT_TITLE_PRESETS[selected as PrintTitleVariant] : null;
  const previewTh = preset?.thai ?? defaultTitle.thai;
  const previewEn = preset?.en ?? defaultTitle.en;
  const savedPreset = saved ? PRINT_TITLE_PRESETS[saved as PrintTitleVariant] : null;
  const savedTh = savedPreset?.thai ?? defaultTitle.thai;
  const changed = selected !== saved;

  async function handleSave() {
    if (!workspaceUserId) return;
    if (reason.trim().length < 5 || confirmWord.trim() !== "ยืนยัน") return;

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("save_invoice_print_title", {
        p_workspace_user_id: workspaceUserId,
        p_preset: pendingPresetRef.current,
        p_reason: reason.trim(),
      });
      if (error) throw error;

      setClientProfile((prev) =>
        prev
          ? {
              ...prev,
              print_titles_by_type:
                (data as ClientProfile["print_titles_by_type"]) ?? prev.print_titles_by_type,
            }
          : prev,
      );
      setTouched(false);
      setConfirmOpen(false);
      pendingPresetRef.current = "";
      setPendingPreset("");
      setReason("");
      setConfirmWord("");
      toast.success("บันทึกชื่อหัวเอกสารสำเร็จ");
    } catch (err: any) {
      toast.error(err?.message || "บันทึกชื่อหัวเอกสารไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (!vatRegistered) {
    return (
      <SectionCard title="ชื่อเรื่องบนหัวเอกสาร" description="ใช้กับใบกำกับภาษี (VAT) เท่านั้น">
        <p className="text-body leading-6 text-ink-600">
          พื้นที่ทำงานนี้ยังไม่ได้จดทะเบียน VAT — ชื่อหัวเอกสารจึงใช้ “ใบแจ้งหนี้” ตามปกติ
        </p>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard
        title="ชื่อเรื่องบนหัวเอกสาร"
        description="ค่าเริ่มต้นสำหรับใบกำกับภาษีใหม่ — เอกสารที่ออกแล้วจะไม่ถูกเปลี่ยนชื่อย้อนหลัง"
      >
        {!isWorkspaceOwner ? (
          <div className="space-y-2">
            <p className="text-body leading-6 text-ink-600">
              เฉพาะเจ้าของพื้นที่ทำงานเท่านั้นที่เปลี่ยนชื่อหัวเอกสารได้
            </p>
            <div className="rounded-control border border-line bg-paper-field px-3 py-2 text-label text-ink-700">
              ชื่อปัจจุบัน: <span className="font-medium text-ink-900">{savedTh}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
              <Select
                label="ใบกำกับภาษี (VAT)"
                value={selected}
                onChange={(event) => {
                  setTouched(true);
                  setSelected(event.target.value);
                }}
              >
                <option value="">ใบกำกับภาษี (ค่าเริ่มต้น)</option>
                {Object.entries(PRINT_TITLE_PRESETS).map(([value, option]) => (
                  <option key={value} value={value}>
                    {option.thai}
                  </option>
                ))}
              </Select>

              <div className="rounded-card border border-card-border bg-paper-soft px-3 py-2">
                <div className="text-label text-ink-500">ตัวอย่างหัวเอกสาร</div>
                <div className="mt-1 text-body font-semibold text-ink-900">{previewTh}</div>
                <div className="text-label text-ink-500">{previewEn}</div>
              </div>
            </div>

            <p className="text-label leading-5 text-ink-400">
              ชื่อภาษาไทยต้องขึ้นต้นด้วย “ใบกำกับภาษี” — เลือกได้เฉพาะชุดที่กำหนด
              เพื่อไม่ให้เอกสารภาษีไม่สมบูรณ์
            </p>

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (selected === saved) {
                    toast.info("ไม่มีการเปลี่ยนแปลง");
                    return;
                  }
                  pendingPresetRef.current = selected;
                  setPendingPreset(selected);
                  setReason("");
                  setConfirmWord("");
                  setConfirmOpen(true);
                }}
                disabled={!changed}
              >
                บันทึกชื่อเรื่อง
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <InvoicePrintTitleConfirmModal
        open={confirmOpen}
        currentLabel={savedTh}
        nextLabel={
          pendingPreset
            ? (PRINT_TITLE_PRESETS[pendingPreset as PrintTitleVariant]?.thai ?? previewTh)
            : defaultTitle.thai
        }
        reason={reason}
        confirmWord={confirmWord}
        saving={saving}
        onReasonChange={setReason}
        onConfirmWordChange={setConfirmWord}
        onCancel={() => {
          if (saving) return;
          setConfirmOpen(false);
          pendingPresetRef.current = "";
          setPendingPreset("");
          setReason("");
          setConfirmWord("");
        }}
        onConfirm={handleSave}
      />
    </>
  );
}
