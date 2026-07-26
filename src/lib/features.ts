import type { ClientFeatureKey } from "../types";

export const CLIENT_FEATURES: {
  key: ClientFeatureKey;
  label: string;
  description: string;
}[] = [
  {
    key: "service_job_details",
    label: "Service job details",
    description:
      "For print/custom production businesses that need color, foil, size, position, material, and remarks per service line.",
  },
  {
    key: "classic_v2_template",
    label: "คลาสสิก V2 Template",
    description:
      "Allow this client to select the Classic V2 PDF template in document settings (no discount column, wider QTY field).",
  },
];
