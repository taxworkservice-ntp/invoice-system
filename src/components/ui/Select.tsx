import React, { useId } from "react";
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  size?: "sm" | "md";
  containerClassName?: string;
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, size = "md", className = "", containerClassName = "", id, children, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-label" : "px-3 py-2 text-body";

  return (
    <div className={containerClassName}>
      {label ? (
        <label htmlFor={fieldId} className="mb-1 block text-label font-medium text-ink-600">
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`w-full min-h-11 rounded-control border bg-white transition-colors focus:outline-none focus:ring-2 md:min-h-0 ${sizes} ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-card-border focus:border-primary focus:ring-primary/20"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="mt-1 text-label text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
