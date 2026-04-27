export { detectDeductionOpportunities, detectMissingDocuments, runContextReconciliation } from "@docket/domain";

export const TRANSCRIPT_ADAPTERS = {
  googleMeet: "interface_only",
  zoom: "interface_only",
  mock: "enabled",
} as const;
