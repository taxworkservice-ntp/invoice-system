import React from "react";

type SectionTone = "default" | "success" | "warning" | "danger" | "info";

interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  titleRight?: React.ReactNode;
  tone?: SectionTone;
  padding?: "default" | "none";
  className?: string;
  children?: React.ReactNode;
}

const TONES: Record<SectionTone, string> = {
  default: "border-line bg-white",
  success: "border-success-border bg-success-soft",
  warning: "border-warning-border bg-warning-soft",
  danger: "border-danger-border bg-danger-soft",
  info: "border-primary-border bg-primary-soft",
};

export function SectionCard({
  title,
  description,
  icon,
  titleRight,
  tone = "default",
  padding = "default",
  className = "",
  children,
}: SectionCardProps) {
  const hasHeader = Boolean(title || icon || titleRight);
  return (
    <section className={`rounded-sheet border ${TONES[tone]} ${padding === "none" ? "overflow-hidden" : "p-4 sm:p-5"} ${className}`}>
      {hasHeader && (
        <div className={`flex items-center gap-2 ${padding === "none" ? "p-4 pb-0 sm:p-5 sm:pb-0" : "mb-4"}`}>
          {icon ? <span className="text-ink-400">{icon}</span> : null}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
            {description ? (
              <p className="mt-0.5 text-[11px] text-[#888780]">{description}</p>
            ) : null}
          </div>
          {titleRight ? <div className="ml-auto">{titleRight}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
