import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-card-border rounded-card p-4 shadow-sm transition-[box-shadow,border-color,transform] ${onClick ? "cursor-pointer hover:shadow-md hover:border-gray-300 active:translate-y-[1px]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
