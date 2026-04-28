export { detectPromptInjectionText, runDocumentExtraction } from "@docket/domain";
import type { DocumentClass, ExtractedFieldFixture } from "@docket/domain";

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

export type DocumentClassificationResult = {
  documentClass: DocumentClass;
  taxYear: number | null;
  confidence: number;
  reasons: string[];
};

export function classifyTaxDocument(fileName: string, text: string = ""): DocumentClassificationResult {
  const haystack = `${fileName}\n${text}`.toLowerCase();
  const match = haystack.match(/\b(20[0-9]{2})\b/);
  const taxYear = match ? Number(match[1]) : null;
  const classify = (documentClass: DocumentClass, confidence: number, reason: string): DocumentClassificationResult => ({
    documentClass,
    taxYear,
    confidence,
    reasons: [reason],
  });

  if (/w-?2|wage and tax statement|box 1 wages/.test(haystack)) return classify("W2", 0.92, "Detected W-2 wage statement markers.");
  if (/1099-?nec|nonemployee compensation/.test(haystack)) return classify("FORM_1099_NEC", 0.93, "Detected 1099-NEC nonemployee compensation markers.");
  if (/1099-?k|payment card|third party network|gross amount/.test(haystack)) return classify("FORM_1099_K", 0.91, "Detected 1099-K payment settlement markers.");
  if (/1099-?int|interest income/.test(haystack)) return classify("FORM_1099_INT", 0.9, "Detected 1099-INT interest markers.");
  if (/1099-?b|proceeds from broker|brokerage|capital gain/.test(haystack)) return classify("FORM_1099_B", 0.88, "Detected brokerage/capital transaction markers.");
  if (/1095-?a|marketplace|premium tax credit/.test(haystack)) return classify("FORM_1095_A", 0.88, "Detected marketplace insurance markers.");
  if (/mileage|odometer|business miles/.test(haystack)) return classify("MILEAGE_LOG", 0.84, "Detected mileage log markers.");
  if (/expense summary|meals|supplies|software/.test(haystack)) return classify("BUSINESS_EXPENSE_SUMMARY", 0.8, "Detected business expense summary markers.");
  return classify("UNKNOWN", 0.2, "No supported tax document markers detected.");
}

export function extractFixtureLikeFields(documentClass: DocumentClass, text: string): ExtractedFieldFixture[] {
  const fields: ExtractedFieldFixture[] = [];
  const money = (label: string, pattern: RegExp, factType: string) => {
    const match = text.match(pattern);
    if (!match?.[1]) return;
    fields.push({
      label,
      value: Number(match[1].replace(/[$,]/g, "")),
      confidence: 0.82,
      factType,
      materiality: "HIGH",
    });
  };

  if (documentClass === "FORM_1099_NEC") money("Nonemployee compensation", /nonemployee compensation[:\s$]*([0-9,.]+)/i, "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED");
  if (documentClass === "FORM_1099_K") money("Gross amount", /gross amount[:\s$]*([0-9,.]+)/i, "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED");
  if (documentClass === "FORM_1099_INT") money("Interest income", /interest income[:\s$]*([0-9,.]+)/i, "INTEREST_INCOME");
  if (documentClass === "W2") money("Box 1 wages", /box 1 wages[:\s$]*([0-9,.]+)/i, "W2_WAGES");
  if (documentClass === "MILEAGE_LOG") money("Business miles", /business miles[:\s]*([0-9,.]+)/i, "BUSINESS_MILES");

  return fields;
}
