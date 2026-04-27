export { getKnowledgeAdmin, runKnowledgeSync } from "@docket/domain";

export const AUTHORITY_RANKING = [
  "IRC_STATUTE",
  "TREASURY_REGULATION",
  "FEDERAL_REGISTER",
  "INTERNAL_REVENUE_BULLETIN",
  "IRS_FORM_INSTRUCTION",
  "IRS_PUBLICATION",
  "IRS_FAQ",
  "STATE_STATUTE",
  "STATE_DOR_GUIDANCE",
  "COURT_CASE",
  "SECONDARY_ANALYSIS",
] as const;

type AuthorityLevel = (typeof AUTHORITY_RANKING)[number];

export type KnowledgeGraphLayer =
  | "TAX_AUTHORITY_GRAPH"
  | "FILING_LOGIC_GRAPH"
  | "PREPARER_RISK_GRAPH"
  | "PRACTITIONER_INTERPRETATION_LAYER"
  | "COMMUNITY_SIGNAL_LAYER";

export type SourceAuthorityRole =
  | "BINDING_AUTHORITY"
  | "OFFICIAL_GUIDANCE"
  | "PROCEDURAL_OR_VALIDATION_SOURCE"
  | "NONPRECEDENTIAL_INTERPRETATION"
  | "ENFORCEMENT_SIGNAL"
  | "CURATED_SECONDARY_ANALYSIS"
  | "COMMUNITY_SIGNAL";

export type DocketKnowledgeSource = {
  id: string;
  priority: number;
  name: string;
  graphLayer: KnowledgeGraphLayer;
  authorityRole: SourceAuthorityRole;
  authorityWeight: number;
  ingestionPriority: "NOW" | "NEXT" | "LATER";
  canSupportTrustedTaxConclusion: boolean;
  requiresHumanReviewBeforeGraphWrite: boolean;
  sourceUrl: string;
  accessPattern: string;
  updateCadence: string;
  scope: string;
  conflictRule: string;
  topicTags: string[];
  notes: string;
};

