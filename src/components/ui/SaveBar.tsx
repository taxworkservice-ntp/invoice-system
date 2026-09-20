import React from "react";
import { Button } from "./Button";

export type SaveBarTone = "muted" | "success" | "error" | "dirty";

interface SaveBarProps {
  /** Status copy shown on the left. */
  label: React.ReactNode;
  /** Colours the status; `dirty` also renders the unsaved dot. */
  tone?: SaveBarTone;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  /** Optional secondary action (e.g. discard edits) shown before Save. */
  onDiscard?: () => void;
  discardLabel?: string;
  /** Extra controls rendered next to the save button. */
  children?: React.ReactNode;
}

const TONE_CLASS: Record<SaveBarTone, string> = {
  muted: "text-ink-400",
  success: "text-green-600",
  error: "text-red-500",
  dirty: "text-ink-300",
};

/**
 * Sticky save bar for settings/forms. Uses `.sticky-action` so it clears the
 * fixed mobile bottom nav instead of hiding behind it, and drops back to the
 * plain 12px offset on desktop.
 */
export function SaveBar({
  label,
  tone = "muted",
  onSave,
  saving,
  saveLabel = "บันทึก",
  savingLabel = "กำลังบันทึก...",
  onDiscard,
  discardLabel = "ยกเลิกการแก้ไข",
  children,
}: SaveBarProps) {
  return (
    <div className="sticky-action z-10">
      <div className="rounded-card border border-card-border bg-white/95 p-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className={`min-w-0 flex-1 text-label ${TONE_CLASS[tone]}`}>
            {tone === "dirty" ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[6px] w-[6px] rounded-full bg-primary" />
                {label}
              </span>
            ) : (
              label
            )}
          </div>
          {children}
          {onDiscard ? (
            <button
              type="button"
              onClick={onDiscard}
              className="text-label text-ink-500 hover:text-ink-700 underline underline-offset-2"
            >
              {discardLabel}
            </button>
          ) : null}
          <Button onClick={onSave} disabled={saving} className="shrink-0">
            {saving ? savingLabel : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
