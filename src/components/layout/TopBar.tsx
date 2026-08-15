import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  action?: React.ReactNode;
  wide?: boolean;
}

export function TopBar({ title, showBack, action, wide = false }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
      <div className={`mx-auto flex h-14 w-full items-center justify-between px-4 sm:px-5 lg:px-8 ${wide ? "max-w-screen-2xl" : "max-w-7xl"}`}>
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              aria-label="ย้อนกลับ"
              className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {action}
        </div>
      </div>
    </header>
  );
}
