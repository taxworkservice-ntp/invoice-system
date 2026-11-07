import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../../hooks/useToast";
import { DOC_TYPE_LABELS } from "../../../constants";
import {
  DOC_NUMBER_FORMATS,
  RESET_LABELS,
  SEQ_PADDING_OPTIONS,
  eraLabel,
  formatDocNumberSample,
  resetOptionsForFormat,
  type DocNumberResetPeriod,
} from "../../../lib/docNumberFormat";
import {
  buildAdminNumberingDiff,
  hasNumberingChanges,
  toAdminNumberingDraft,
  type AdminNumberingDraft,
} from "../../../lib/numberingDiff";
import {
  fetchAdminClientNumbering,
  previewAdminDocNumbers,
  saveAdminDocNumberFormat,
  type DocNumberPreviews,
} from "../../../lib/adminNumbering";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Select } from "../../ui/Input";
import { Spinner } from "../../ui/Spinner";
import { NumberingChangeConfirmModal } from "../../settings/NumberingChangeConfirmModal";
import type { DocNumberSequence, DocumentType } from "../../../types";
import { SectionHeader } from "./shared";

const DOC_TYPES: DocumentType[] = [
  "quotation",
  "invoice",
  "billing_note",
  "receipt",
  "delivery_note",
  "credit_note",
  "debit_note",
];

function toDraftMap(rows: DocNumberSequence[]) {
  const map: Partial<Record<DocumentType, AdminNumberingDraft>> = {};
  for (const row of rows) {
    map[row.doc_type] = toAdminNumberingDraft(row);
  }
  return map;
}

function toSequenceMap(rows: DocNumberSequence[]) {
  const map: Partial<Record<DocumentType, DocNumberSequence>> = {};
  for (const row of rows) {
    map[row.doc_type] = row;
  }
  return map;
}

