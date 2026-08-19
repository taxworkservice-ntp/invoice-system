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
  blue: "bg-primary-soft text-primary-deep border-primary-border hover:bg-blue-100",
  green: "bg-success-soft text-success-text border-success-border hover:bg-green-100",
  amber: "bg-warning-soft text-warning-text border-warning-border hover:bg-amber-100",
  red: "bg-danger-soft text-danger-text border-danger-border hover:bg-red-100",
  teal: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100",
  slate: "bg-cool-50 text-cool-500 border-cool-200 hover:bg-cool-100",
};

const SOLID_TONES: Record<ButtonTone, string> = {
  blue: "bg-blue-500 text-white hover:bg-blue-600",
  green: "bg-green-500 text-white hover:bg-green-600",
  amber: "bg-amber-500 text-white hover:bg-amber-600",
  red: "bg-danger text-white hover:bg-red-700",
  teal: "bg-teal-500 text-white hover:bg-teal-600",
  slate: "bg-stone-500 text-white hover:bg-stone-600",
};

export function Button({ variant = "primary", size = "md", tone, solid = false, className = "", loading, children, disabled, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-[background-color,border-color,color,box-shadow,transform] disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]";
  const sizes = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const variants = {
    primary: "bg-primary text-white shadow-sm hover:bg-blue-600 hover:shadow-md",
    secondary: "bg-white border border-card-border text-gray-700 hover:bg-gray-50 hover:shadow-sm",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    ghost: "text-gray-600 hover:bg-gray-100",
  };
  const colors = tone ? (solid ? SOLID_TONES[tone] : TONES[tone]) : variants[variant];
  const borderForTone = tone && !solid ? "border" : "";
  return (
    <button className={`${base} ${sizes} ${colors} ${borderForTone} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <Spinner inline className="w-4 h-4 mr-1.5 border-gray-300" />}
      {children}
    </button>
  );
}
