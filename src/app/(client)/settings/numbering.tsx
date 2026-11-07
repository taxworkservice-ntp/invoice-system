import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth, useWorkspaceRole } from "../../../hooks/useAuth";
import { useDevMode } from "../../../hooks/useDevMode";
import { AppShell } from "../../../components/layout/AppShell";
import { SectionCard } from "../../../components/ui/SectionCard";
import { Button } from "../../../components/ui/Button";
import { SaveBar } from "../../../components/ui/SaveBar";
import { Input } from "../../../components/ui/Input";
import { DateInput } from "../../../components/ui/DateInput";
import { SettingsPageSkeleton } from "./_components/SettingsSkeleton";
import { useToast } from "../../../hooks/useToast";
import { DOC_TYPE_LABELS, DOC_TYPE_NOTES } from "../../../constants";
import { SettingsTabs } from "./_components/SettingsTabs";
import type { DocNumberSequence, DocumentType } from "../../../types";
import {
  buildNumberingDiff,
  hasNumberingChanges,
  toNumberingDraft,
  type NumberingDraft,
} from "../../../lib/numberingDiff";
import { NumberingChangeConfirmModal } from "../../../components/settings/NumberingChangeConfirmModal";
import {
  eraLabel,
  formatDocNumberSample,
  formatOption,
  RESET_LABELS,
} from "../../../lib/docNumberFormat";

const DOC_TYPES: DocumentType[] = [
  "quotation",
  "invoice",
  "billing_note",
  "receipt",
  "delivery_note",
  "credit_note",
  "debit_note",
];

function toDraftMap(rows: Record<string, DocNumberSequence>) {
  const map: Partial<Record<DocumentType, NumberingDraft>> = {};
  for (const docType of DOC_TYPES) {
    const row = rows[docType];
    map[docType] = row
      ? toNumberingDraft(row)
      : {
          doc_type: docType,
          prefix: "",
          start_sequence: 1,
        };
  }
  return map;
}

