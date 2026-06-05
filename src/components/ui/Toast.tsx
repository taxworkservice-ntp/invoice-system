import React from "react";

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

const ICON_MAP: Record<ToastItem["type"], string> = {
  success: "\u2713",
  error: "\u2717",
  info: "\u2139",
};

const COLOR_MAP: Record<ToastItem["type"], string> = {
  success: "bg-paid-bg text-paid-text",
  error: "bg-overdue-bg text-overdue-text",
  info: "bg-sent-bg text-sent-text",
};

export function Toast({ toasts, removeToast }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 z-50 flex flex-col gap-2 items-center md:items-end pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => removeToast(toast.id)}
          className={`flex items-center gap-2 px-4 py-3 rounded-card text-sm font-medium shadow-lg pointer-events-auto cursor-pointer animate-toast-in w-full md:w-auto md:max-w-xs ${COLOR_MAP[toast.type]}`}
        >
          <span className="text-base leading-none shrink-0">{ICON_MAP[toast.type]}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
