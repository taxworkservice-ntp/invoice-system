import React from "react";
import { Spinner } from "./Spinner";

export type ButtonTone = "blue" | "green" | "amber" | "red" | "teal" | "slate";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  tone?: ButtonTone;
  solid?: boolean;
  loading?: boolean;
}

const TONES: Record<ButtonTone, string> = {
  blue: "bg-primary-soft text-primary-deep border-primary-border hover:border-primary",
  green: "bg-success-soft text-success-text border-success-border hover:border-success",
  amber: "bg-warning-soft text-warning-text border-warning-border hover:border-warning",
  red: "bg-danger-soft text-danger-text border-danger-border hover:border-danger",
  teal: "bg-accent-teal/10 text-accent-teal border-accent-teal/30 hover:border-accent-teal",
  slate: "bg-paper-field text-ink-500 border-line hover:border-line-strong",
};

const SOLID_TONES: Record<ButtonTone, string> = {
  blue: "bg-primary text-white hover:bg-primary-deep",
  green: "bg-success text-white hover:bg-success-text",
  amber: "bg-warning text-ink-900 hover:bg-warning-text",
  red: "bg-danger text-white hover:bg-danger-strong",
  teal: "bg-accent-teal text-white",
  slate: "bg-ink-300 text-white hover:bg-ink-400",
};

/**
 * Button. Sizes map to the type scale: `sm` = label (11px), `md` = body (13px).
 * Flat by design — no shadows (design-system elevation policy).
 */
export function Button({ variant = "primary", size = "md", tone, solid = false, className = "", loading, children, disabled, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]";
  const sizes = size === "sm" ? "px-3 py-1.5 text-label" : "px-4 py-2 text-body";
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-deep",
    secondary: "bg-white border border-card-border text-ink-700 hover:bg-paper-field hover:border-line-strong",
    danger: "bg-danger-soft text-danger border border-danger-border hover:border-danger",
    ghost: "text-ink-600 hover:bg-ink-50",
  };
  const colors = tone ? (solid ? SOLID_TONES[tone] : TONES[tone]) : variants[variant];
  const borderForTone = tone && !solid ? "border" : "";
  return (
    <button className={`${base} ${sizes} ${colors} ${borderForTone} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <Spinner inline className="w-4 h-4 mr-1.5 border-line-strong" />}
      {children}
    </button>
  );
}
