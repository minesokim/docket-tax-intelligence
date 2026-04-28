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

  "fixture://documents/avery-chen/w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Avery Chen
Employer: Nimbus Robotics
Employer EIN: 33-1004421
Box 1 wages: $188,240.00
Box 2 federal income tax withheld: $42,880.00
Box 12 code V stock option income: $24,600.00
Box 14 RSU withholding note: equity compensation included in wages`,

  "fixture://documents/avery-chen/1099div.txt": `Form 1099-DIV Dividends and Distributions
Tax year: 2024
Recipient: Avery Chen
Payer: Fidelity Brokerage Services
Total ordinary dividends: $8,640.12
Qualified dividends: $7,925.40
Foreign tax paid: $112.13
Account note: includes mutual fund capital gain distribution detail.`,

  "fixture://documents/avery-chen/rsu-supplement.txt": `Equity compensation supplement
Tax year: 2024
Employee: Avery Chen
Employer: Nimbus Robotics
RSU shares vested: 640
RSU income included in W-2: $24,600.00
Shares withheld for taxes: 182
Brokerage transfer note: shares deposited to Fidelity brokerage account.`,

  "fixture://documents/priya-narayan/1099nec.txt": `Form 1099-NEC Nonemployee Compensation
Tax year: 2024
Recipient: Priya Narayan
Payer: Atlas Strategy Group
Nonemployee compensation: $96,500.00
Account notes: strategic operations consulting.`,

  "fixture://documents/priya-narayan/expenses.txt": `Business expense summary
Tax year: 2024
Client: Priya Narayan
Software subscriptions: $5,820.00
Meals: $2,430.00
Contractor payments: $18,750.00
Travel: $7,910.00
Home office expenses: none claimed
Substantiation note: contractor W-9 files are incomplete for two vendors.`,

  "fixture://documents/priya-narayan/1095a.txt": `Form 1095-A Health Insurance Marketplace Statement
Tax year: 2024
Recipient: Priya Narayan
Marketplace: Covered California
Covered months: 8
Annual premiums: $8,420.64
Annual SLCSP: $7,980.00
Annual APTC: $5,460.00
Note: policy changed after August when employer coverage began.`,

  "fixture://documents/ben-larson/1098.txt": `Form 1098 Mortgage Interest Statement
Tax year: 2024
Borrower: Ben Larson
Lender: Harbor Home Lending
Property: 812 Oak Gate Ave rental property
Mortgage interest received from borrower: $18,920.44
Real estate taxes paid: $6,410.12
Outstanding mortgage principal: $458,000.00`,

  "fixture://documents/ben-larson/k1.txt": `Schedule K-1 Partner's Share of Income, Deductions, Credits, etc.
Tax year: 2024
Partner: Ben Larson
Partnership: Redwood Storage Partners LP
EIN: 82-4410900
Ordinary business income: $18,750.00
Net rental real estate income: -$4,200.00
Guaranteed payments: $0.00
Ending capital account: $64,500.00
Footnote: passive activity and basis limitation details attached by partnership.`,

  "fixture://documents/jordan-ellis/w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Jordan Ellis
Employer: Cedar Analytics
Employer EIN: 22-7199001
Box 1 wages: $121,800.00
Box 2 federal income tax withheld: $22,140.00
Box 12 code D elective deferrals: $19,500.00`,

  "fixture://documents/jordan-ellis/1099b.txt": `Consolidated Form 1099-B Brokerage Statement
Tax year: 2024
Recipient: Jordan Ellis
Broker: Charles Schwab
Proceeds: $74,220.16
Cost basis: $68,410.33
Wash sale loss disallowed: $1,240.20
Transactions: 18
Covered securities: mixed short-term and long-term lots
Note: see Form 8949 detail for basis and wash-sale adjustments.`,

  "fixture://documents/sophia-martinez/w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Sophia Martinez
