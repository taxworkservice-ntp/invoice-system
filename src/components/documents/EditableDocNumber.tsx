import { useState } from "react";
import { useDevMode } from "../../hooks/useDevMode";

interface EditableDocNumberProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoGenerate?: () => Promise<string>;
}

export function EditableDocNumber({
  value,
  onChange,
  className = "",
  placeholder = "เลขที่เอกสาร",
  autoGenerate,
}: EditableDocNumberProps) {
  const { isDevMode } = useDevMode();
  const [generating, setGenerating] = useState(false);

  if (!isDevMode) return null;

  async function handleGenerate() {
    if (!autoGenerate) return;
    setGenerating(true);
    try {
      const num = await autoGenerate();
      onChange(num);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-control border border-warning-border bg-warning-soft px-2.5 py-1.5 text-body font-mono text-ink-900 placeholder:text-ink-400 focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning/20"
      />
      {autoGenerate && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="shrink-0 rounded-control border border-warning-border bg-warning-soft px-2.5 py-1.5 text-label font-medium text-warning-text hover:bg-warning-soft disabled:opacity-50"
        >
          {generating ? "..." : "สร้างเลขที่"}
        </button>
      )}
    </div>
  );
}

interface EditableDocNumberInlineProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
}

export function EditableDocNumberInline({
  value,
  onSave,
  className = "",
}: EditableDocNumberInlineProps) {
  const { isDevMode } = useDevMode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isDevMode) return <span className={className}>{value || "-"}</span>;

  async function handleSave() {
    if (draft === value || !draft.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกเลขที่เอกสารไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className={`inline-flex flex-col gap-1 ${className}`}>
        <span className="inline-flex items-center gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-48 rounded border border-warning-border bg-warning-soft px-1.5 py-0.5 text-body font-mono text-ink-900 focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning/20"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-label font-medium text-warning-text hover:text-warning-text disabled:opacity-50"
          >
            บันทึก
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-label text-ink-400 hover:text-ink-600"
          >
            ยกเลิก
          </button>
        </span>
        {error && <span className="text-label font-normal text-danger-text">{error}</span>}
      </span>
    );
  }

  return (
    <span
      className={`cursor-pointer border-b border-dashed border-warning hover:border-warning ${className}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="คลิกเพื่อแก้ไข (โหมด DEV)"
    >
      {value || "-"}
    </span>
  );
}
