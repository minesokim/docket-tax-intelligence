export { detectPromptInjectionText, hasPermission, redactPII } from "@docket/domain";

export const SECURITY_BASELINE = {
  rbacReady: true,
  mfaPlaceholder: true,
  sessionLoggingPlaceholder: true,
  piiRedactionHelpers: true,
  clientInputsAreUntrusted: true,
} as const;