Employer: Brightside Care Group
Employer EIN: 41-2290871
Box 1 wages: $84,920.00
Box 2 federal income tax withheld: $10,260.00`,

  "fixture://documents/sophia-martinez/organizer.txt": `Client organizer
Tax year: 2024
Client: Sophia Martinez
Dependent: Lena Martinez
Student at least half-time: true
Education expenses mentioned: true
Tuition support uploaded: pending
Childcare expenses: no
Marketplace coverage: no`,

  "fixture://documents/sophia-martinez/1098t.txt": `Form 1098-T Tuition Statement
Tax year: 2024
Student: Lena Martinez
School: Cascadia State University
Payments received for qualified tuition and related expenses: $14,800.00
Scholarships or grants: $3,200.00
Student at least half-time: true
Graduate student: false`,

  "fixture://documents/nora-williams/1099r.txt": `Form 1099-R Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans
Tax year: 2024
Recipient: Nora Williams
Payer: Vanguard Fiduciary Trust
Gross distribution: $28,400.00
Taxable amount: $28,400.00
Federal income tax withheld: $3,200.00
Distribution code: 7
IRA/SEP/SIMPLE: false`,

  "fixture://documents/nora-williams/1099int.txt": `Form 1099-INT Interest Income
Tax year: 2024
Recipient: Nora Williams
Payer: Ally Bank
Interest income: $1,240.55
Early withdrawal penalty: $0.00`,

  "fixture://documents/omar-haddad/w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Omar Haddad
Employer: Metro Logistics
Employer EIN: 91-5508120
Box 1 wages: $72,300.00
Box 2 federal income tax withheld: $8,160.00`,

  "fixture://documents/omar-haddad/crypto.txt": `Crypto tax-lot report
Tax year: 2024
Client: Omar Haddad
Exchange: Coinbase
Proceeds: $12,640.82
Cost basis: $9,112.48
Disposals: 27
Missing cost basis lots: 3
Wallet transfer note: two external wallet transfers require source confirmation.`,

  "fixture://documents/hannah-kim/w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Hannah Kim
Employer: Juniper Health
Employer EIN: 56-1834002
Box 1 wages: $119,400.00
Box 16 state wages CA: $119,400.00
Box 17 state income tax withheld CA: $7,880.00
Remote work note: employer reported all wages to California.`,

  "fixture://documents/hannah-kim/state-allocation.txt": `State workday allocation worksheet
Tax year: 2024
Client: Hannah Kim
California workdays before move: 84
California workdays after move: 18
Oregon workdays: 92
Remote workdays: 110
Employer state wages CA: $119,400.00
Move date: 2024-06-15
Domicile note: lease and driver license changed to Oregon in June.`,

  "fixture://documents/lucas-peterson/w2.txt": `Form W-2 Wage and Tax Statement
Tax year: 2024
Employee: Lucas Peterson
Employer: Northstar Product Studio
Employer EIN: 77-2900412
Box 1 wages: $101,250.00
Box 2 federal income tax withheld: $15,430.00`,

  "fixture://documents/lucas-peterson/dependent-care.txt": `Dependent care provider statement
