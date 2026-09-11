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
      className={`bg-white border border-card-border rounded-card p-4 shadow-sm transition-[box-shadow,border-color,transform] ${onClick ? "cursor-pointer hover:shadow-md hover:border-gray-300 active:translate-y-[1px]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
