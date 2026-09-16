import type { Page } from "@playwright/test";

/**
 * The line-item price field on the new/edit deal form.
 *
 * Its caption ("ราคา/หน่วย") is a plain <span> sibling, not a <label>, so the
 * input has no accessible name and cannot be found with getByLabel. Reach it
 * by following the first input after that caption.
 */
export function linePriceInput(page: Page) {
  return page
    .locator('xpath=//span[contains(normalize-space(.), "ราคา/หน่วย")]/following::input[1]')
    .first();
}
