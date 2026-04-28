export { classifyDocumentText, detectPromptInjectionText, extractFieldsFromDocumentText, getSeedDocumentText, runDocumentExtraction, uploadTextDocumentForReturn } from "@docket/domain";
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
  if (/1099-?div|ordinary dividends|qualified dividends/.test(haystack)) return classify("FORM_1099_DIV", 0.9, "Detected 1099-DIV dividend markers.");
  if (/1099-?b|proceeds from broker|brokerage|capital gain/.test(haystack)) return classify("FORM_1099_B", 0.88, "Detected brokerage/capital transaction markers.");
  if (/1099-?r|gross distribution|distribution code/.test(haystack)) return classify("FORM_1099_R", 0.88, "Detected 1099-R retirement distribution markers.");
  if (/1098-?t|qualified tuition|scholarships or grants/.test(haystack)) return classify("FORM_1098_T", 0.87, "Detected 1098-T education statement markers.");
  if (/1095-?a|marketplace|premium tax credit/.test(haystack)) return classify("FORM_1095_A", 0.88, "Detected marketplace insurance markers.");
  if (/schedule k-?1|partner's share|partnership|capital account/.test(haystack)) return classify("SCHEDULE_K1", 0.86, "Detected Schedule K-1 partnership markers.");
  if (/crypto|tax-?lot|coinbase|digital asset/.test(haystack)) return classify("CRYPTO_TAX_LOT_REPORT", 0.84, "Detected crypto tax-lot report markers.");
  if (/mortgage interest|real estate taxes paid|outstanding mortgage principal/.test(haystack)) return classify("FORM_1098", 0.84, "Detected Form 1098 mortgage markers.");
  if (/state workday allocation|california workdays|oregon workdays/.test(haystack)) return classify("STATE_ALLOCATION_WORKPAPER", 0.82, "Detected state workday allocation worksheet markers.");
  if (/dependent care|provider ein|childcare|care purpose/.test(haystack)) return classify("DEPENDENT_CARE_STATEMENT", 0.82, "Detected dependent care provider support markers.");
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
  if (documentClass === "FORM_1099_DIV") money("Total ordinary dividends", /total ordinary dividends[:\s$]*([0-9,.]+)/i, "DIVIDEND_INCOME_ORDINARY");
  if (documentClass === "FORM_1099_R") money("Gross distribution", /gross distribution[:\s$]*([0-9,.]+)/i, "RETIREMENT_GROSS_DISTRIBUTION");
  if (documentClass === "FORM_1099_B") money("Proceeds", /proceeds[:\s$]*([0-9,.]+)/i, "CAPITAL_PROCEEDS");
  if (documentClass === "FORM_1098") money("Mortgage interest received from borrower", /mortgage interest received from borrower[:\s$]*([0-9,.]+)/i, "MORTGAGE_INTEREST");
  if (documentClass === "FORM_1098_T") money("Payments received for qualified tuition and related expenses", /payments received for qualified tuition and related expenses[:\s$]*([0-9,.]+)/i, "EDUCATION_QUALIFIED_TUITION");
  if (documentClass === "FORM_1095_A") money("Annual APTC", /annual aptc[:\s$]*([0-9,.]+)/i, "MARKETPLACE_ANNUAL_APTC");
  if (documentClass === "SCHEDULE_K1") money("Ordinary business income", /ordinary business income[:\s$]*([0-9,.]+)/i, "K1_ORDINARY_BUSINESS_INCOME");
  if (documentClass === "CRYPTO_TAX_LOT_REPORT") money("Proceeds", /proceeds[:\s$]*([0-9,.]+)/i, "CAPITAL_PROCEEDS");
  if (documentClass === "DEPENDENT_CARE_STATEMENT") money("Amount paid", /amount paid[:\s$]*([0-9,.]+)/i, "DEPENDENT_CARE_AMOUNT_PAID");
  if (documentClass === "W2") money("Box 1 wages", /box 1 wages[:\s$]*([0-9,.]+)/i, "W2_WAGES");
  if (documentClass === "MILEAGE_LOG") money("Business miles", /business miles[:\s]*([0-9,.]+)/i, "BUSINESS_MILES");

  return fields;
}
