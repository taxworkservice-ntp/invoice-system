import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export function Card({ children, className = "", onClick, onMouseEnter }: CardProps) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`bg-white border-[0.5px] border-card-border rounded-card p-4 transition-[border-color,transform] ${onClick ? "cursor-pointer hover:border-line-strong active:translate-y-[1px]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
