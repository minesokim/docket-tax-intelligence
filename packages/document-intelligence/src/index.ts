export { detectPromptInjectionText, runDocumentExtraction } from "@docket/domain";

export const DOCUMENT_PIPELINE_STEPS = [
  "validate_file_type",
  "malware_scan_placeholder",
  "classify_document",
  "detect_tax_year",
  "detect_duplicate",
  "extract_fields",
  "create_evidence_refs",
  "normalize_tax_facts",
  "create_audit_events",
] as const;
