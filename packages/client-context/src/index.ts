export { detectContradictions, detectMissingDocuments, runContextReconciliation } from "@docket/domain";

export const CLIENT_CONTEXT_SOURCE_HIERARCHY = [
  "IRS_TRANSCRIPT",
  "FILED_PRIOR_YEAR_RETURN",
  "SOURCE_DOCUMENT",
  "SIGNED_PORTAL_ANSWER",
  "CLIENT_MESSAGE",
  "MEETING_TRANSCRIPT",
  "STAFF_NOTE",
  "AI_INFERENCE",
] as const;
