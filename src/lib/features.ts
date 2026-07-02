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
];
