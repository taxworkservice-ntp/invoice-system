import React, { useId } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, className = "", id, error, ...props }: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div>
      {label && (
        <label htmlFor={fieldId} className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${error ? "border-red-400" : "border-card-border"} ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-red-500 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: React.ReactNode;
}

export function Select({ label, className = "", id, children, ...props }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div>
      {label && (
        <label htmlFor={fieldId} className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}
      <select
        id={fieldId}
        className={`w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}