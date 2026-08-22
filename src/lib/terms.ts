// Terms are fully user-owned: blank setting = no terms printed.
export function splitTerms(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
