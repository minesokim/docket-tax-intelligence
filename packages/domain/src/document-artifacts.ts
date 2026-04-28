import type { DocumentClass, ExtractedFieldFixture, SourceDocument } from "./types";

export type TextBackedExtraction = {
  text: string;
  fields: ExtractedFieldFixture[];
  documentClass: DocumentClass;
  taxYear: number | null;
};

const SEEDED_DOCUMENT_TEXT: Record<string, string> = {
  "fixture://documents/miguel/acme-w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Miguel Sandoval
Employer: Acme Design Systems
Employer EIN: 12-3456789
Box 1 wages: $142,350.00
Box 2 federal income tax withheld: $24,880.00
Box 16 state wages CA: $142,350.00
Box 17 state income tax withheld CA: $8,920.00`,

  "fixture://documents/miguel/bluepeak-1099-nec.txt": `Form 1099-NEC Nonemployee Compensation
Tax year: 2024
Recipient: Miguel Sandoval
Payer: Bluepeak Labs
Nonemployee compensation: $42,000.00
Account notes: consulting services. Payment channel not stated on form.`,

  "fixture://documents/miguel/stripe-1099-k.txt": `Form 1099-K Payment Card and Third Party Network Transactions
Tax year: 2024
Recipient: Miguel Sandoval
Payment settlement entity: Stripe
Gross amount: $63,000.00
January gross amount: $4,800.00
February gross amount: $5,200.00
March gross amount: $6,100.00
Potential payer overlap: Bluepeak Labs may have paid invoices through Stripe.`,

  "fixture://documents/miguel/chase-1099-int.txt": `Form 1099-INT Interest Income
Tax year: 2024
Recipient: Miguel Sandoval
Payer: Chase Bank
Interest income: $184.31`,

  "fixture://documents/miguel/q4-mileage-log.txt": `Mileage log
Tax year: 2024
Owner: Miguel Sandoval
Coverage period: Q4 only
Business miles: 1,180
Business purpose present: false
Notes: destinations are listed for several trips, but business purpose is missing on many entries.`,

  "fixture://documents/miguel/business-expense-summary.txt": `Business expense summary
Tax year: 2024
Client: Miguel Sandoval
Software subscriptions: $3,120.00
Meals: $1,840.00
Supplies: $920.00
Home office expenses: client mentioned possible office but exclusive use is not confirmed.`,

  "fixture://documents/miguel/prior-year-summary.txt": `Prior-year return summary
Tax year: 2023
Client: Miguel Sandoval
Schedule C gross receipts: $112,000.00
Prior-year brokerage account: true
Prior-year Chase 1099-INT: true
Extension filed last year: true`,

  "fixture://documents/miguel/engagement-letter.txt": `Engagement letter
Tax year: 2024
Client: Miguel Sandoval
Scope: 1040 + Schedule C
Out-of-scope: direct e-file submission, full capital gains engine, full state return automation, crypto tax-lot accounting.`,

  "fixture://documents/miguel/7216-consent.txt": `Consent to use tax return information
Tax year: 2024
Client: Miguel Sandoval
Consent version: ai-tax-prep-v1
AI-assisted tax prep: granted
Meeting transcript analysis: granted
Portal message analysis: granted`,

  "fixture://documents/miguel/8879-placeholder.txt": `Form 8879 signature authorization placeholder
Tax year: 2024
Client: Miguel Sandoval
Status: not signed
Note: E-file remains disabled in the foundation release.`,
};

export function getSeedDocumentText(document: SourceDocument): string | null {
  const explicit = SEEDED_DOCUMENT_TEXT[document.storageKey];
  if (explicit) return explicit;
  if (!document.storageKey.startsWith("fixture://documents/")) return null;

  const fixtureLines = document.fixtureFields.map((field) => `${field.label}: ${String(field.value)}`);
  return [
    document.fileName,
    `Tax year: ${document.taxYear ?? "unknown"}`,
    `Document class: ${document.documentClass.replaceAll("_", " ")}`,
    ...fixtureLines,
  ].join("\n");
}

export function classifyDocumentText(fileName: string, text: string): { documentClass: DocumentClass; taxYear: number | null; confidence: number } {
  const haystack = `${fileName}\n${text}`.toLowerCase();
  const yearMatch = haystack.match(/\b(20[0-9]{2})\b/);
  const taxYear = yearMatch ? Number(yearMatch[1]) : null;
  const match = (documentClass: DocumentClass, confidence: number) => ({ documentClass, taxYear, confidence });

  if (/w-?2|wage and tax statement|box 1 wages/.test(haystack)) return match("W2", 0.93);
  if (/1099-?nec|nonemployee compensation/.test(haystack)) return match("FORM_1099_NEC", 0.94);
  if (/1099-?k|third party network|gross amount|payment settlement/.test(haystack)) return match("FORM_1099_K", 0.92);
  if (/1099-?int|interest income/.test(haystack)) return match("FORM_1099_INT", 0.91);
  if (/1099-?b|broker|brokerage|capital gain|form 8949/.test(haystack)) return match("FORM_1099_B", 0.88);
  if (/1095-?a|marketplace|premium tax credit/.test(haystack)) return match("FORM_1095_A", 0.88);
  if (/mileage|business miles|odometer/.test(haystack)) return match("MILEAGE_LOG", 0.84);
  if (/business expense|expense summary|software subscriptions|meals|supplies/.test(haystack)) return match("BUSINESS_EXPENSE_SUMMARY", 0.82);
  if (/prior-year return|prior year return|schedule c gross receipts/.test(haystack)) return match("PRIOR_YEAR_RETURN_SUMMARY", 0.86);
  if (/engagement letter|scope:/.test(haystack)) return match("ENGAGEMENT_LETTER", 0.8);
  if (/consent version|7216|tax return information/.test(haystack)) return match("CONSENT_7216", 0.82);
  if (/8879|signature authorization/.test(haystack)) return match("FORM_8879", 0.78);
  return match("UNKNOWN", 0.2);
}

function numberValue(match: RegExpMatchArray | null): number | null {
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/[$,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function booleanValue(match: RegExpMatchArray | null): boolean | null {
  if (!match?.[1]) return null;
  if (/true|yes|granted/i.test(match[1])) return true;
  if (/false|no|not signed|denied/i.test(match[1])) return false;
  return null;
}

function addMoney(fields: ExtractedFieldFixture[], text: string, label: string, pattern: RegExp, factType: string, confidence: number, materiality: ExtractedFieldFixture["materiality"] = "HIGH") {
  const value = numberValue(text.match(pattern));
  if (value === null) return;
  fields.push({ label, value, confidence, factType, materiality });
}

function addBoolean(fields: ExtractedFieldFixture[], text: string, label: string, pattern: RegExp, factType: string, confidence: number, materiality: ExtractedFieldFixture["materiality"] = "MEDIUM") {
  const value = booleanValue(text.match(pattern));
  if (value === null) return;
  fields.push({ label, value, confidence, factType, materiality });
}

function addText(fields: ExtractedFieldFixture[], text: string, label: string, pattern: RegExp, confidence: number) {
  const match = text.match(pattern);
  if (!match?.[1]) return;
  fields.push({ label, value: match[1].trim(), confidence });
}

export function extractFieldsFromDocumentText(document: SourceDocument, text: string): TextBackedExtraction {
  const classification = classifyDocumentText(document.fileName, text);
  const documentClass = classification.documentClass === "UNKNOWN" ? document.documentClass : classification.documentClass;
  const fields: ExtractedFieldFixture[] = [];

  addText(fields, text, "Employer", /Employer:\s*(.+)/i, 0.94);
  addText(fields, text, "Payer", /Payer:\s*(.+)/i, 0.94);
  addText(fields, text, "Payment settlement entity", /Payment settlement entity:\s*(.+)/i, 0.94);
  addText(fields, text, "Scope", /Scope:\s*(.+)/i, 0.92);
  addText(fields, text, "Consent version", /Consent version:\s*(.+)/i, 0.92);

  addMoney(fields, text, "Box 1 wages", /Box 1 wages:\s*\$?([0-9,.]+)/i, "W2_WAGES", 0.9);
  addMoney(fields, text, "Nonemployee compensation", /Nonemployee compensation:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED", 0.9);
  addMoney(fields, text, "Gross amount", /Gross amount:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED", 0.88);
  addMoney(fields, text, "Interest income", /Interest income:\s*\$?([0-9,.]+)/i, "INTEREST_INCOME", 0.9, "MEDIUM");
  addMoney(fields, text, "Business miles", /Business miles:\s*([0-9,.]+)/i, "BUSINESS_MILES", 0.8, "MEDIUM");
  addMoney(fields, text, "Software subscriptions", /Software subscriptions:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_EXPENSE_SOFTWARE", 0.82, "MEDIUM");
  addMoney(fields, text, "Meals", /Meals:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_EXPENSE_MEALS", 0.78, "MEDIUM");
  addMoney(fields, text, "Prior-year Schedule C gross receipts", /Schedule C gross receipts:\s*\$?([0-9,.]+)/i, "PRIOR_YEAR_SCHEDULE_C_GROSS_RECEIPTS", 0.9);

  addBoolean(fields, text, "Business purpose present", /Business purpose present:\s*(true|false|yes|no)/i, "MILEAGE_BUSINESS_PURPOSE_SUPPORT", 0.84, "HIGH");
  addBoolean(fields, text, "Prior-year brokerage account", /Prior-year brokerage account:\s*(true|false|yes|no)/i, "PRIOR_YEAR_BROKERAGE_ACCOUNT", 0.88, "MEDIUM");
  addBoolean(fields, text, "Prior-year Chase 1099-INT", /Prior-year Chase 1099-INT:\s*(true|false|yes|no)/i, "PRIOR_YEAR_CHASE_1099_INT", 0.88, "MEDIUM");

  return {
    text,
    fields: fields.length > 0 ? fields : document.fixtureFields,
    documentClass,
    taxYear: classification.taxYear ?? document.taxYear,
  };
}
