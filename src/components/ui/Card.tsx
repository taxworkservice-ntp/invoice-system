import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Success tone for completed guide steps — green hairline border on white.
   * Surfaces stay white; green appears only as hairlines and small marks. */
  tone?: "default" | "success";
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export function Card({
  children,
  className = "",
  id,
  tone = "default",
  onClick,
  onMouseEnter,
}: CardProps) {
  return (
    <div
      id={id}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`${tone === "success" ? "border-success border-[1.5px]" : "border-card-border border-[0.5px]"} bg-white rounded-card p-4 transition-[border-color,transform] ${onClick ? "cursor-pointer hover:border-line-strong active:translate-y-[1px]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
