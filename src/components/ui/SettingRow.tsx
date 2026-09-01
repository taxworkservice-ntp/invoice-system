import React from "react";

interface SettingRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Right column width for the control (default 240px on sm+). */
  controlWidthClass?: string;
  /** Align the control to the right edge (for switches/toggles). */
  controlAlign?: "left" | "right";
  className?: string;
}

/**
 * Two-column settings row: label + description on the left, control on the
 * right (GitHub/Stripe-style). Stacks vertically on narrow screens.
 */
export function SettingRow({
  label,
  description,
  children,
  controlWidthClass = "sm:w-[240px]",
  controlAlign = "left",
  className = "",
}: SettingRowProps) {
  return (
    <div className={`flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-6 ${className}`}>
      <div className="min-w-0 sm:max-w-[55%]">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[11px] leading-relaxed text-[#888780]">{description}</div>
        ) : null}
      </div>
      <div className={`${controlWidthClass} ${controlAlign === "right" ? "sm:ml-auto sm:flex sm:justify-end" : ""}`}>
        {children}
      </div>
    </div>
  );
}
