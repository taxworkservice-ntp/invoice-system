export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9/-]*$/;

export function normalizeSku(value: string) {
  return value.trim().toUpperCase();
}

export function validateSku(value: string) {
  const sku = normalizeSku(value);

  if (!sku) {
    return "Please enter a SKU";
  }

  if (!SKU_PATTERN.test(sku)) {
    return "Use A-Z, 0-9, - or / only";
  }

  return null;
}

export function isDuplicateSkuError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "23505" &&
    typeof candidate.message === "string" &&
    candidate.message.includes("idx_items_user_sku_unique")
  );
}
