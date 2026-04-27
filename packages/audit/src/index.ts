export { redactPII } from "@docket/domain";

export const AUDIT_RULES = {
  allWriteActionsCreateAuditEvents: true,
  distinguishAiClientDocumentAndReviewerActions: true,
  noPiiInLogs: true,
} as const;
