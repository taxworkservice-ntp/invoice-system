import React from "react";
import { Spinner } from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", className = "", loading, children, disabled, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-[background-color,border-color,color,box-shadow,transform] disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]";
  const sizes = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const variants = {
    primary: "bg-primary text-white shadow-sm hover:bg-blue-600 hover:shadow-md",
    secondary: "bg-white border border-card-border text-gray-700 hover:bg-gray-50 hover:shadow-sm",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    ghost: "text-gray-600 hover:bg-gray-100",
  };
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading && <Spinner inline className="w-4 h-4 mr-1.5 border-gray-300" />}
      {children}
    </button>
  );
}
