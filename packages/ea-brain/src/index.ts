export { generateClientQuestions, generateWorkpapers, runAIPrep, unsupportedScopeResponse } from "@docket/domain";

export const EA_REASONING_PROTOCOL = [
  "identify_context",
  "separate_facts_from_assumptions",
  "retrieve_and_rank_authority",
  "apply_law_or_process_to_facts",
  "assess_risk",
  "decide_next_action",
  "produce_work_product",
] as const;
