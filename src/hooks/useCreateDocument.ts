import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { creationPath, type CreationParams, type CreationType } from "../lib/docCreation";

/**
 * Navigate to the screen that creates a document type.
 *
 * Use this instead of writing a `/deals/new` or `/documents/new` URL by hand:
 * the mapping lives in `src/lib/docCreation.ts`, and hand-built URLs are what
 * produced the billing-note double implementation and the un-saveable
 * `invoice_from_delivery_notes` form.
 */
export function useCreateDocument() {
  const navigate = useNavigate();
  return useCallback(
    (type: CreationType, params?: CreationParams) => {
      const path = creationPath(type, params);
      if (path) navigate(path);
      return path;
    },
    [navigate],
  );
}
