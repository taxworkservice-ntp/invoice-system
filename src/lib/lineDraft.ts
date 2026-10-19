/**
 * Line-list operations shared by every line-item form.
 *
 * These were duplicated verbatim in `deals/new` and
 * `DeliveryNoteFromQuotationForm` (a focus helper and an identical
 * neighbour-swap algorithm). Keeping them here means one behaviour to fix.
 *
 * Deliberately pure: each function returns the **same array reference** when
 * nothing changes, so React state setters still bail out of a re-render.
 * Side effects (tracking new lines, opening the editor) stay in the screens.
 */

/**
 * Focus the first input of a freshly inserted line row (insert-anywhere UX).
 * No-op when the row was not inserted (guard rejected) or not yet painted.
 */
export function focusLineInput(id: string): void {
  window.setTimeout(() => {
    const input = document.querySelector(`#dn-line-${id} input`);
    if (input instanceof HTMLElement) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus({ preventScroll: true });
    }
  }, 30);
}

/** Swap a line with its neighbour. Edge moves return the input unchanged. */
export function moveLine<T extends { id: string }>(
  lines: T[],
  id: string,
  direction: "up" | "down",
): T[] {
  const index = lines.findIndex((line) => line.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= lines.length) return lines;
  const next = [...lines];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Drop one line by id (section markers included — callers guard those). */
export function removeLine<T extends { id: string }>(lines: T[], id: string): T[] {
  return lines.filter((line) => line.id !== id);
}
