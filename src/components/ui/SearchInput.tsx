import { useRef, useEffect, useState, forwardRef } from "react";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = "ค้นหา...", debounceMs = 0, className = "" }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const isDebounced = debounceMs > 0;
    const [local, setLocal] = useState(value);

    useEffect(() => {
      if (ref) {
        if (typeof ref === "function") {
          ref(inputRef.current);
        } else {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = inputRef.current;
        }
      }
    }, [ref]);

    useEffect(() => {
      if (isDebounced) {
        setLocal(value);
      }
    }, [value, isDebounced]);

    useEffect(() => {
      if (!isDebounced) return;
      const timer = setTimeout(() => onChange(local), debounceMs);
      return () => clearTimeout(timer);
    }, [local, onChange, debounceMs, isDebounced]);

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key !== "/") return;
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const target = e.target as HTMLElement | null;
        if (target?.isContentEditable) return;
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, []);

    const inputValue = isDebounced ? local : value;
    const showClear = inputValue.length > 0;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (isDebounced) {
        setLocal(v);
      } else {
        onChange(v);
      }
    };

    const handleClear = () => {
      if (isDebounced) {
        setLocal("");
      }
      onChange("");
      inputRef.current?.focus();
    };

    return (
      <div className={`relative ${className}`}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA]" />
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-white border-[0.5px] border-[#E8E6DF] rounded-lg pl-9 pr-9 py-[10px] text-[14px] placeholder-[#AAAAAA] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20 transition-colors"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleChange}
        />
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="ล้างการค้นหา"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-[#888780] hover:text-[#1A1A18] hover:bg-[#E8E6DF] transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
