import type { DocumentStatus } from "../../types";
import { StatusBadge } from "./StatusBadge";

interface BadgeProps {
  status: DocumentStatus;
}

/**
 * Status pill for a document status. Delegates to StatusBadge so Thai labels
 * and colors stay defined in one place.
 */
export function Badge({ status }: BadgeProps) {
  return <StatusBadge status={status} />;
}
