export { detectDeductionOpportunities, detectMissingDocuments, runContextReconciliation } from "@docket/domain";
import type { RiskLevel } from "@docket/domain";

export const TRANSCRIPT_ADAPTERS = {
  googleMeet: "interface_only",
  zoom: "interface_only",
  mock: "enabled",
} as const;

export type ConversationExtraction = {
  insightType:
    | "STOCK_SALE_CLAIM"
    | "RESIDENCY_CHANGE_CLAIM"
    | "HOME_OFFICE_CLAIM"
    | "PROMPT_INJECTION_SIGNAL"
    | "MISSING_DOCUMENT_SIGNAL";
  summary: string;
  riskLevel: RiskLevel;
  sourceQuote: string;
  missingFacts: string[];
  expectedDocuments: string[];
};

function sentenceMatches(text: string, pattern: RegExp): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => pattern.test(sentence.toLowerCase()));
}

export function extractTaxConversationSignals(text: string): ConversationExtraction[] {
  const signals: ConversationExtraction[] = [];

  for (const sentence of sentenceMatches(text, /\b(sold|sale|sell)\b.*\b(stock|shares|brokerage|tesla|apple|nvidia)\b|\b(stock|shares|brokerage|tesla|apple|nvidia)\b.*\b(sold|sale|sell)\b/)) {
    signals.push({
      insightType: "STOCK_SALE_CLAIM",
      summary: "Client mentioned a stock or brokerage sale; brokerage tax package is expected.",
      riskLevel: "RED",
      sourceQuote: sentence,
      missingFacts: ["brokerage name", "proceeds", "basis", "holding period", "wash-sale adjustments"],
      expectedDocuments: ["FORM_1099_B", "consolidated brokerage 1099"],
    });
  }

  for (const sentence of sentenceMatches(text, /\b(moved|relocated|move)\b.*\b(california|ca|texas|tx|new york|ny)\b|\b(california|ca|texas|tx|new york|ny)\b.*\b(moved|relocated|move)\b/)) {
    signals.push({
      insightType: "RESIDENCY_CHANGE_CLAIM",
      summary: "Client mentioned a state move; residency and wage allocation facts are incomplete.",
      riskLevel: "YELLOW",
      sourceQuote: sentence,
      missingFacts: ["exact move date", "domicile facts", "post-move work location", "state wage allocation"],
      expectedDocuments: ["state wage detail", "moving/residency support"],
    });
  }

  for (const sentence of sentenceMatches(text, /\bhome office\b|\boffice\b.*\bhome\b|\broom\b.*\boffice\b/)) {
    signals.push({
      insightType: "HOME_OFFICE_CLAIM",
      summary: "Client mentioned home office use; exclusive and regular use must be tested before claiming.",
      riskLevel: /guest|family|personal|sometimes/.test(sentence.toLowerCase()) ? "YELLOW" : "GREEN",
      sourceQuote: sentence,
      missingFacts: ["exclusive use", "regular use", "business area square footage", "total home square footage"],
      expectedDocuments: ["home expense support if eligible"],
    });
  }

  if (/ignore previous instructions|system prompt|mark.*ready to file|approve.*return/i.test(text)) {
    signals.push({
      insightType: "PROMPT_INJECTION_SIGNAL",
      summary: "Conversation text contains instructions that appear to target the AI workflow rather than tax facts.",
      riskLevel: "RED",
      sourceQuote: text.slice(0, 240),
      missingFacts: ["human review of suspicious instruction"],
      expectedDocuments: [],
    });
  }

  return signals;
}