export const KNOWLEDGE_GRAPH_SOURCE_REGISTRY: DocketKnowledgeSource[] = [
  {
    id: "irc-title-26",
    priority: 1,
    name: "Internal Revenue Code, Title 26",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 100,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: false,
    sourceUrl: "https://uscode.house.gov/browse/prelim@title26",
    accessPattern: "Structured statute ingestion through govinfo / USLM / OLRC mirrors, with section-level nodes.",
    updateCadence: "Monitor continuously; refresh after enacted legislation and official code updates.",
    scope: "Federal statutory tax law.",
    conflictRule: "Controls over all lower authority unless superseded by later statute.",
    topicTags: ["statute", "26 usc", "internal revenue code", "primary authority"],
    notes: "Every substantive federal tax conclusion should eventually trace to statute when practical.",
  },
  {
    id: "treasury-regulations-title-26",
    priority: 2,
    name: "Treasury Regulations, Title 26 CFR",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 96,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: false,
    sourceUrl: "https://www.ecfr.gov/current/title-26",
    accessPattern: "eCFR API/XML ingestion with part, section, effective date, and amendment metadata.",
    updateCadence: "Nightly eCFR monitoring.",
    scope: "Federal regulatory tax law.",
    conflictRule: "Controls over IRS publications, FAQs, forms, and community sources.",
    topicTags: ["regulation", "26 cfr", "ecfr", "treasury regulations"],
    notes: "Use the eCFR API as the preferred current regulation source.",
  },
  {
    id: "federal-register-treasury-decisions",
    priority: 3,
    name: "Federal Register / Treasury Decisions",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 93,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.federalregister.gov/agencies/internal-revenue-service",
    accessPattern: "Federal Register API monitoring for proposed rules, final rules, Treasury Decisions, corrections, and preambles.",
    updateCadence: "Daily monitoring.",
    scope: "Rulemaking changes and regulatory preambles.",
    conflictRule: "Final rules and Treasury Decisions override stale regulation snapshots after approved rule-package update.",
    topicTags: ["federal register", "treasury decision", "final regulation", "proposed regulation"],
    notes: "Research can surface immediately; automated filing logic changes require approved rule packages.",
  },
  {
    id: "internal-revenue-bulletin",
    priority: 4,
    name: "Internal Revenue Bulletin",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "OFFICIAL_GUIDANCE",
    authorityWeight: 90,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/irb",
    accessPattern: "Weekly IRS IRB index/RSS monitoring for Revenue Rulings, Revenue Procedures, Notices, and Announcements.",
    updateCadence: "Weekly, with alerting on new bulletin publication.",
    scope: "Official IRS rulings, procedures, notices, announcements, and selected disciplinary announcements.",
    conflictRule: "Ranks below statute and regulations, above forms, publications, FAQs, and secondary sources.",
    topicTags: ["irb", "revenue ruling", "revenue procedure", "notice", "announcement"],
    notes: "This is the IRS's official weekly publication channel for its published guidance.",
  },
  {
    id: "irs-forms-instructions-publications",
    priority: 5,
    name: "IRS Forms, Instructions, Publications, and Post-Release Changes",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "OFFICIAL_GUIDANCE",
    authorityWeight: 84,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/forms-instructions-and-publications",
    accessPattern: "IRS forms/pubs pages, PDF metadata, XML where available, and post-release change pages.",
    updateCadence: "Daily during filing season; weekly off season.",
    scope: "Practitioner-facing form instructions and IRS explanations.",
    conflictRule: "Operationally strong, but loses to statute, regulations, Federal Register, and IRB where inconsistent.",
    topicTags: ["forms", "instructions", "publication", "post-release changes", "irs"],
    notes: "Critical for preparer workflows, workpapers, client questions, and return workbench explanations.",
  },
  {
    id: "irs-direct-file-openfile-fact-graph",
    priority: 6,
    name: "IRS Direct File / OpenFile Fact Graph",
    graphLayer: "FILING_LOGIC_GRAPH",
    authorityRole: "PROCEDURAL_OR_VALIDATION_SOURCE",
    authorityWeight: 78,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://github.com/IRS-Public/direct-file",
    accessPattern: "Structured XML/form-logic extraction, test-case ingestion, and mapping to Docket rule nodes.",
    updateCadence: "Monitor upstream and trusted forks; validate against current IRS forms and instructions.",
    scope: "Declarative form-level logic and eligibility scaffolding.",
    conflictRule: "Never overrides current statute, regulations, forms, or instructions.",
    topicTags: ["direct file", "openfile", "fact graph", "form logic", "eligibility"],
    notes: "Excellent skeleton for deterministic logic, but not by itself authority for a tax conclusion.",
  },
  {
    id: "irs-mef-schemas-business-rules",
    priority: 7,
    name: "IRS MeF Schemas, Business Rules, and E-file Publications",
    graphLayer: "FILING_LOGIC_GRAPH",
    authorityRole: "PROCEDURAL_OR_VALIDATION_SOURCE",
    authorityWeight: 76,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/e-file-providers/modernized-e-file-mef-schemas-and-business-rules",
    accessPattern: "Schema/business-rule package ingestion for form dependencies, validation rules, and reject conditions.",
    updateCadence: "Per IRS release package.",
    scope: "E-file validation and filing-readiness gates.",
    conflictRule: "Can block workflow readiness, but does not establish substantive tax treatment.",
    topicTags: ["mef", "e-file", "schema", "business rules", "validation"],
    notes: "Use for return export validation and ready-to-file gates, not as legal authority.",
  },
  {
    id: "us-tax-court-opinions",
    priority: 8,
    name: "U.S. Tax Court Opinions",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 74,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.ustaxcourt.gov/opinions.html",
    accessPattern: "Official Tax Court opinions plus CourtListener where useful for search and metadata.",
    updateCadence: "Daily monitoring.",
    scope: "Tax Court regular, memorandum, summary, and bench opinions with precedential labels.",
    conflictRule: "Court hierarchy and precedential status must be preserved; not all opinions bind every case.",
    topicTags: ["tax court", "case law", "substantiation", "penalties", "deductions"],
    notes: "High value for risk scoring, substantiation, penalties, and issue escalation.",
  },
  {
    id: "federal-tax-court-decisions",
    priority: 9,
    name: "Federal Court Tax Decisions",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 72,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.courtlistener.com/",
    accessPattern: "CourtListener/PACER-aware ingestion for Supreme Court, appellate, district, and Court of Federal Claims tax cases.",
    updateCadence: "Daily monitoring for selected tax dockets and opinions.",
    scope: "Federal judicial interpretation outside Tax Court.",
    conflictRule: "Respect jurisdiction, court level, precedential status, and later appellate history.",
    topicTags: ["courtlistener", "federal courts", "tax cases", "precedent"],
    notes: "Important for controversy, refund claims, circuit splits, and high-materiality positions.",
  },
  {
    id: "irs-written-determinations",
    priority: 10,
    name: "IRS Written Determinations",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "NONPRECEDENTIAL_INTERPRETATION",
    authorityWeight: 62,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/privacy-disclosure/about-irs-written-determinations",
    accessPattern: "IRS Written Determinations search ingestion for Chief Counsel Advice, PLRs, TAMs, and similar materials.",
    updateCadence: "Weekly monitoring.",
    scope: "Edge-case IRS analysis and nonprecedential interpretations.",
    conflictRule: "Label as nonprecedential; cannot alone support a trusted tax conclusion.",
    topicTags: ["written determinations", "chief counsel advice", "plr", "tam", "nonprecedential"],
    notes: "Useful for research context, not a substitute for binding authority.",
  },
  {
    id: "state-tax-authorities",
    priority: 11,
    name: "State Tax Authorities",
    graphLayer: "TAX_AUTHORITY_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 70,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: true,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.taxadmin.org/state-tax-agencies",
    accessPattern: "State DOR/source-specific adapters for statutes, regulations, forms, rulings, residency guidance, and notices.",
    updateCadence: "State-dependent; daily for priority states during filing season.",
    scope: "State and local tax authority.",
    conflictRule: "Controls only for matching jurisdiction and tax year.",
    topicTags: ["state tax", "ftb", "dor", "residency", "multi-state"],
    notes: "Prioritize CA, NY, TX, FL, NJ, IL, and customer-driven states.",
  },
  {
    id: "internal-revenue-manual",
    priority: 12,
    name: "Internal Revenue Manual",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "PROCEDURAL_OR_VALIDATION_SOURCE",
    authorityWeight: 55,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/irm",
    accessPattern: "IRM part/section ingestion for IRS procedures, examination workflows, collection processes, and notice handling.",
    updateCadence: "Weekly monitoring.",
    scope: "IRS internal procedures and examination behavior.",
    conflictRule: "Does not bind taxpayers; use for workflow and procedural risk only.",
    topicTags: ["irm", "audit", "exam", "irs procedure", "notices"],
    notes: "Good for explaining what the IRS is likely to do, not what the law requires.",
  },
  {
    id: "circular-230-opr-guidance",
    priority: 13,
    name: "Circular 230 and OPR Guidance",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "BINDING_AUTHORITY",
    authorityWeight: 82,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/tax-professionals/circular-230-tax-professionals",
    accessPattern: "Circular 230 section ingestion plus OPR guidance mapping to Docket review gates and firm policy controls.",
    updateCadence: "Monthly monitoring plus alerting on OPR updates.",
    scope: "Practice-before-the-IRS duties, diligence, competence, conflicts, and sanctions.",
    conflictRule: "Controls Docket professional-control gates, not taxpayer substantive tax treatment.",
    topicTags: ["circular 230", "opr", "diligence", "competence", "ethics"],
    notes: "This is the legal/compliance backbone for AI prepares, humans approve.",
  },
  {
    id: "opr-disciplinary-actions",
    priority: 14,
    name: "IRS OPR Disciplinary Actions",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "ENFORCEMENT_SIGNAL",
    authorityWeight: 68,
    ingestionPriority: "NOW",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/tax-professionals/disciplined-tax-professionals",
    accessPattern: "OPR disciplinary action ingestion with practitioner name, sanction type, misconduct pattern, Circular 230 section, and effective dates.",
    updateCadence: "Weekly monitoring and IRB cross-linking.",
    scope: "Public discipline of practitioners before the IRS.",
    conflictRule: "Never supports tax treatment; only informs compliance and preparer-risk detection.",
    topicTags: ["opr", "disciplinary actions", "suspension", "disbarment", "circular 230"],
    notes: "This is the name-and-shame layer from the Antonio conversation.",
  },
  {
    id: "irs-e-news-tax-professionals",
    priority: 15,
    name: "IRS e-News for Tax Professionals",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "ENFORCEMENT_SIGNAL",
    authorityWeight: 45,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/newsroom/e-news-subscriptions",
    accessPattern: "Email/newsletter monitoring for practitioner alerts, OPR callouts, due-date reminders, fraud alerts, and source-change notifications.",
    updateCadence: "Per newsletter issue.",
    scope: "Practitioner alerts and operational news.",
    conflictRule: "Alert source only; link back to underlying authority before graph writes.",
    topicTags: ["e-news", "tax professionals", "newsletter", "opr alerts"],
    notes: "Useful for monitoring and product alerts, not final knowledge.",
  },
  {
    id: "doj-tax-division-press-releases",
    priority: 16,
    name: "DOJ Tax Division Press Releases",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "ENFORCEMENT_SIGNAL",
    authorityWeight: 58,
    ingestionPriority: "NEXT",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.justice.gov/tax/tax-division-press-releases",
    accessPattern: "Press release ingestion for preparer injunctions, criminal cases, fraud schemes, and enforcement patterns.",
    updateCadence: "Daily monitoring.",
    scope: "Civil and criminal tax enforcement signals.",
    conflictRule: "Use for risk typologies and alerts only; does not establish taxpayer treatment.",
    topicTags: ["doj tax", "press release", "preparer fraud", "injunction", "criminal tax"],
    notes: "Sharp signal for what gets preparers and promoters into serious trouble.",
  },
  {
    id: "irs-criminal-investigation-press-releases",
    priority: 17,
    name: "IRS Criminal Investigation Press Releases",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "ENFORCEMENT_SIGNAL",
    authorityWeight: 54,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/compliance/criminal-investigation/criminal-investigation-press-releases",
    accessPattern: "IRS CI press release monitoring for fraud typologies, abusive credits, ghost preparers, and schemes.",
    updateCadence: "Daily monitoring.",
    scope: "Criminal investigation patterns and enforcement trends.",
    conflictRule: "Use for risk signals only, not tax conclusions.",
    topicTags: ["irs ci", "criminal investigation", "fraud", "ghost preparer"],
    notes: "Useful for Docket risk flags and firm training content.",
  },
  {
    id: "tigta-reports",
    priority: 18,
    name: "TIGTA Reports",
    graphLayer: "PREPARER_RISK_GRAPH",
    authorityRole: "ENFORCEMENT_SIGNAL",
    authorityWeight: 52,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.tigta.gov/reports",
    accessPattern: "TIGTA report ingestion for enforcement priorities, IRS operational failures, fraud patterns, and systemic compliance risk.",
    updateCadence: "Weekly monitoring.",
    scope: "Tax administration oversight and risk trends.",
    conflictRule: "Oversight signal only; link to official law/guidance for tax treatment.",
    topicTags: ["tigta", "oversight", "audit report", "fraud pattern", "enforcement priority"],
    notes: "Often identifies enforcement priorities before they become practitioner-facing product issues.",
  },
  {
    id: "premium-practitioner-research",
    priority: 19,
    name: "Premium Practitioner Research",
    graphLayer: "PRACTITIONER_INTERPRETATION_LAYER",
    authorityRole: "CURATED_SECONDARY_ANALYSIS",
    authorityWeight: 50,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://tax.thomsonreuters.com/en/checkpoint",
    accessPattern: "Licensed API/content partnerships for Checkpoint, Bloomberg Tax, CCH AnswerConnect, and similar research services.",
    updateCadence: "Vendor-dependent.",
    scope: "Editorial tax analysis and research tools.",
    conflictRule: "Never outranks primary authority; cite as secondary analysis only.",
    topicTags: ["checkpoint", "bloomberg tax", "cch", "secondary analysis"],
    notes: "Useful later when revenue supports licensing.",
  },
  {
    id: "affordable-practitioner-sources",
    priority: 20,
    name: "Affordable Practitioner Sources",
    graphLayer: "PRACTITIONER_INTERPRETATION_LAYER",
    authorityRole: "CURATED_SECONDARY_ANALYSIS",
    authorityWeight: 42,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.thetaxbook.com/",
    accessPattern: "Licensed/manual curation from TheTaxBook, Parker Tax, Spidell, NATP, NAEA, and state society materials.",
    updateCadence: "Vendor-dependent; align to annual update cycles and alert products.",
    scope: "Practical preparer interpretation and CE material.",
    conflictRule: "Secondary interpretation only; cite underlying law before trusted conclusions.",
    topicTags: ["thetaxbook", "parker tax", "spidell", "natp", "naea", "ce"],
    notes: "Good for cheap, practical coverage and workflow wording, but not authority.",
  },
  {
    id: "credentialed-community-sources",
    priority: 21,
    name: "Credentialed Community Sources",
    graphLayer: "COMMUNITY_SIGNAL_LAYER",
    authorityRole: "COMMUNITY_SIGNAL",
    authorityWeight: 20,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.taxprotalk.com/",
    accessPattern: "Signal ingestion from TaxProTalk, r/taxpros, NAEA WebBoard, Drake forums, TaxAct Pro community, Spidell/CSEA networks.",
    updateCadence: "Daily/weekly trend monitoring after governance exists.",
    scope: "Practitioner questions, edge cases, product pain points, and emerging confusion.",
    conflictRule: "Cannot write to the authority graph without credentialed human review and official-source backing.",
    topicTags: ["taxprotalk", "reddit taxpros", "naea webboard", "drake forum", "community signal"],
    notes: "Use to discover what preparers are struggling with, not to answer clients.",
  },
  {
    id: "open-social-tax-signals",
    priority: 22,
    name: "Open Social / Tax Twitter",
    graphLayer: "COMMUNITY_SIGNAL_LAYER",
    authorityRole: "COMMUNITY_SIGNAL",
    authorityWeight: 10,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://x.com/search?q=%23TaxTwitter",
    accessPattern: "Loose trend monitoring for Tax Twitter/X, public LinkedIn posts, and other open channels.",
    updateCadence: "Optional trend monitoring.",
    scope: "Fast but noisy practitioner/news signals.",
    conflictRule: "Never authority; only creates candidate research tasks.",
    topicTags: ["tax twitter", "social", "trend", "early warning"],
    notes: "Lowest trust. Useful only as smoke detector for topics that need real authority retrieval.",
  },
] as const;

