import type { Page } from "@playwright/test";

/**
 * The line-item price field of the shared line editor.
 *
 * The caption ("ราคา/หน่วย") is a <label> next to the field, but it may carry
 * a suffix ("• ต้องยืนยัน", "(เก็บไว้คิดบิลต่อ)"), so the name is matched as a
 * substring and the input is reached by following that caption.
 */
export function linePriceInput(page: Page) {
  return page
    .locator('xpath=//label[contains(normalize-space(.), "ราคา/หน่วย")]/following::input[1]')
    .first();
}
