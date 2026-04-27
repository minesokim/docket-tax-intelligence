export {
  assertMaterialTaxFactHasEvidence,
  computeTaxFactConfidence,
  materialFactHasEvidence,
  TaxFactSchema,
  EvidenceRefSchema,
} from "@docket/domain";

export const TAX_FACT_GRAPH_RULES = {
  noSourceNoTrustedFact: true,
  clientStatementStartsAsClaim: true,
  materialFactsRequireEvidenceOrHumanOverride: true,
} as const;
