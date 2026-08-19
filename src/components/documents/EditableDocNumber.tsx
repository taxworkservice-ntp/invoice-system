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
        className="w-full rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      {autoGenerate && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="shrink-0 rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50"
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
            className="w-48 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-sm font-mono text-gray-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
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
            className="text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            บันทึก
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ยกเลิก
          </button>
        </span>
        {error && <span className="text-xs font-normal text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span
      className={`cursor-pointer border-b border-dashed border-amber-400 hover:border-amber-600 ${className}`}
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