export default function SettingsNumberingPage() {
  const { profile, clientProfile, setClientProfile } = useAuth();
  const { workspaceUserId, isWorkspaceOwner, loading: workspaceLoading } = useWorkspaceRole();
  const { isDevMode } = useDevMode();
  const workspaceId = workspaceUserId ?? profile?.id;
  const [sequences, setSequences] = useState<Record<string, DocNumberSequence>>({});
  const [baseline, setBaseline] = useState<Record<string, DocNumberSequence>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [devEffectiveDate, setDevEffectiveDate] = useState("");
  const [bulkStartSequence, setBulkStartSequence] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    supabase
      .from("doc_number_sequences")
      .select("*")
      .eq("user_id", workspaceId)
      .then(({ data }) => {
        const map: Record<string, DocNumberSequence> = {};
        for (const seq of (data || []) as DocNumberSequence[]) {
          map[seq.doc_type] = { ...seq, start_sequence: seq.start_sequence ?? 1 };
        }
        setSequences(map);
        setBaseline(map);
        setLoading(false);
      });
  }, [workspaceId]);

  useEffect(() => {
    setDevEffectiveDate(clientProfile?.dev_effective_date || "");
  }, [clientProfile?.dev_effective_date]);

  function getPrefix(docType: DocumentType): string {
    return sequences[docType]?.prefix || "";
  }

  function getStartSequence(docType: DocumentType): number {
    return sequences[docType]?.start_sequence ?? 1;
  }

  function setPrefix(docType: DocumentType, value: string) {
    setSequences((prev) => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        doc_type: docType,
        prefix: value,
        start_sequence: prev[docType]?.start_sequence ?? 1,
      } as DocNumberSequence,
    }));
  }

  function setStartSequence(docType: DocumentType, value: string) {
    const parsed = Math.max(1, Math.floor(Number(value) || 1));
    setSequences((prev) => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        doc_type: docType,
        start_sequence: parsed,
      } as DocNumberSequence,
    }));
  }

  function applyStartSequenceToAll() {
    const parsed = Math.max(1, Math.floor(Number(bulkStartSequence) || 1));
    setBulkStartSequence(parsed);
    setSequences((prev) => {
      const next = { ...prev };
      for (const docType of DOC_TYPES) {
        next[docType] = {
          ...next[docType],
          doc_type: docType,
          start_sequence: parsed,
        } as DocNumberSequence;
      }
      return next;
    });
  }

  const changes = useMemo(
    () => buildNumberingDiff(toDraftMap(baseline), toDraftMap(sequences)),
    [baseline, sequences],
  );

  function validateDraft() {
    for (const docType of DOC_TYPES) {
      if (!getPrefix(docType).trim()) {
        throw new Error("กรุณาระบุ prefix ให้ครบทุกประเภทเอกสาร");
      }
      const startSequence = getStartSequence(docType);
      if (!Number.isInteger(startSequence) || startSequence < 1) {
        throw new Error("Start at ต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป");
      }
    }
  }

  function handleRequestSave() {
    setError("");
    setSuccess("");
    try {
      validateDraft();
      if (!hasNumberingChanges(changes)) {
        toast.info("ไม่มีการเปลี่ยนแปลง");
        return;
      }
      setChangeReason("");
      setConfirmWord("");
      setConfirmOpen(true);
    } catch (err: any) {
      const msg = err.message || "เกิดข้อผิดพลาด";
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleConfirmedSave() {
    if (!workspaceId) return;
    if (changeReason.trim().length < 5 || confirmWord.trim() !== "ยืนยัน") return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      validateDraft();

      const rows = DOC_TYPES.map((docType) => ({
        doc_type: docType,
        prefix: getPrefix(docType).trim(),
        start_sequence: getStartSequence(docType),
      }));

      const { data, error: saveError } = await supabase.rpc("save_doc_number_sequences", {
        p_workspace_user_id: workspaceId,
        p_rows: rows,
        p_reason: changeReason.trim(),
      });
      if (saveError) throw saveError;

      if (isDevMode) {
        const { error: devError } = await supabase
          .from("client_profiles")
          .update({ dev_effective_date: devEffectiveDate || null })
          .eq("user_id", workspaceId);
        if (devError) throw devError;
        setClientProfile((prev) =>
          prev ? { ...prev, dev_effective_date: devEffectiveDate || null } : prev,
        );
      }

      const map: Record<string, DocNumberSequence> = {};
      for (const seq of (data || []) as DocNumberSequence[]) {
        map[seq.doc_type] = { ...seq, start_sequence: seq.start_sequence ?? 1 };
      }
      if (Object.keys(map).length > 0) {
        setSequences(map);
        setBaseline(map);
      } else {
        setBaseline(sequences);
      }

      setConfirmOpen(false);
      setChangeReason("");
      setConfirmWord("");
      setSuccess("บันทึกสำเร็จ");
      toast.success("บันทึกเลขที่เอกสารสำเร็จ");
    } catch (err: any) {
      const msg = err.message || "เกิดข้อผิดพลาด";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <AppShell width="form" title="ตั้งค่า > เลขที่เอกสาร">
        <SettingsPageSkeleton />
      </AppShell>
    );

  if (!workspaceLoading && !isWorkspaceOwner) {
    return (
      <AppShell width="form" title="ตั้งค่า > เลขที่เอกสาร">
        <div className="space-y-4">
          <SettingsTabs activePath="/settings/numbering" />
          <SectionCard
            title="เฉพาะเจ้าของ"
            description="การเปลี่ยนเลขที่เอกสารต้องทำโดยเจ้าของพื้นที่ทำงานเท่านั้น"
          >
            <p className="text-body leading-6 text-ink-600">
              เฉพาะเจ้าของพื้นที่ทำงานเท่านั้นที่ดูและแก้ไขเลขที่เอกสารได้ หากต้องการเปลี่ยน
              โปรดติดต่อเจ้าของพื้นที่ทำงาน
            </p>
          </SectionCard>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell width="form" title="ตั้งค่า > เลขที่เอกสาร">
      <div className="space-y-4">
        <SettingsTabs activePath="/settings/numbering" />

        <SectionCard
          title="เลขที่เอกสาร"
          description="กำหนด prefix ของแต่ละประเภทเอกสาร — รูปแบบเลขที่และปีในเลขดูแลโดยผู้ดูแลระบบ"
        >
          <div className="space-y-4">
            {isDevMode && (
              <div className="rounded-control border border-warning-border bg-warning-soft p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,240px)_auto] sm:items-end">
                  <DateInput
                    id="devEffectiveDate"
                    label="DEV fixed business date"
                    value={devEffectiveDate}
                    onChange={(event) => setDevEffectiveDate(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDevEffectiveDate("")}
                    disabled={!devEffectiveDate || saving}
                  >
                    Clear fixed date
                  </Button>
                </div>
                <p className="mt-2 text-label text-warning-text">
                  Used as the default issue/payment date only. Audit timestamps stay real.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,240px)_auto] sm:items-end">
                  <Input
                    id="bulkStartSequence"
                    label="Apply Start at to all"
                    type="number"
                    min={1}
                    step={1}
                    value={bulkStartSequence}
                    onChange={(event) =>
                      setBulkStartSequence(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                    }
                    className="border-warning-border bg-white font-mono"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={applyStartSequenceToAll}
                    disabled={saving}
                  >
                    Apply to all documents
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-label">
                <thead>
                  <tr className="border-b border-card-border text-ink-500">
                    <th className="text-left py-2 pr-2">ประเภทเอกสาร</th>
                    <th className="text-left py-2 pr-2">Prefix</th>
                    {isDevMode && <th className="text-left py-2 pr-2">Start at</th>}
                    <th className="text-left py-2 pr-2">รูปแบบ (ดูแลโดยผู้ดูแลระบบ)</th>
                  </tr>
                </thead>
                <tbody>
                  {DOC_TYPES.map((docType) => (
                    <tr key={docType} className="border-b border-card-border/50">
                      <td className="py-2 pr-2 align-top">
                        <div className="font-medium text-ink-900">
                          {DOC_TYPE_LABELS[docType].th}
                        </div>
                        {DOC_TYPE_NOTES[docType] && (
                          <div className="mt-0.5 max-w-[260px] text-label leading-snug text-ink-500">
                            {DOC_TYPE_NOTES[docType]}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          value={getPrefix(docType)}
                          onChange={(e) => setPrefix(docType, e.target.value)}
                          placeholder="เช่น INV"
                          className="text-label"
                        />
                      </td>
                      {isDevMode && (
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={getStartSequence(docType)}
                            onChange={(e) => setStartSequence(docType, e.target.value)}
                            className="text-label font-mono"
                          />
                        </td>
                      )}
                      <td className="py-2 pr-2 align-top">
                        {(() => {
                          const sequence = sequences[docType];
                          if (!sequence) {
                            return <span className="text-label text-ink-400">—</span>;
                          }
                          const option = formatOption(sequence.format_preset);
                          const resetLabel =
                            RESET_LABELS[sequence.reset_period as keyof typeof RESET_LABELS] ??
                            sequence.reset_period;
                          return (
                            <div className="space-y-0.5">
                              <div className="text-label font-medium text-ink-700">
                                {option?.label ?? sequence.format_preset}
                              </div>
                              <div className="text-label text-ink-500">
                                {sequence.seq_padding} หลัก · {eraLabel(sequence.number_era)} ·{" "}
                                {resetLabel}
                              </div>
                              <div className="font-mono text-label text-ink-400">
                                {formatDocNumberSample(
                                  sequence.format_preset,
                                  sequence.seq_padding,
                                  sequence.number_era,
                                  sequence.prefix || "INV",
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SaveBar
          tone={error ? "error" : success ? "success" : "muted"}
          label={
            error ||
            success ||
            (changes.length > 0
              ? `มีการเปลี่ยนแปลง ${changes.length} ประเภทเอกสาร`
              : "บันทึกครั้งเดียวใช้ได้กับทุกประเภทเอกสาร")
          }
          onSave={handleRequestSave}
          saving={saving}
          saveLabel="บันทึกทั้งหมด"
        />

        <NumberingChangeConfirmModal
          open={confirmOpen}
          changes={changes}
          reason={changeReason}
          confirmWord={confirmWord}
          saving={saving}
          onReasonChange={setChangeReason}
          onConfirmWordChange={setConfirmWord}
          onCancel={() => {
            if (saving) return;
            setConfirmOpen(false);
            setChangeReason("");
            setConfirmWord("");
          }}
          onConfirm={handleConfirmedSave}
        />
      </div>
    </AppShell>
  );
}