export function getKnowledgeGraphSourceRegistry(): DocketKnowledgeSource[] {
  return [...KNOWLEDGE_GRAPH_SOURCE_REGISTRY].sort((a, b) => a.priority - b.priority);
}

export function getKnowledgeSourcesByLayer(layer: KnowledgeGraphLayer): DocketKnowledgeSource[] {
  return getKnowledgeGraphSourceRegistry().filter((source) => source.graphLayer === layer);
}

export function getTrustedTaxConclusionSources(): DocketKnowledgeSource[] {
  return getKnowledgeGraphSourceRegistry().filter((source) => source.canSupportTrustedTaxConclusion);
}

export function getPreparerRiskSources(): DocketKnowledgeSource[] {
  return getKnowledgeSourcesByLayer("PREPARER_RISK_GRAPH");
}

export function getCommunitySignalSources(): DocketKnowledgeSource[] {
  return getKnowledgeSourcesByLayer("COMMUNITY_SIGNAL_LAYER");
}

export type OfficialAuthorityDocument = {
  id: string;
  title: string;
  authorityLevel: AuthorityLevel;
  sourceUrl: string;
  jurisdiction: "US";
  publisher: "IRS" | "Federal Register" | "eCFR";
  topicTags: string[];
};

export type RetrievedAuthority = OfficialAuthorityDocument & {
  score: number;
  retrievedAt: string;
  pageLastUpdated: string | null;
  snippets: string[];
  fetchStatus: "LIVE" | "FAILED";
  error: string | null;
};

