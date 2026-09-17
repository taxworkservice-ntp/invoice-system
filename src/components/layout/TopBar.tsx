import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { contentClass, type ContentProfile } from "../../design/tokens";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  action?: React.ReactNode;
  /** Must match the `AppShell` width so the title aligns with the content. */
  width?: ContentProfile;
}

export function TopBar({ title, showBack, onBack, action, width = "data" }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
      <div className={`mx-auto flex h-14 w-full items-center justify-between px-4 sm:px-5 lg:px-8 ${contentClass[width]}`}>
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => (onBack ? onBack() : navigate(-1))}
              aria-label="ย้อนกลับ"
              className="text-ink-500 hover:text-ink-700 p-1 rounded-control hover:bg-ink-50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-body font-semibold text-ink-800 tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {action}
        </div>
      </div>
    </header>
  );
}
