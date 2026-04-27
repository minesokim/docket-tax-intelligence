export { evaluateReviewGate, scoreExtensionRisk, scoreReadiness } from "@docket/domain";

export const RISK_ENGINE_RULES = {
  redFlagsBlockFiling: true,
  noSilentClearance: true,
  extensionRiskUsesMissingDocsLatencyComplexityAndWorkload: true,
} as const;
