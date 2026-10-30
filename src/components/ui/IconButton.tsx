import React from "react";
import { Spinner } from "./Spinner";

export type IconButtonTone = "neutral" | "primary" | "danger";

interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  "aria-label": string;
  tone?: IconButtonTone;
  size?: "sm" | "md";
  loading?: boolean;
}

const TONES: Record<IconButtonTone, string> = {
  neutral: "text-ink-400 hover:bg-paper-field hover:text-ink-700",
  primary: "text-primary hover:bg-primary-soft hover:text-primary-deep",
  danger: "text-ink-400 hover:bg-danger-soft hover:text-danger-text",
};

const SIZES: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-11 w-11 md:h-8 md:w-8",
  md: "h-11 w-11 md:h-10 md:w-10",
};

export function IconButton({
  tone = "neutral",
  size = "sm",
  loading = false,
  className = "",
  children,
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      title={title ?? props["aria-label"]}
      disabled={props.disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center rounded-control transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${TONES[tone]} ${className}`}
    >
      {loading ? <Spinner inline className="h-4 w-4" /> : children}
    </button>
  );
}
