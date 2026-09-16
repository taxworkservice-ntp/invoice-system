import React, { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl" | "full";
}

let openModalCount = 0;

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-full",
};

export function Modal({ open, onClose, title, children, className = "", size = "md" }: ModalProps) {
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) return;

    if (!wasOpen.current) {
      wasOpen.current = true;
      openModalCount++;
      document.body.style.overflow = "hidden";
    }

    return () => {
      if (wasOpen.current) {
        wasOpen.current = false;
        openModalCount--;
        if (openModalCount <= 0) {
          openModalCount = 0;
          document.body.style.overflow = "";
        }
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 animate-overlay-in" onClick={onClose} />
      <div className={`relative bg-white border-[0.5px] border-card-border rounded-t-card md:rounded-card w-full ${sizeClasses[size]} max-h-[85vh] overflow-y-auto p-5 shadow-overlay animate-modal-in ${className}`}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-title font-semibold text-ink-900">{title}</h2>
            <button onClick={onClose} aria-label="ปิด" className="text-ink-400 hover:text-ink-600 text-title leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-50 transition-colors">&times;</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