export type AuthorityResearchResult = {
  query: string;
  retrievedAt: string;
  sources: RetrievedAuthority[];
  answer: {
    headline: string;
    paragraphs: string[];
    reasoningSummary: string[];
    nextSteps: string[];
    caveat: string;
  };
};

const OFFICIAL_AUTHORITY_CATALOG: OfficialAuthorityDocument[] = [
  {
    id: "irs-form-2553",
    title: "About Form 2553, Election by a Small Business Corporation",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-form-2553",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["s corporation", "s corp", "small business corporation", "form 2553", "election"],
  },
  {
    id: "irs-pub-463",
    title: "About Publication 463, Travel, Gift, and Car Expenses",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-463",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["mileage", "travel", "car", "vehicle", "records", "substantiation", "business purpose"],
  },
  {
    id: "irs-pub-587",
    title: "About Publication 587, Business Use of Your Home",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-587",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["home office", "business use of home", "exclusive use", "regular use", "daycare"],
  },
  {
    id: "irs-schedule-c",
    title: "About Schedule C (Form 1040), Profit or Loss from Business",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["schedule c", "gross receipts", "self employment", "business income", "sole proprietor"],
  },
  {
    id: "irs-pub-1345",
    title: "Publication 1345, Handbook for Authorized IRS e-file Providers",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-1345",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["e-file", "efile", "8879", "ero", "signature authorization"],
  },
  {
    id: "irs-circular-230",
    title: "Circular 230, Regulations Governing Practice before the IRS",
    authorityLevel: "TREASURY_REGULATION",
    sourceUrl: "https://www.irs.gov/tax-professionals/circular-230-tax-professionals",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["circular 230", "tax professional", "diligence", "practice before the irs", "ethics"],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function queryTokens(query: string): string[] {
  const stopWords = new Set(["a", "an", "and", "are", "for", "how", "is", "of", "or", "the", "to", "what", "when", "with"]);
  return normalize(query)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function authorityRank(level: AuthorityLevel): number {
  return AUTHORITY_RANKING.indexOf(level);
}

export function rankAuthorityCatalog(query: string, catalog: OfficialAuthorityDocument[] = OFFICIAL_AUTHORITY_CATALOG): OfficialAuthorityDocument[] {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);
  return catalog
    .map((source) => {
      const haystack = normalize(`${source.title} ${source.topicTags.join(" ")}`);
      const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
      const phraseScore = source.topicTags.reduce((score, tag) => score + (normalizedQuery.includes(normalize(tag)) ? 8 : 0), 0);
      return { source, score: tokenScore + phraseScore + (20 - authorityRank(source.authorityLevel)) / 10 };
    })
    .filter((item) => item.score > 1.5)
    .sort((a, b) => b.score - a.score || authorityRank(a.source.authorityLevel) - authorityRank(b.source.authorityLevel))
    .map((item) => item.source);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function pageLastUpdated(text: string): string | null {
  const match = text.match(/Page Last Reviewed or Updated:\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4})/i);
  return match?.[1] ?? null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 60 && sentence.length < 420);
}

