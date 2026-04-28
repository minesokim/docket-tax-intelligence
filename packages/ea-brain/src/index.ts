export { generateClientQuestions, generateWorkpapers, runAIPrep, unsupportedScopeResponse } from "@docket/domain";

export const EA_REASONING_PROTOCOL = [
  "classify_situation_mode",
  "reconstruct_fact_pattern",
  "separate_facts_claims_and_assumptions",
  "identify_rule_space",
  "retrieve_and_rank_authority",
  "stress_test_facts_and_run_smell_tests",
  "apply_rules_to_supported_facts",
  "defensive_check_and_diligence_review",
  "decide_next_professional_action",
  "communicate_with_confidence_and_limits",
  "produce_reviewable_work_product",
] as const;