Tax year: 2024
Taxpayer: Lucas Peterson
Child: Maya Peterson
Provider name: Tiny Oaks Learning Center
Provider EIN: 94-0001188
Amount paid: $6,400.00
Care purpose: care provided while taxpayer worked
Payment support: monthly statements attached`,
};

const UPLOADED_TEXT_PREFIX = "uploaded-text://";

export function storageKeyForUploadedText(text: string): string {
  return `${UPLOADED_TEXT_PREFIX}${Buffer.from(text, "utf8").toString("base64url")}`;
}

function uploadedTextFromStorageKey(storageKey: string): string | null {
  if (!storageKey.startsWith(UPLOADED_TEXT_PREFIX)) return null;
  try {
    return Buffer.from(storageKey.slice(UPLOADED_TEXT_PREFIX.length), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function getSeedDocumentText(document: SourceDocument): string | null {
  const uploadedText = uploadedTextFromStorageKey(document.storageKey);
  if (uploadedText) return uploadedText;
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
  if (/1099-?div|ordinary dividends|qualified dividends/.test(haystack)) return match("FORM_1099_DIV", 0.91);
  if (/1099-?b|broker|brokerage|capital gain|form 8949/.test(haystack)) return match("FORM_1099_B", 0.88);
  if (/1099-?r|gross distribution|distribution code|ira\/sep\/simple/.test(haystack)) return match("FORM_1099_R", 0.9);
  if (/1098-?t|tuition statement|qualified tuition|scholarships or grants/.test(haystack)) return match("FORM_1098_T", 0.89);
  if (/schedule k-?1|partner's share|partnership|capital account/.test(haystack)) return match("SCHEDULE_K1", 0.88);
  if (/crypto|tax-?lot|coinbase|wallet transfer|digital asset/.test(haystack)) return match("CRYPTO_TAX_LOT_REPORT", 0.86);
  if (/1095-?a|marketplace|premium tax credit/.test(haystack)) return match("FORM_1095_A", 0.88);
  if (/mortgage interest|real estate taxes paid|outstanding mortgage principal/.test(haystack)) return match("FORM_1098", 0.86);
  if (/state workday allocation|california workdays|oregon workdays|domicile/.test(haystack)) return match("STATE_ALLOCATION_WORKPAPER", 0.84);
  if (/dependent care|provider ein|care purpose|childcare/.test(haystack)) return match("DEPENDENT_CARE_STATEMENT", 0.84);
  if (/mileage|business miles|odometer/.test(haystack)) return match("MILEAGE_LOG", 0.84);
  if (/business expense|expense summary|software subscriptions|meals|supplies/.test(haystack)) return match("BUSINESS_EXPENSE_SUMMARY", 0.82);
  if (/prior-year return|prior year return|schedule c gross receipts/.test(haystack)) return match("PRIOR_YEAR_RETURN_SUMMARY", 0.86);
  if (/client organizer|organizer|student at least half-time|marketplace coverage/.test(haystack)) return match("CLIENT_ORGANIZER", 0.78);
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
  addText(fields, text, "Broker", /Broker:\s*(.+)/i, 0.92);
  addText(fields, text, "Exchange", /Exchange:\s*(.+)/i, 0.88);
  addText(fields, text, "Marketplace", /Marketplace:\s*(.+)/i, 0.88);
  addText(fields, text, "Provider name", /Provider name:\s*(.+)/i, 0.9);
  addText(fields, text, "Provider EIN", /Provider EIN:\s*(.+)/i, 0.9);
  addText(fields, text, "Distribution code", /Distribution code:\s*(.+)/i, 0.88);
  addText(fields, text, "Move date", /Move date:\s*(.+)/i, 0.86);
  addText(fields, text, "Scope", /Scope:\s*(.+)/i, 0.92);
  addText(fields, text, "Consent version", /Consent version:\s*(.+)/i, 0.92);

  addMoney(fields, text, "Box 1 wages", /Box 1 wages:\s*\$?([0-9,.]+)/i, "W2_WAGES", 0.9);
  addMoney(fields, text, "Box 16 state wages CA", /Box 16 state wages CA:\s*\$?([0-9,.]+)/i, "STATE_WAGES_CA", 0.88, "MEDIUM");
  addMoney(fields, text, "Nonemployee compensation", /Nonemployee compensation:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED", 0.9);
  addMoney(fields, text, "Gross amount", /Gross amount:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED", 0.88);
  addMoney(fields, text, "Interest income", /Interest income:\s*\$?([0-9,.]+)/i, "INTEREST_INCOME", 0.9, "MEDIUM");
  addMoney(fields, text, "Total ordinary dividends", /Total ordinary dividends:\s*\$?([0-9,.]+)/i, "DIVIDEND_INCOME_ORDINARY", 0.9, "MEDIUM");
  addMoney(fields, text, "Qualified dividends", /Qualified dividends:\s*\$?([0-9,.]+)/i, "DIVIDEND_INCOME_QUALIFIED", 0.9, "MEDIUM");
  addMoney(fields, text, "Foreign tax paid", /Foreign tax paid:\s*\$?([0-9,.]+)/i, "FOREIGN_TAX_PAID", 0.84, "LOW");
  addMoney(fields, text, "Gross distribution", /Gross distribution:\s*\$?([0-9,.]+)/i, "RETIREMENT_GROSS_DISTRIBUTION", 0.9, "MEDIUM");
  addMoney(fields, text, "Taxable amount", /Taxable amount:\s*\$?([0-9,.]+)/i, "RETIREMENT_TAXABLE_DISTRIBUTION", 0.88, "MEDIUM");
  addMoney(fields, text, "Mortgage interest received from borrower", /Mortgage interest received from borrower:\s*\$?([0-9,.]+)/i, "MORTGAGE_INTEREST", 0.88, "MEDIUM");
  addMoney(fields, text, "Real estate taxes paid", /Real estate taxes paid:\s*\$?([0-9,.]+)/i, "REAL_ESTATE_TAXES_PAID", 0.84, "MEDIUM");
  addMoney(fields, text, "Payments received for qualified tuition and related expenses", /Payments received for qualified tuition and related expenses:\s*\$?([0-9,.]+)/i, "EDUCATION_QUALIFIED_TUITION", 0.88, "MEDIUM");
  addMoney(fields, text, "Scholarships or grants", /Scholarships or grants:\s*\$?([0-9,.]+)/i, "EDUCATION_SCHOLARSHIPS", 0.86, "MEDIUM");
  addMoney(fields, text, "Annual premiums", /Annual premiums:\s*\$?([0-9,.]+)/i, "MARKETPLACE_ANNUAL_PREMIUMS", 0.88, "HIGH");
  addMoney(fields, text, "Annual SLCSP", /Annual SLCSP:\s*\$?([0-9,.]+)/i, "MARKETPLACE_ANNUAL_SLCSP", 0.88, "HIGH");
  addMoney(fields, text, "Annual APTC", /Annual APTC:\s*\$?([0-9,.]+)/i, "MARKETPLACE_ANNUAL_APTC", 0.88, "HIGH");
  addMoney(fields, text, "Proceeds", /Proceeds:\s*\$?([0-9,.]+)/i, "CAPITAL_PROCEEDS", 0.86, "HIGH");
  addMoney(fields, text, "Cost basis", /Cost basis:\s*\$?([0-9,.]+)/i, "CAPITAL_COST_BASIS", 0.82, "HIGH");
  addMoney(fields, text, "Wash sale loss disallowed", /Wash sale loss disallowed:\s*\$?([0-9,.]+)/i, "WASH_SALE_LOSS_DISALLOWED", 0.82, "MEDIUM");
  addMoney(fields, text, "Ordinary business income", /Ordinary business income:\s*\$?(-?[0-9,.]+)/i, "K1_ORDINARY_BUSINESS_INCOME", 0.84, "HIGH");
  addMoney(fields, text, "Net rental real estate income", /Net rental real estate income:\s*\$?(-?[0-9,.]+)/i, "K1_RENTAL_REAL_ESTATE_INCOME", 0.82, "HIGH");
  addMoney(fields, text, "Ending capital account", /Ending capital account:\s*\$?([0-9,.]+)/i, "K1_ENDING_CAPITAL_ACCOUNT", 0.78, "MEDIUM");
  addMoney(fields, text, "Amount paid", /Amount paid:\s*\$?([0-9,.]+)/i, "DEPENDENT_CARE_AMOUNT_PAID", 0.86, "MEDIUM");
  addMoney(fields, text, "Business miles", /Business miles:\s*([0-9,.]+)/i, "BUSINESS_MILES", 0.8, "MEDIUM");
  addMoney(fields, text, "Covered months", /Covered months:\s*([0-9,.]+)/i, "MARKETPLACE_COVERED_MONTHS", 0.82, "HIGH");
  addMoney(fields, text, "Transactions", /Transactions:\s*([0-9,.]+)/i, "CAPITAL_TRANSACTION_COUNT", 0.78, "LOW");
  addMoney(fields, text, "Disposals", /Disposals:\s*([0-9,.]+)/i, "CRYPTO_DISPOSAL_COUNT", 0.78, "MEDIUM");
  addMoney(fields, text, "Missing cost basis lots", /Missing cost basis lots:\s*([0-9,.]+)/i, "CRYPTO_MISSING_BASIS_LOTS", 0.84, "HIGH");
  addMoney(fields, text, "California workdays before move", /California workdays before move:\s*([0-9,.]+)/i, "STATE_CA_WORKDAYS_BEFORE_MOVE", 0.82, "MEDIUM");
  addMoney(fields, text, "California workdays after move", /California workdays after move:\s*([0-9,.]+)/i, "STATE_CA_WORKDAYS_AFTER_MOVE", 0.82, "MEDIUM");
  addMoney(fields, text, "Oregon workdays", /Oregon workdays:\s*([0-9,.]+)/i, "STATE_OR_WORKDAYS", 0.82, "MEDIUM");
  addMoney(fields, text, "Software subscriptions", /Software subscriptions:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_EXPENSE_SOFTWARE", 0.82, "MEDIUM");
  addMoney(fields, text, "Meals", /Meals:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_EXPENSE_MEALS", 0.78, "MEDIUM");
  addMoney(fields, text, "Contractor payments", /Contractor payments:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_EXPENSE_CONTRACTORS", 0.78, "MEDIUM");
  addMoney(fields, text, "Travel", /Travel:\s*\$?([0-9,.]+)/i, "SCHEDULE_C_EXPENSE_TRAVEL", 0.76, "MEDIUM");
  addMoney(fields, text, "Prior-year Schedule C gross receipts", /Schedule C gross receipts:\s*\$?([0-9,.]+)/i, "PRIOR_YEAR_SCHEDULE_C_GROSS_RECEIPTS", 0.9);

  addBoolean(fields, text, "Business purpose present", /Business purpose present:\s*(true|false|yes|no)/i, "MILEAGE_BUSINESS_PURPOSE_SUPPORT", 0.84, "HIGH");
  addBoolean(fields, text, "Prior-year brokerage account", /Prior-year brokerage account:\s*(true|false|yes|no)/i, "PRIOR_YEAR_BROKERAGE_ACCOUNT", 0.88, "MEDIUM");
  addBoolean(fields, text, "Prior-year Chase 1099-INT", /Prior-year Chase 1099-INT:\s*(true|false|yes|no)/i, "PRIOR_YEAR_CHASE_1099_INT", 0.88, "MEDIUM");
  addBoolean(fields, text, "Student at least half-time", /Student at least half-time:\s*(true|false|yes|no)/i, "STUDENT_HALF_TIME_STATUS", 0.86, "MEDIUM");
  addBoolean(fields, text, "Marketplace coverage", /Marketplace coverage:\s*(true|false|yes|no)/i, "MARKETPLACE_COVERAGE_CLAIM", 0.78, "HIGH");
  addBoolean(fields, text, "Education expenses mentioned", /Education expenses mentioned:\s*(true|false|yes|no)/i, "EDUCATION_EXPENSE_CLAIM", 0.78, "MEDIUM");

  return {
    text,
    fields: fields.length > 0 ? fields : document.fixtureFields,
    documentClass,
    taxYear: classification.taxYear ?? document.taxYear,
  };
}
