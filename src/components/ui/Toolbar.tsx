import React from "react";

export interface ToolbarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function Toolbar({ children, actions, className = "" }: ToolbarProps) {
  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
