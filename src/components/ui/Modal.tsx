import React, { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 animate-overlay-in" onClick={onClose} />
      <div className="relative bg-white rounded-t-xl md:rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl animate-modal-in">
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="ปิด" className="text-gray-400 hover:text-gray-600 text-lg leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">&times;</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}