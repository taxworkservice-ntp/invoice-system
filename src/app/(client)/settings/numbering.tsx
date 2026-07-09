import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { useDevMode } from "../../../hooks/useDevMode";
import { AppShell } from "../../../components/layout/AppShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Spinner } from "../../../components/ui/Spinner";
import { useToast } from "../../../hooks/useToast";
import { DOC_TYPE_LABELS } from "../../../constants";
import type { DocNumberSequence, DocumentType } from "../../../types";

const DOC_TYPES: DocumentType[] = ["quotation", "invoice", "tax_invoice_receipt", "billing_note", "receipt", "delivery_note", "credit_note"];

const TABS = [
  { label: "โปรไฟล์", path: "/settings/profile" },
  { label: "ภาษี", path: "/settings/tax" },
  { label: "เลขที่เอกสาร", path: "/settings/numbering" },
  { label: "สต็อก", path: "/settings/stock" },
  { label: "บัญชี", path: "/settings/account" },
];

export default function SettingsNumberingPage() {
  const { profile, clientProfile, setClientProfile } = useAuth();
  const { isDevMode } = useDevMode();
  const [sequences, setSequences] = useState<Record<string, DocNumberSequence>>({});
  const [devEffectiveDate, setDevEffectiveDate] = useState("");
  const [bulkStartSequence, setBulkStartSequence] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    supabase
      .from("doc_number_sequences")
      .select("*")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        const map: Record<string, DocNumberSequence> = {};
        for (const seq of (data || []) as DocNumberSequence[]) {
          map[seq.doc_type] = { ...seq, start_sequence: seq.start_sequence ?? 1 };
        }
        setSequences(map);
        setLoading(false);
      });
  }, [profile]);

  useEffect(() => {
    setDevEffectiveDate(clientProfile?.dev_effective_date || "");
  }, [clientProfile?.dev_effective_date]);

  function getPrefix(docType: DocumentType): string {
    return sequences[docType]?.prefix || "";
  }

  function getResetYearly(docType: DocumentType): boolean {
    return sequences[docType]?.reset_yearly ?? true;
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

  function setResetYearly(docType: DocumentType, value: boolean) {
    setSequences((prev) => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        doc_type: docType,
        reset_yearly: value,
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

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const rows = DOC_TYPES.map((docType) => {
        const existing = sequences[docType];
        const prefix = getPrefix(docType).trim();
        const resetYearly = getResetYearly(docType);
        const startSequence = getStartSequence(docType);

        if (!prefix) throw new Error("กรุณาระบุ prefix ให้ครบทุกประเภทเอกสาร");
        if (!Number.isInteger(startSequence) || startSequence < 1) {
          throw new Error("Start at ต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป");
        }

        if (existing?.id) {
          return { id: existing.id, prefix, reset_yearly: resetYearly, start_sequence: startSequence };
        }
        return { user_id: profile.id, doc_type: docType, prefix, reset_yearly: resetYearly, last_sequence: 0, start_sequence: startSequence };
      });

      const writes = rows.map((row) => {
        if ("id" in row && row.id) {
          return supabase
            .from("doc_number_sequences")
            .update({ prefix: row.prefix, reset_yearly: row.reset_yearly, start_sequence: row.start_sequence })
            .eq("id", row.id);
        }
        const { id: _id, ...insertRow } = row as {
          id?: string;
          user_id: string;
          doc_type: DocumentType;
          prefix: string;
          reset_yearly: boolean;
          last_sequence: number;
          start_sequence: number;
        };
        return supabase.from("doc_number_sequences").insert(insertRow);
      });

      if (isDevMode) {
        writes.push(
          supabase
            .from("client_profiles")
            .update({ dev_effective_date: devEffectiveDate || null })
            .eq("user_id", profile.id),
        );
      }

      const results = await Promise.all(writes);
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;

      if (isDevMode) {
        setClientProfile((prev) => prev ? { ...prev, dev_effective_date: devEffectiveDate || null } : prev);
      }
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

  if (loading) return <AppShell title="ตั้งค่า > เลขที่เอกสาร"><Spinner /></AppShell>;

  return (
    <AppShell title="ตั้งค่า > เลขที่เอกสาร">
      <div className="space-y-4">
        <div className="flex gap-1 border-b border-card-border pb-0">
          {TABS.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-2 text-sm rounded-t-lg ${
                tab.path === "/settings/numbering"
                  ? "bg-white border border-card-border border-b-white text-primary font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <Card>
          <div className="space-y-4">
            {isDevMode && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,240px)_auto] sm:items-end">
                  <Input
                    id="devEffectiveDate"
                    label="DEV fixed business date"
                    type="date"
                    value={devEffectiveDate}
                    onChange={(event) => setDevEffectiveDate(event.target.value)}
                    className="border-amber-300 bg-white"
                  />
                  <Button type="button" variant="secondary" onClick={() => setDevEffectiveDate("")} disabled={!devEffectiveDate || saving}>
                    Clear fixed date
                  </Button>
                </div>
                <p className="mt-2 text-xs text-amber-800">
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
                    onChange={(event) => setBulkStartSequence(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
                    className="border-amber-300 bg-white font-mono"
                  />
                  <Button type="button" variant="secondary" onClick={applyStartSequenceToAll} disabled={saving}>
                    Apply to all documents
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border text-gray-500">
                    <th className="text-left py-2 pr-2">ประเภทเอกสาร</th>
                    <th className="text-left py-2 pr-2">Prefix</th>
                    {isDevMode && <th className="text-left py-2 pr-2">Start at</th>}
                    <th className="text-center py-2">รีเซ็ตทุกเดือน</th>
                  </tr>
                </thead>
                <tbody>
                  {DOC_TYPES.map((docType) => (
                    <tr key={docType} className="border-b border-card-border/50">
                      <td className="py-2 pr-2">{DOC_TYPE_LABELS[docType].th}</td>
                      <td className="py-2 pr-2">
                        <Input
                          value={getPrefix(docType)}
                          onChange={(e) => setPrefix(docType, e.target.value)}
                          placeholder="เช่น INV"
                          className="text-xs"
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
                            className="text-xs font-mono"
                          />
                        </td>
                      )}
                      <td className="py-2 text-center">
                        <input
                          type="checkbox"
                          checked={getResetYearly(docType)}
                          onChange={(e) => setResetYearly(docType, e.target.checked)}
                          className="w-4 h-4 text-primary rounded border-card-border"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {success && <p className="text-xs text-green-500">{success}</p>}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
