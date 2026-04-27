export { assertWorkflowConsent, grantConsent, hasActiveConsent, requiredConsentsForWorkflow, revokeConsent } from "@docket/domain";

export const CONSENT_RULES = {
  affirmativeConsentRequired: true,
  missingConsentBlocksAffectedAiWorkflow: true,
  consentChangesAreAudited: true,
} as const;
