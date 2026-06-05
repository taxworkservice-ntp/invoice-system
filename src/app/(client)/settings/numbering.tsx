import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
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
];

export default function SettingsNumberingPage() {
  const { profile } = useAuth();
  const [sequences, setSequences] = useState<Record<string, DocNumberSequence>>({});
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
      .then(({ data, error: err }) => {
        if (!err && data) {
          const map: Record<string, DocNumberSequence> = {};
          for (const seq of data as DocNumberSequence[]) {
            map[seq.doc_type] = seq;
          }
          setSequences(map);
        }
        setLoading(false);
      });
  }, [profile]);

  function getPrefix(docType: DocumentType): string {
    return sequences[docType]?.prefix || "";
  }

  function getResetYearly(docType: DocumentType): boolean {
    return sequences[docType]?.reset_yearly ?? false;
  }

  function setPrefix(docType: DocumentType, value: string) {
    setSequences((prev) => ({
      ...prev,
      [docType]: {
        ...prev[docType],
        doc_type: docType,
        prefix: value,
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
      } as DocNumberSequence,
    }));
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const rows = DOC_TYPES.map((docType) => {
      const existing = sequences[docType];
      const prefix = getPrefix(docType);
      const resetYearly = getResetYearly(docType);

      if (existing?.id) {
        return { id: existing.id, prefix, reset_yearly: resetYearly };
      }
      return { user_id: profile.id, doc_type: docType, prefix, reset_yearly: resetYearly, last_sequence: 0 };
    });

    const upserts = rows.map((row) => {
      if ("id" in row && row.id) {
        return supabase.from("doc_number_sequences").update({ prefix: row.prefix, reset_yearly: row.reset_yearly }).eq("id", row.id);
      }
      const { id: _id, ...insertRow } = row as { id?: string; user_id: string; doc_type: DocumentType; prefix: string; reset_yearly: boolean; last_sequence: number };
      return supabase.from("doc_number_sequences").insert(insertRow);
    });

    const results = await Promise.all(upserts);
    const hasError = results.some((r) => r.error);
    if (hasError) {
      const msg = results.find((r) => r.error)?.error?.message || "เกิดข้อผิดพลาด";
      setError(msg);
      toast.error(msg);
    } else {
      setSuccess("บันทึกสำเร็จ");
      toast.success("บันทึกเลขที่เอกสารสำเร็จ");
    }
    setSaving(false);
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border text-gray-500">
                    <th className="text-left py-2 pr-2">ประเภทเอกสาร</th>
                    <th className="text-left py-2 pr-2">คำนำหน้าเลขที่</th>
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
                          placeholder="เช่น QT-"
                          className="text-xs"
                        />
                      </td>
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