export function NumberingTab({ clientId }: { clientId: string | undefined }) {
  const toast = useToast();

  const [sequenceMap, setSequenceMap] = useState<Partial<Record<DocumentType, DocNumberSequence>>>(
    {},
  );
  const [drafts, setDrafts] = useState<Partial<Record<DocumentType, AdminNumberingDraft>>>({});
  const [baseline, setBaseline] = useState<Partial<Record<DocumentType, AdminNumberingDraft>>>({});
  const [previews, setPreviews] = useState<DocNumberPreviews>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [confirmWord, setConfirmWord] = useState("");

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);

    fetchAdminClientNumbering(clientId)
      .then((rows) => {
        if (cancelled) return;
        setSequenceMap(toSequenceMap(rows));
        const next = toDraftMap(rows);
        setDrafts(next);
        setBaseline(next);
        setPreviews({});
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "โหลดเลขที่เอกสารไม่สำเร็จ";
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `toast` is re-created on every provider render; re-running on its identity
    // would loop. The captured instance is fine for a one-shot load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const rows = DOC_TYPES.map((docType) => drafts[docType]).filter(
      (draft): draft is AdminNumberingDraft => Boolean(draft),
    );
    if (rows.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      previewAdminDocNumbers(clientId, rows)
        .then((result) => {
          if (!cancelled) setPreviews(result);
        })
        .catch(() => {
          if (!cancelled) setPreviews({});
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clientId, drafts]);

  const changes = useMemo(() => buildAdminNumberingDiff(baseline, drafts), [baseline, drafts]);
  const dirty = hasNumberingChanges(changes);

  function updateDraft(docType: DocumentType, patch: Partial<AdminNumberingDraft>) {
    setDrafts((prev) => {
      const current = prev[docType];
      if (!current) return prev;
      return { ...prev, [docType]: { ...current, ...patch } };
    });
  }

  function handleFormatChange(docType: DocumentType, value: string) {
    const current = drafts[docType];
    if (!current) return;
    const allowed = resetOptionsForFormat(value);
    const nextReset = allowed.includes(current.reset_period as DocNumberResetPeriod)
      ? current.reset_period
      : allowed[0];
    updateDraft(docType, {
      format_preset: value,
      reset_period: nextReset,
    });
  }

  function handleRequestSave() {
    if (!dirty) {
      toast.info("ไม่มีการเปลี่ยนแปลง");
      return;
    }
    setChangeReason("");
    setConfirmWord("");
    setConfirmOpen(true);
  }

  async function handleConfirmedSave() {
    if (!clientId) return;
    if (changeReason.trim().length < 5 || confirmWord.trim() !== "ยืนยัน") return;

    setSaving(true);
    try {
      const rows = changes
        .map((change) => drafts[change.docType])
        .filter((draft): draft is AdminNumberingDraft => Boolean(draft));
      const saved = await saveAdminDocNumberFormat(clientId, rows, changeReason.trim());
      setSequenceMap(toSequenceMap(saved));
      const next = toDraftMap(saved);
      setDrafts(next);
      setBaseline(next);
      setConfirmOpen(false);
      setChangeReason("");
      setConfirmWord("");
      toast.success("บันทึกรูปแบบเลขที่เอกสารแล้ว");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  const availableTypes = DOC_TYPES.filter((docType) => drafts[docType]);
  if (availableTypes.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader>รูปแบบเลขที่เอกสาร</SectionHeader>
        <Card>
          <p className="text-body leading-6 text-ink-700">
            ลูกค้ารายนี้ยังไม่มีเลขที่เอกสาร ให้เจ้าของพื้นที่ทำงานเปิด ตั้งค่า &gt; เลขที่เอกสาร
            เพื่อสร้างเลขเริ่มต้นก่อน
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader>รูปแบบเลขที่เอกสาร</SectionHeader>
        <Card>
          <p className="text-body leading-6 text-ink-700">
            ผู้ดูแลระบบกำหนดรูปแบบ จำนวนหลัก และรอบรีเซ็ตของเลขที่เอกสาร · เจ้าของพื้นที่ทำงานกำหนด
            prefix และเลขเริ่มต้นเอง · เอกสารที่ออกแล้วจะไม่ถูกเปลี่ยนเลข
          </p>
          <div className="mt-3 rounded-control border border-warning-border bg-warning-soft px-3 py-2 text-label leading-5 text-warning-text">
            ปีในเลขที่เอกสาร (พ.ศ./ค.ศ.) ถูกล็อกเมื่อออกเอกสารฉบับแรกแล้ว และแก้ไขได้จากเมนู
            “การจัดการ” เท่านั้น
          </div>
        </Card>
      </div>

      <div className="space-y-2">
        {availableTypes.map((docType) => {
          const sequence = sequenceMap[docType];
          const draft = drafts[docType];
          if (!sequence || !draft) return null;
          const option = DOC_NUMBER_FORMATS.find((item) => item.value === draft.format_preset);
          const sample = formatDocNumberSample(
            draft.format_preset,
            draft.seq_padding,
            sequence.number_era,
            sequence.prefix || "INV",
          );
          const nextNumber = previews[docType];

          return (
            <Card key={docType}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-body font-medium text-ink-900">
                    {DOC_TYPE_LABELS[docType].th}
                  </div>
                  <div className="mt-0.5 text-label text-ink-500">
                    Prefix <span className="font-mono text-ink-700">{sequence.prefix || "—"}</span>{" "}
                    · {eraLabel(sequence.number_era)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-label text-ink-400">ตัวอย่าง</div>
                  <div className="font-mono text-label text-ink-600">{sample}</div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Select
                  label="รูปแบบ"
                  size="sm"
                  value={draft.format_preset}
                  onChange={(event) => handleFormatChange(docType, event.target.value)}
                >
                  {DOC_NUMBER_FORMATS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="จำนวนหลัก"
                  size="sm"
                  value={draft.seq_padding}
                  onChange={(event) =>
                    updateDraft(docType, { seq_padding: Number(event.target.value) })
                  }
                >
                  {SEQ_PADDING_OPTIONS.map((padding) => (
                    <option key={padding} value={padding}>
                      {padding} หลัก
                    </option>
                  ))}
                </Select>
                <Select
                  label="รีเซ็ต"
                  size="sm"
                  value={draft.reset_period}
                  onChange={(event) => updateDraft(docType, { reset_period: event.target.value })}
                >
                  {resetOptionsForFormat(draft.format_preset).map((period) => (
                    <option key={period} value={period}>
                      {RESET_LABELS[period]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-1 text-label text-ink-500">
                <span>เลขถัดไป:</span>
                <span className="font-mono text-ink-700">{nextNumber || "—"}</span>
                {option && <span className="text-ink-400">· {option.label}</span>}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleRequestSave} disabled={!dirty || saving}>
          บันทึกการตั้งค่า
        </Button>
      </div>

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
        onConfirm={() => void handleConfirmedSave()}
      />
    </div>
  );
}