function sourceSnippets(text: string, query: string, source: OfficialAuthorityDocument): string[] {
  const tokens = new Set([...queryTokens(query), ...source.topicTags.flatMap((tag) => queryTokens(tag))]);
  const scored = splitSentences(text)
    .map((sentence) => {
      const normalizedSentence = normalize(sentence);
      const score = Array.from(tokens).reduce((sum, token) => sum + (normalizedSentence.includes(token) ? 1 : 0), 0);
      return { sentence, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.sentence);

  if (scored.length > 0) return scored;
  const titlePrefix = source.title.split(",")[0] ?? source.title;
  const fallback = splitSentences(text).find((sentence) => sentence.includes(titlePrefix));
  return fallback ? [fallback] : [`Retrieved ${source.title} from ${source.publisher}; no concise matching snippet was extracted.`];
}

async function fetchOfficialSource(source: OfficialAuthorityDocument, query: string, retrievedAt: string): Promise<RetrievedAuthority> {
  try {
    const response = await fetch(source.sourceUrl, {
      cache: "no-store",
      headers: { "user-agent": "DocketTaxIntelligence/0.1 (+local foundation build)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = htmlToText(await response.text());
    return {
      ...source,
      score: rankAuthorityCatalog(query, [source]).length > 0 ? 1 : 0,
      retrievedAt,
      pageLastUpdated: pageLastUpdated(text),
      snippets: sourceSnippets(text, query, source),
      fetchStatus: "LIVE",
      error: null,
    };
  } catch (error) {
    return {
      ...source,
      score: 0,
      retrievedAt,
      pageLastUpdated: null,
      snippets: [],
      fetchStatus: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function answerFromAuthorities(query: string, sources: RetrievedAuthority[]): AuthorityResearchResult["answer"] {
  const liveSources = sources.filter((source) => source.fetchStatus === "LIVE");
  const primary = liveSources[0] ?? null;
  const sourceList = liveSources.map((source) => `${source.title} (${source.authorityLevel.replaceAll("_", " ")})`).join("; ");

  return {
    headline: primary ? `Retrieved ${liveSources.length} current official source${liveSources.length === 1 ? "" : "s"} for this tax question.` : "No official source could be retrieved.",
    paragraphs:
      liveSources.length > 0
        ? [
            `Docket retrieved official authority for: "${query}". The strongest retrieved source is ${primary?.title ?? "the first live source"}.`,
            `Relevant retrieved sources: ${sourceList}. The answer should be treated as research support until a professional reviews the authority and applies it to client facts.`,
            `Key extracted support: ${liveSources.flatMap((source) => source.snippets).slice(0, 2).join(" ")}`,
          ]
        : [
            "Docket could not retrieve official authority for this query during this run.",
            "A trusted tax conclusion should remain blocked until official authority is available and reviewed.",
          ],
    reasoningSummary: [
      "Retrieved current official-source pages at request time instead of using model memory.",
      "Ranked candidate sources by topic match and authority level.",
      "Extracted snippets from retrieved source text and preserved source URL, publisher, authority level, retrieval time, and page update metadata.",
    ],
    nextSteps:
      liveSources.length > 0
        ? [
            "Review the cited official source pages and any linked form instructions or PDFs.",
            "Apply the authority to the taxpayer type, tax year, jurisdiction, and facts.",
            "Escalate unsupported or judgment-heavy positions for reviewer approval before client-facing advice.",
          ]
        : ["Retry retrieval, broaden the query, or add a new official source adapter for this topic."],
    caveat: "This is not final client-facing tax advice. Docket still requires professional review before relying on the conclusion.",
  };
}

export async function retrieveOfficialAuthority(query: string): Promise<AuthorityResearchResult> {
  const retrievedAt = new Date().toISOString();
  const ranked = rankAuthorityCatalog(query).slice(0, 4);
  const candidates = ranked.length > 0 ? ranked : OFFICIAL_AUTHORITY_CATALOG.slice(0, 3);
  const sources = await Promise.all(candidates.map((source) => fetchOfficialSource(source, query, retrievedAt)));
  const sortedSources = sources.sort(
    (a, b) =>
      (b.fetchStatus === "LIVE" ? 1 : 0) - (a.fetchStatus === "LIVE" ? 1 : 0) ||
      authorityRank(a.authorityLevel) - authorityRank(b.authorityLevel),
  );

  return {
    query,
    retrievedAt,
    sources: sortedSources,
    answer: answerFromAuthorities(query, sortedSources),
  };
}
