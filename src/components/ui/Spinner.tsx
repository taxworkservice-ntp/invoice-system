import React from "react";

interface SpinnerProps {
  className?: string;
  inline?: boolean;
}

export function Spinner({ className = "", inline = false }: SpinnerProps) {
  if (inline) {
    return <div className={`inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
    </div>
  );
}