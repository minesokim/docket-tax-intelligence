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
  | "COMMUNITY_SIGNAL_LAYER"
  | "TAX_ADMIN_ANALYTICS_LAYER";

export type SourceAuthorityRole =
  | "BINDING_AUTHORITY"
  | "OFFICIAL_GUIDANCE"
  | "PROCEDURAL_OR_VALIDATION_SOURCE"
  | "NONPRECEDENTIAL_INTERPRETATION"
  | "ENFORCEMENT_SIGNAL"
  | "CURATED_SECONDARY_ANALYSIS"
  | "COMMUNITY_SIGNAL";

export type DocketKnowledgeSubSource = {
  id: string;
  name: string;
  sourceUrl: string;
  notes: string;
};

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
  includedSources?: DocketKnowledgeSubSource[];
};

export type DocketKnowledgeSourceTier = {
  tier: number;
  title: string;
  description: string;
  sourceIds: string[];
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
    includedSources: [
      {
        id: "law-gov-structured-law",
        name: "law.gov structured law access",
        sourceUrl: "https://www.law.gov/",
        notes: "Structured-law access layer from the project memory; validate current coverage before production ingestion.",
      },
      {
        id: "olrc-us-code-title-26",
        name: "Office of the Law Revision Counsel / U.S. Code Title 26",
        sourceUrl: "https://uscode.house.gov/browse/prelim@title26",
        notes: "Official U.S. Code access point for Title 26 section-level statutory nodes.",
      },
      {
        id: "govinfo-us-code",
        name: "govinfo U.S. Code packages/API",
        sourceUrl: "https://www.govinfo.gov/app/collection/uscode",
        notes: "Structured government publishing source for U.S. Code packages and metadata.",
      },
      {
        id: "cornell-lii-title-26",
        name: "Cornell Legal Information Institute Title 26 mirror",
        sourceUrl: "https://www.law.cornell.edu/uscode/text/26",
        notes: "Useful access/search layer; Docket should still preserve official statute citation identity.",
      },
    ],
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
    includedSources: [
      {
        id: "ecfr-title-26",
        name: "eCFR Title 26",
        sourceUrl: "https://www.ecfr.gov/current/title-26",
        notes: "Preferred current regulation source for title, part, section, and amendment metadata.",
      },
      {
        id: "ecfr-api",
        name: "eCFR API",
        sourceUrl: "https://www.ecfr.gov/developers/documentation/api/v1",
        notes: "Machine-ingestion path for current and historical regulation text.",
      },
    ],
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
    includedSources: [
      {
        id: "federal-register-irs-agency",
        name: "Federal Register IRS agency documents",
        sourceUrl: "https://www.federalregister.gov/agencies/internal-revenue-service",
        notes: "Agency-filtered rulemaking, notices, corrections, and Treasury Decision monitoring.",
      },
      {
        id: "federal-register-api",
        name: "Federal Register API",
        sourceUrl: "https://www.federalregister.gov/developers/documentation/api/v1",
        notes: "Machine-ingestion path for Federal Register deltas and metadata.",
      },
    ],
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
    includedSources: [
      {
        id: "irs-irb",
        name: "IRS Internal Revenue Bulletin",
        sourceUrl: "https://www.irs.gov/irb",
        notes: "Primary IRS channel for published guidance such as Revenue Rulings, Revenue Procedures, Notices, and Announcements.",
      },
      {
        id: "irs-irb-rss",
        name: "IRS IRB RSS feeds",
        sourceUrl: "https://www.irs.gov/newsroom/irs-newswire",
        notes: "Monitoring path for official IRS publication updates; link each alert to the underlying IRB item.",
      },
      {
        id: "irs-revenue-rulings",
        name: "Revenue Rulings",
        sourceUrl: "https://www.irs.gov/irb",
        notes: "Official IRS interpretations of tax law applied to stated facts.",
      },
      {
        id: "irs-revenue-procedures",
        name: "Revenue Procedures",
        sourceUrl: "https://www.irs.gov/irb",
        notes: "Official IRS procedural guidance and safe-harbor workflows.",
      },
      {
        id: "irs-notices-announcements",
        name: "IRS Notices and Announcements",
        sourceUrl: "https://www.irs.gov/irb",
        notes: "Official IRS updates, relief, transitional guidance, and announcements.",
      },
    ],
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
    includedSources: [
      {
        id: "irs-forms-pubs",
        name: "IRS Forms, Instructions, and Publications",
        sourceUrl: "https://www.irs.gov/forms-instructions-and-publications",
        notes: "Central IRS entry point for current and prior-year forms, instructions, and publications.",
      },
      {
        id: "irs-post-release-changes",
        name: "IRS Post-Release Changes to Forms",
        sourceUrl: "https://www.irs.gov/forms-pubs/changes-to-current-forms-publications",
        notes: "Critical freshness source for changed forms, instructions, and publications after release.",
      },
      {
        id: "irs-pub-17",
        name: "Publication 17",
        sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-17",
        notes: "Broad individual income tax guide, useful for 1040-facing research and client explanations.",
      },
      {
        id: "irs-pub-535",
        name: "Publication 535",
        sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-535",
        notes: "Business expense reference source for Schedule C and business deduction workflows.",
      },
      {
        id: "irs-pub-463",
        name: "Publication 463",
        sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-463",
        notes: "Travel, gift, car expenses, mileage, and substantiation source.",
      },
      {
        id: "irs-pub-946",
        name: "Publication 946",
        sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-946",
        notes: "Depreciation reference source.",
      },
      {
        id: "irs-schedule-c-instructions",
        name: "Schedule C Instructions",
        sourceUrl: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
        notes: "Operational source for sole proprietor income and expense reporting.",
      },
    ],
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
    includedSources: [
      {
        id: "irs-public-direct-file",
        name: "IRS-Public/direct-file",
        sourceUrl: "https://github.com/IRS-Public/direct-file",
        notes: "Official IRS Direct File repository when available; use as structured historical logic source.",
      },
      {
        id: "openfiletax-openfile",
        name: "openfiletax/openfile",
        sourceUrl: "https://github.com/openfiletax/openfile",
        notes: "Community mirror/fork path mentioned in the convo; validate all logic against current IRS authority.",
      },
    ],
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
    includedSources: [
      {
        id: "us-tax-court-opinions-official",
        name: "U.S. Tax Court Opinions",
        sourceUrl: "https://www.ustaxcourt.gov/opinions.html",
        notes: "Official opinions source.",
      },
      {
        id: "us-tax-court-ef-cms",
        name: "U.S. Tax Court EF-CMS repository",
        sourceUrl: "https://github.com/ustaxcourt/ef-cms",
        notes: "Open-source case-management patterns, useful architecturally but not tax-law authority.",
      },
    ],
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
    includedSources: [
      {
        id: "courtlistener",
        name: "CourtListener",
        sourceUrl: "https://www.courtlistener.com/",
        notes: "Practical search/API layer for federal opinions and dockets.",
      },
      {
        id: "pacer",
        name: "PACER",
        sourceUrl: "https://pacer.uscourts.gov/",
        notes: "Official federal court record access where needed.",
      },
      {
        id: "court-of-federal-claims",
        name: "U.S. Court of Federal Claims",
        sourceUrl: "https://www.uscfc.uscourts.gov/",
        notes: "Important refund litigation and federal claims tax source.",
      },
      {
        id: "district-courts-tax",
        name: "Federal District Court tax decisions",
        sourceUrl: "https://www.uscourts.gov/about-federal-courts/court-role-and-structure",
        notes: "Jurisdiction-sensitive tax cases outside Tax Court.",
      },
      {
        id: "circuit-courts-tax",
        name: "Federal Circuit Court tax decisions",
        sourceUrl: "https://www.uscourts.gov/about-federal-courts/court-role-and-structure",
        notes: "Appellate authority and circuit split tracking.",
      },
    ],
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
    includedSources: [
      {
        id: "chief-counsel-advice",
        name: "Chief Counsel Advice",
        sourceUrl: "https://www.irs.gov/privacy-disclosure/about-irs-written-determinations",
        notes: "Nonprecedential IRS legal analysis; useful for edge-case research.",
      },
      {
        id: "private-letter-rulings",
        name: "Private Letter Rulings",
        sourceUrl: "https://www.irs.gov/privacy-disclosure/about-irs-written-determinations",
        notes: "Nonprecedential taxpayer-specific rulings.",
      },
      {
        id: "technical-advice-memoranda",
        name: "Technical Advice Memoranda",
        sourceUrl: "https://www.irs.gov/privacy-disclosure/about-irs-written-determinations",
        notes: "Nonprecedential technical advice in specific factual contexts.",
      },
    ],
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
    includedSources: [
      {
        id: "california-ftb",
        name: "California Franchise Tax Board",
        sourceUrl: "https://www.ftb.ca.gov/",
        notes: "Priority state source for California residency, filing, and state tax guidance.",
      },
      {
        id: "new-york-dtf",
        name: "New York Department of Taxation and Finance",
        sourceUrl: "https://www.tax.ny.gov/",
        notes: "Priority state source for New York tax guidance.",
      },
      {
        id: "state-dor-guidance",
        name: "State DOR guidance",
        sourceUrl: "https://www.taxadmin.org/state-tax-agencies",
        notes: "State-by-state DOR/statutory/regulatory adapters.",
      },
    ],
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
    includedSources: [
      {
        id: "circular-230",
        name: "Circular 230",
        sourceUrl: "https://www.irs.gov/tax-professionals/circular-230-tax-professionals",
        notes: "Practice-before-the-IRS duties and sanctions source.",
      },
      {
        id: "irs-office-professional-responsibility",
        name: "IRS Office of Professional Responsibility",
        sourceUrl: "https://www.irs.gov/tax-professionals/office-of-professional-responsibility",
        notes: "OPR guidance, compliance expectations, and disciplinary context.",
      },
    ],
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
    includedSources: [
      {
        id: "disciplined-tax-professionals",
        name: "Disciplined Tax Professionals",
        sourceUrl: "https://www.irs.gov/tax-professionals/disciplined-tax-professionals",
        notes: "Public IRS list of disciplined practitioners.",
      },
      {
        id: "opr-final-agency-decisions",
        name: "OPR Final Agency Decisions",
        sourceUrl: "https://www.irs.gov/tax-professionals/office-of-professional-responsibility",
        notes: "Public discipline decisions to map conduct patterns to Circular 230 duties.",
      },
    ],
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
    priority: 22,
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
    includedSources: [
      {
        id: "thomson-reuters-checkpoint",
        name: "Thomson Reuters Checkpoint",
        sourceUrl: "https://tax.thomsonreuters.com/en/checkpoint",
        notes: "Premium licensed practitioner research.",
      },
      {
        id: "bloomberg-tax",
        name: "Bloomberg Tax",
        sourceUrl: "https://pro.bloombergtax.com/",
        notes: "Premium licensed practitioner research.",
      },
      {
        id: "cch-answerconnect",
        name: "CCH AnswerConnect",
        sourceUrl: "https://www.wolterskluwer.com/en/solutions/answerconnect",
        notes: "Premium licensed practitioner research from Wolters Kluwer.",
      },
    ],
  },
  {
    id: "irs-soi-public-use-statistics",
    priority: 23,
    name: "IRS Statistics of Income / Public-Use Data",
    graphLayer: "TAX_ADMIN_ANALYTICS_LAYER",
    authorityRole: "PROCEDURAL_OR_VALIDATION_SOURCE",
    authorityWeight: 28,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/statistics/soi-tax-stats-individual-public-use-microdata-files",
    accessPattern: "Dataset and aggregate-statistics ingestion for benchmarking, anomaly priors, market sizing, and taxpayer-behavior modeling.",
    updateCadence: "Annual/periodic dataset monitoring.",
    scope: "Public-use microdata, SOI statistical tables, and aggregate IRS statistics.",
    conflictRule: "Never legal authority; may support analytics and prioritization only.",
    topicTags: ["statistics of income", "soi", "public use microdata", "tax statistics", "analytics", "benchmarking"],
    notes: "Useful for analytics and model priors, not for tax-law conclusions or client-specific legal advice.",
  },
  {
    id: "irs-foia-library-admin-materials",
    priority: 24,
    name: "IRS FOIA Library / Administrative Materials",
    graphLayer: "TAX_ADMIN_ANALYTICS_LAYER",
    authorityRole: "PROCEDURAL_OR_VALIDATION_SOURCE",
    authorityWeight: 24,
    ingestionPriority: "LATER",
    canSupportTrustedTaxConclusion: false,
    requiresHumanReviewBeforeGraphWrite: true,
    sourceUrl: "https://www.irs.gov/privacy-disclosure/foia-library",
    accessPattern: "FOIA library monitoring for administrative manuals, training materials, frequently requested records, and operational context.",
    updateCadence: "Quarterly monitoring unless a specific enforcement/research topic is active.",
    scope: "Supplemental IRS administrative context and records, not substantive tax authority.",
    conflictRule: "Never outranks statute, regulations, IRB guidance, forms, instructions, or publications.",
    topicTags: ["foia", "foia library", "administrative manuals", "training materials", "frequently requested records", "operational context"],
    notes: "Useful supplemental corpus for IRS operations, enforcement context, and due-diligence research trails.",
  },
  {
    id: "affordable-practitioner-sources",
    priority: 19,
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
    includedSources: [
      {
        id: "the-tax-book",
        name: "TheTaxBook",
        sourceUrl: "https://www.thetaxbook.com/",
        notes: "Affordable practitioner reference used by many small firms.",
      },
      {
        id: "parker-tax-publishing",
        name: "Parker Tax Publishing",
        sourceUrl: "https://www.parkertaxpublishing.com/",
        notes: "Affordable practitioner research/news source.",
      },
      {
        id: "spidell-publishing",
        name: "Spidell Publishing",
        sourceUrl: "https://www.caltax.com/",
        notes: "Strong California practitioner source.",
      },
      {
        id: "natp",
        name: "National Association of Tax Professionals",
        sourceUrl: "https://www.natptax.com/",
        notes: "Vetted practitioner education and publications.",
      },
      {
        id: "naea",
        name: "National Association of Enrolled Agents",
        sourceUrl: "https://www.naea.org/",
        notes: "EA-focused publications and education.",
      },
    ],
  },
  {
    id: "credentialed-community-sources",
    priority: 20,
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
    includedSources: [
      {
        id: "taxprotalk",
        name: "TaxProTalk",
        sourceUrl: "https://www.taxprotalk.com/",
        notes: "Solo and small-firm practitioner discussion signal.",
      },
      {
        id: "reddit-taxpros",
        name: "r/taxpros",
        sourceUrl: "https://www.reddit.com/r/taxpros/",
        notes: "Practitioner community signal; only use with credential/context awareness.",
      },
      {
        id: "naea-webboard",
        name: "NAEA WebBoard",
        sourceUrl: "https://www.naea.org/",
        notes: "Members-only EA discussion signal if licensed/access is available.",
      },
      {
        id: "drake-software-forum",
        name: "Drake Software Forum",
        sourceUrl: "https://forum.drakesoftware.com/",
        notes: "Software-specific working preparer signal.",
      },
      {
        id: "taxact-pro-community",
        name: "TaxAct Pro Community",
        sourceUrl: "https://www.taxact.com/professional",
        notes: "Software-specific working preparer signal.",
      },
      {
        id: "csea-chapter-networks",
        name: "CSEA chapter Slack/email lists",
        sourceUrl: "https://www.csea.org/",
        notes: "California EA network signal if Antonio or another advisor can bridge access.",
      },
    ],
  },
  {
    id: "open-social-tax-signals",
    priority: 21,
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
    includedSources: [
      {
        id: "tax-twitter",
        name: "TaxTwitter / X #TaxTwitter",
        sourceUrl: "https://x.com/search?q=%23TaxTwitter",
        notes: "Fast, noisy public practitioner signal.",
      },
      {
        id: "ea-tax-twitter",
        name: "TaxTwitter / X #EATax",
        sourceUrl: "https://x.com/search?q=%23EATax",
        notes: "EA-focused public practitioner signal.",
      },
    ],
  },
] as const;

export const KNOWLEDGE_SOURCE_TIERS: DocketKnowledgeSourceTier[] = [
  {
    tier: 1,
    title: "Primary authoritative ground truth",
    description: "Must-have sources with the highest graph weight. If anything conflicts, these win.",
    sourceIds: [
      "irc-title-26",
      "treasury-regulations-title-26",
      "irs-direct-file-openfile-fact-graph",
      "internal-revenue-bulletin",
      "irs-forms-instructions-publications",
    ],
  },
  {
    tier: 2,
    title: "Authoritative interpretation",
    description: "Court, IRS written-determination, and state authority layers used to interpret and apply primary authority.",
    sourceIds: [
      "us-tax-court-opinions",
      "federal-tax-court-decisions",
      "irs-written-determinations",
      "state-tax-authorities",
    ],
  },
  {
    tier: 3,
    title: "Practitioner risk and enforcement",
    description: "The Antonio/OPR name-and-shame layer. This powers compliance risk, not substantive tax-law conclusions.",
    sourceIds: [
      "opr-disciplinary-actions",
      "irs-e-news-tax-professionals",
      "doj-tax-division-press-releases",
      "tigta-reports",
    ],
  },
  {
    tier: 4,
    title: "Curated practitioner sources",
    description: "Lower-cost, structured practitioner references and credentialed CE sources. Useful, but secondary.",
    sourceIds: ["affordable-practitioner-sources"],
  },
  {
    tier: 5,
    title: "Community signal",
    description: "Input signals only. These identify emerging questions and edge cases for human review before graph writes.",
    sourceIds: ["credentialed-community-sources", "open-social-tax-signals"],
  },
  {
    tier: 6,
    title: "Premium licensed",
    description: "Premium editorial research systems to license later when revenue supports it.",
    sourceIds: ["premium-practitioner-research"],
  },
  {
    tier: 7,
    title: "Analytics and administrative context",
    description: "IRS statistics, public-use data, and FOIA/admin materials for analytics and operational context. These do not support legal conclusions.",
    sourceIds: ["irs-soi-public-use-statistics", "irs-foia-library-admin-materials"],
  },
];

export function getKnowledgeGraphSourceRegistry(): DocketKnowledgeSource[] {
  return [...KNOWLEDGE_GRAPH_SOURCE_REGISTRY].sort((a, b) => a.priority - b.priority);
}

export function getTieredKnowledgeSourceRegistry(): Array<DocketKnowledgeSourceTier & { sources: DocketKnowledgeSource[] }> {
  const sourceById = new Map(getKnowledgeGraphSourceRegistry().map((source) => [source.id, source]));

  return KNOWLEDGE_SOURCE_TIERS.map((tier) => ({
    ...tier,
    sources: tier.sourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? [source] : [];
    }),
  }));
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
  publisher: "Congress.gov" | "GovInfo" | "IRS" | "Federal Register" | "eCFR";
  topicTags: string[];
  sourceDate?: string | null;
  discoveredBy?: "catalog" | "irs-sitemap" | "federal-register-api";
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
    id: "congress-pl119-21-obbba",
    title: "Public Law 119-21, One Big Beautiful Bill Act text",
    authorityLevel: "IRC_STATUTE",
    sourceUrl: "https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm",
    jurisdiction: "US",
    publisher: "GovInfo",
    topicTags: ["obbba", "ob3", "one big beautiful bill", "one big beautiful bill act", "public law 119-21", "hr 1", "h.r. 1", "tax law changes", "tcja", "2025 tax changes"],
  },
  {
    id: "irs-obbba-provisions",
    title: "One, Big, Beautiful Bill provisions",
    authorityLevel: "IRS_FAQ",
    sourceUrl: "https://www.irs.gov/newsroom/one-big-beautiful-bill-act-of-2025-provisions",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["obbba", "one big beautiful bill", "public law 119-21", "irs implementation", "tax provisions", "2025 tax changes", "guidance", "notice", "revenue procedure"],
  },
  {
    id: "irs-obbba-individuals-workers",
    title: "One, Big, Beautiful Bill provisions - Individuals and workers",
    authorityLevel: "IRS_FAQ",
    sourceUrl: "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions-individuals-and-workers",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["obbba", "one big beautiful bill", "individuals", "workers", "tips", "overtime", "senior deduction", "auto loan interest", "2025 tax changes"],
  },
  {
    id: "irs-obbba-working-seniors-deductions",
    title: "One, Big, Beautiful Bill Act: Tax deductions for working Americans and seniors",
    authorityLevel: "IRS_FAQ",
    sourceUrl: "https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["obbba", "one big beautiful bill", "tips", "overtime", "senior deduction", "working americans", "2025 tax deductions", "transition relief"],
  },
  {
    id: "irs-obbba-no-2025-information-return-changes",
    title: "IRS announces no changes to 2025 individual information returns or withholding tables under OBBBA",
    authorityLevel: "IRS_FAQ",
    sourceUrl: "https://www.irs.gov/newsroom/irs-announces-no-changes-to-individual-information-returns-or-withholding-tables-for-2025-under-the-one-big-beautiful-bill-act",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["obbba", "one big beautiful bill", "2025 information returns", "withholding tables", "w-2", "1099", "reporting", "transition relief"],
  },
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
    id: "irs-schedule-e",
    title: "About Schedule E (Form 1040), Supplemental Income and Loss",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-schedule-e-form-1040",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["schedule e", "rental", "partnership", "s corporation", "k-1", "pass through", "supplemental income"],
  },
  {
    id: "irs-pub-334",
    title: "Publication 334, Tax Guide for Small Business",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-334",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["small business", "schedule c", "self employment", "business income", "business expense"],
  },
  {
    id: "irs-pub-535",
    title: "Publication 535, Business Expenses",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-535",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["business expenses", "deductions", "ordinary and necessary", "schedule c"],
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
    id: "irs-pub-17",
    title: "Publication 17, Your Federal Income Tax",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-17",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["1040", "individual income tax", "filing status", "dependents", "education credit", "retirement income", "1099-r"],
  },
  {
    id: "irs-pub-550",
    title: "Publication 550, Investment Income and Expenses",
    authorityLevel: "IRS_PUBLICATION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-publication-550",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["investment income", "1099-b", "brokerage", "capital gains", "schedule d", "form 8949", "wash sale"],
  },
  {
    id: "irs-form-8949",
    title: "About Form 8949, Sales and Other Dispositions of Capital Assets",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-form-8949",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["form 8949", "capital assets", "capital gains", "stock sale", "1099-b", "basis"],
  },
  {
    id: "irs-form-1095a",
    title: "About Form 1095-A, Health Insurance Marketplace Statement",
    authorityLevel: "IRS_FORM_INSTRUCTION",
    sourceUrl: "https://www.irs.gov/forms-pubs/about-form-1095-a",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["1095-a", "marketplace", "premium tax credit", "aca", "health insurance"],
  },
  {
    id: "irs-digital-assets",
    title: "Digital assets",
    authorityLevel: "IRS_FAQ",
    sourceUrl: "https://www.irs.gov/filing/digital-assets",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["digital assets", "crypto", "cryptocurrency", "virtual currency", "1099-da", "form 8949"],
  },
  {
    id: "ecfr-title-26",
    title: "eCFR Title 26, Internal Revenue",
    authorityLevel: "TREASURY_REGULATION",
    sourceUrl: "https://www.ecfr.gov/current/title-26",
    jurisdiction: "US",
    publisher: "eCFR",
    topicTags: ["treasury regulations", "26 cfr", "regulations", "internal revenue"],
  },
  {
    id: "federal-register-irs",
    title: "Federal Register IRS agency documents",
    authorityLevel: "FEDERAL_REGISTER",
    sourceUrl: "https://www.federalregister.gov/agencies/internal-revenue-service",
    jurisdiction: "US",
    publisher: "Federal Register",
    topicTags: ["federal register", "treasury decision", "proposed regulations", "final regulations", "irs rulemaking"],
  },
  {
    id: "irs-irb",
    title: "Internal Revenue Bulletin",
    authorityLevel: "INTERNAL_REVENUE_BULLETIN",
    sourceUrl: "https://www.irs.gov/irb",
    jurisdiction: "US",
    publisher: "IRS",
    topicTags: ["internal revenue bulletin", "revenue ruling", "revenue procedure", "notice", "announcement"],
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
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "about",
    "affect",
    "affected",
    "affecting",
    "affects",
    "can",
    "client",
    "clients",
    "does",
    "for",
    "from",
    "hello",
    "hi",
    "how",
    "impact",
    "impacts",
    "is",
    "know",
    "me",
    "my",
    "of",
    "or",
    "preparer",
    "preparers",
    "should",
    "tell",
    "the",
    "this",
    "to",
    "under",
    "what",
    "when",
    "will",
    "with",
    "your",
  ]);
  return normalize(query)
    .split(" ")
    .map((token) => {
      if (/^ob{2,6}a$/.test(token)) return "obbba";
      if (token.startsWith("substantiat")) return "substantiat";
      return token;
    })
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function authorityRank(level: AuthorityLevel): number {
  return AUTHORITY_RANKING.indexOf(level);
}

function authoritySearchScore(query: string, source: OfficialAuthorityDocument): { score: number; relevanceScore: number } {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);
  const haystack = normalize(`${source.title} ${source.topicTags.join(" ")}`);
  const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? (/\d/.test(token) ? 5 : 2) : 0), 0);
  const phraseScore = source.topicTags.reduce((score, tag) => {
    const normalizedTag = normalize(tag);
    const isSpecificPhrase = normalizedTag.includes(" ") || /\d/.test(normalizedTag);
    return score + (isSpecificPhrase && normalizedQuery.includes(normalizedTag) ? 8 : 0);
  }, 0);
  const exactTitleScore = normalize(source.title)
    .split(" ")
    .some((titleToken) => tokens.includes(titleToken))
    ? 1.5
    : 0;
  const urlScore = tokens.reduce((score, token) => score + (normalize(source.sourceUrl).includes(token) ? 1 : 0), 0);
  const relevanceScore = tokenScore + phraseScore + exactTitleScore + urlScore;
  return { score: relevanceScore + (20 - authorityRank(source.authorityLevel)) / 10, relevanceScore };
}

export function rankAuthorityCatalog(query: string, catalog: OfficialAuthorityDocument[] = OFFICIAL_AUTHORITY_CATALOG): OfficialAuthorityDocument[] {
  const normalizedQuery = normalize(query);
  const focusedCatalog =
    /ob{2,6}a|ob3|one big beautiful|beautiful bill|public law 119-21|hr 1|h r 1|tax law change|new tax law/.test(normalizedQuery)
      ? catalog.filter((source) => /ob{2,6}a|ob3|one big beautiful|public law 119-21|hr 1|h r 1|tcja|2025 tax changes|irs implementation/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
      : /mileage|vehicle|car|travel|substantiat/.test(normalizedQuery)
      ? catalog.filter((source) => /mileage|vehicle|\bcar\b|travel|substantiation|business purpose/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
      : /s corp|s corporation|2553|small business corporation|election/.test(normalizedQuery)
        ? catalog.filter((source) => /s corp|s corporation|2553|small business corporation|election/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
        : /home office|business use of home|exclusive/.test(normalizedQuery)
          ? catalog.filter((source) => /home office|business use of home|exclusive|regular use/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
          : /1099-b|1099b|stock|broker|capital|8949|schedule d|wash sale/.test(normalizedQuery)
            ? catalog.filter((source) => /1099-b|1099b|stock|broker|capital|8949|schedule d|wash sale|investment/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
            : /crypto|digital asset|virtual currency|1099-da/.test(normalizedQuery)
              ? catalog.filter((source) => /crypto|digital asset|virtual currency|1099-da|8949/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
              : /1095-a|1095a|marketplace|premium tax credit|aca/.test(normalizedQuery)
                ? catalog.filter((source) => /1095-a|1095a|marketplace|premium tax credit|aca/.test(normalize(`${source.title} ${source.topicTags.join(" ")}`)))
                : catalog;
  const pool = focusedCatalog.length > 0 ? focusedCatalog : catalog;
  return pool
    .map((source) => {
      const scored = authoritySearchScore(query, source);
      return { source, score: scored.score, relevanceScore: scored.relevanceScore };
    })
    .filter((item) => item.relevanceScore > 0.5)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 2) return scoreDiff;
      return authorityRank(a.source.authorityLevel) - authorityRank(b.source.authorityLevel) || scoreDiff;
    })
    .map((item) => item.source);
}

type IrsSitemapEntry = {
  url: string;
  lastmod: string | null;
};

let irsSitemapCache: { loadedAt: number; entries: IrsSitemapEntry[] } | null = null;

function sourceId(prefix: string, value: string): string {
  return `${prefix}-${normalize(value).replace(/\s+/g, "-").slice(0, 90)}`;
}

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const slug = parsed.pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return slug || parsed.hostname;
}

function authorityFromIrsUrl(url: string, title: string): AuthorityLevel {
  const normalizedUrl = normalize(url);
  const normalizedTitle = normalize(title);
  if (normalizedUrl.includes("/irb/") || normalizedUrl.includes("/pub/irs-irbs/")) return "INTERNAL_REVENUE_BULLETIN";
  if (normalizedUrl.includes("revenue-procedure") || normalizedTitle.includes("revenue procedure")) return "INTERNAL_REVENUE_BULLETIN";
  if (normalizedUrl.includes("revenue-ruling") || normalizedTitle.includes("revenue ruling")) return "INTERNAL_REVENUE_BULLETIN";
  if (normalizedUrl.includes("/forms-pubs/about-form") || normalizedUrl.includes("/forms-pubs/about-schedule")) return "IRS_FORM_INSTRUCTION";
  if (normalizedUrl.includes("/forms-pubs/about-publication") || normalizedUrl.includes("/pub/irs-pdf/p")) return "IRS_PUBLICATION";
  if (normalizedUrl.includes("/newsroom/")) return "IRS_FAQ";
  if (normalizedUrl.includes("/tax-professionals/circular-230")) return "TREASURY_REGULATION";
  if (normalizedUrl.includes("/instructions/") || normalizedTitle.includes("instructions")) return "IRS_FORM_INSTRUCTION";
  return "IRS_FAQ";
}

function topicTagsForDiscovery(_query: string, title: string, url: string): string[] {
  const raw = [...queryTokens(title), ...queryTokens(new URL(url).pathname.replaceAll("/", " "))];
  return Array.from(new Set(raw)).slice(0, 16);
}

function isUsefulIrsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.irs.gov") return false;
    const path = parsed.pathname.toLowerCase();
    if (path === "/" || path.includes("/404") || path.includes("/search") || path.includes("/help/let-us-help-you")) return false;
    if (path.includes("/es/") || path.includes("/zh-") || path.includes("/ko/") || path.includes("/ru/") || path.includes("/vi/") || path.includes("/ht/")) return false;
    return (
      path.includes("/forms-pubs/") ||
      path.includes("/newsroom/") ||
      path.includes("/irb/") ||
      path.includes("/tax-professionals/") ||
      path.includes("/businesses/") ||
      path.includes("/individuals/") ||
      path.includes("/filing/") ||
      path.includes("/credits-deductions/") ||
      path.includes("/retirement-plans/") ||
      path.includes("/pub/irs-pdf/") ||
      path.includes("/pub/irs-irbs/")
    );
  } catch {
    return false;
  }
}

function dedupeAuthoritySources(sources: OfficialAuthorityDocument[]): OfficialAuthorityDocument[] {
  const seen = new Set<string>();
  const deduped: OfficialAuthorityDocument[] = [];
  for (const source of sources) {
    const key = source.sourceUrl.replace(/#.*$/, "").replace(/\?.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}

async function fetchText(url: string, timeoutMs = 6_000): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "user-agent": "DocketTaxIntelligence/0.1 (+local foundation build)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function loadIrsSitemapEntries(): Promise<IrsSitemapEntry[]> {
  const now = Date.now();
  if (irsSitemapCache && now - irsSitemapCache.loadedAt < 1000 * 60 * 30) return irsSitemapCache.entries;
  try {
    const indexXml = await fetchText("https://www.irs.gov/sitemap.xml", 6_000);
    const sitemapUrls = [...indexXml.matchAll(/<loc>(.*?)<\/loc>/g)].flatMap((match) => (match[1] ? [match[1]] : [])).slice(0, 16);
    const pageXml = await Promise.allSettled(sitemapUrls.map((url) => fetchText(url, 8_000)));
    const entries = pageXml.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const urlBlocks = [...result.value.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap((match) => (match[1] ? [match[1]] : []));
      return urlBlocks.flatMap((block) => {
        const url = block.match(/<loc>(.*?)<\/loc>/)?.[1];
        if (!url || !isUsefulIrsUrl(url)) return [];
        return [{ url, lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? null }];
      });
    });
    irsSitemapCache = { loadedAt: now, entries };
    return entries;
  } catch {
    return [];
  }
}

async function discoverIrsSourcesFromSitemap(query: string): Promise<OfficialAuthorityDocument[]> {
  const entries = await loadIrsSitemapEntries();
  const ranked = entries
    .map((entry) => {
      const title = titleFromUrl(entry.url);
      const candidate: OfficialAuthorityDocument = {
        id: sourceId("irs-discovered", entry.url),
        title,
        authorityLevel: authorityFromIrsUrl(entry.url, title),
        sourceUrl: entry.url,
        jurisdiction: "US",
        publisher: "IRS",
        topicTags: topicTagsForDiscovery(query, title, entry.url),
        sourceDate: entry.lastmod,
        discoveredBy: "irs-sitemap",
      };
      const haystack = normalize(`${title} ${entry.url}`);
      const score = queryTokens(query).reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || authorityRank(a.candidate.authorityLevel) - authorityRank(b.candidate.authorityLevel))
    .slice(0, 8)
    .map((item) => item.candidate);

  return ranked;
}

function federalRegisterApiUrl(query: string): string {
  const params = new URLSearchParams({
    "conditions[term]": query,
    "conditions[agencies][]": "internal-revenue-service",
    per_page: "6",
    order: "newest",
  });
  return `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
}

async function discoverFederalRegisterSources(query: string): Promise<OfficialAuthorityDocument[]> {
  try {
    const response = await fetch(federalRegisterApiUrl(query), {
      cache: "no-store",
      headers: { "user-agent": "DocketTaxIntelligence/0.1 (+local foundation build)" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      results?: Array<{ title?: string; html_url?: string; publication_date?: string; type?: string }>;
    };
    return (payload.results ?? [])
      .flatMap((result) => {
        if (!result.title || !result.html_url) return [];
        return [
          {
            id: sourceId("federal-register-discovered", result.html_url),
            title: result.type ? `${result.title} (${result.type})` : result.title,
            authorityLevel: "FEDERAL_REGISTER" as const,
            sourceUrl: result.html_url,
            jurisdiction: "US" as const,
            publisher: "Federal Register" as const,
            topicTags: topicTagsForDiscovery(query, result.title, result.html_url),
            sourceDate: result.publication_date ?? null,
            discoveredBy: "federal-register-api" as const,
          },
        ];
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function discoverOfficialAuthorityCandidates(query: string): Promise<OfficialAuthorityDocument[]> {
  const [irsSources, federalRegisterSources] = await Promise.all([discoverIrsSourcesFromSitemap(query), discoverFederalRegisterSources(query)]);
  return dedupeAuthoritySources([...OFFICIAL_AUTHORITY_CATALOG, ...irsSources, ...federalRegisterSources]);
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
  const boilerplatePattern = /skip to main content|official website|here's how you know|a gov website belongs|menu|search|page last reviewed|share sensitive information only/i;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 60 && sentence.length < 420 && !boilerplatePattern.test(sentence));
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
      score: authoritySearchScore(query, source).score,
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
  const normalizedQuery = normalize(query);
  const topicChecklist =
    /ob{2,6}a|ob3|one big beautiful|beautiful bill|public law 119-21|hr 1|h r 1|new tax law|tax law change/.test(normalizedQuery)
      ? [
          "Segment clients by affected provision, tax year, filing status, age, wage/tip/overtime profile, Schedule C/pass-through exposure, itemized deduction profile, and state conformity.",
          "Use the public law text for statutory changes, then IRS OBBBA implementation pages/notices for filing-season procedure and transition relief.",
          "Treat 2025 form/reporting implementation separately from 2025 tax-law eligibility; IRS transition relief can change workflow even when the statute is effective.",
          "Create reviewer tasks for state conformity and provision-specific effective dates before sending client-facing planning advice.",
        ]
      : /s corp|s corporation|2553|election/.test(normalizedQuery)
      ? ["Confirm entity eligibility and shareholder consent.", "Check Form 2553 timing or late-election relief path.", "Document effective date, tax year, and reviewer approval."]
      : /mileage|vehicle|car|travel/.test(normalizedQuery)
        ? ["Establish date, destination, mileage, and business purpose.", "Separate commuting/personal use from business use.", "Attach contemporaneous log support before claiming."]
        : /home office|business use of home|exclusive/.test(normalizedQuery)
          ? ["Confirm exclusive and regular business use.", "Collect square footage and expense support only after eligibility is supported.", "Escalate ambiguous personal use to reviewer."]
          : /1099-b|stock|broker|capital|8949|schedule d|crypto|digital asset/.test(normalizedQuery)
            ? ["Obtain transaction-level proceeds, basis, dates, and adjustment detail.", "Do not compute gain/loss from client memory alone.", "Route unsupported tax-lot or basis questions to reviewer-controlled workflow."]
            : /1095-a|marketplace|premium|aca/.test(normalizedQuery)
              ? ["Request Form 1095-A before finalizing ACA-related items.", "Reconcile coverage months and premium tax credit support.", "Block filing if firm policy treats missing 1095-A as material."]
              : ["Identify taxpayer type, tax year, jurisdiction, and form/schedule.", "Separate verified facts from client claims.", "Route judgment-heavy or unsupported positions to reviewer approval."];
  const keySupport = liveSources.flatMap((source) => source.snippets.map((snippet) => `${source.title}: ${snippet}`)).slice(0, 3);

  return {
    headline: primary ? `Research packet built from ${liveSources.length} current official source${liveSources.length === 1 ? "" : "s"}.` : "No official source could be retrieved.",
    paragraphs:
      liveSources.length > 0
        ? [
            `Research question: "${query}". The strongest retrieved source is ${primary?.title ?? "the first live source"}; other retrieved authority includes ${sourceList}.`,
            `Visible EA analysis: this is research support, not final client advice. Apply the authority only after confirming taxpayer type, tax year, jurisdiction, material facts, and whether the area is supported by Docket's scope/rule package.`,
            `Key extracted support: ${keySupport.join(" ")}`,
            `Practitioner workflow: ${topicChecklist.join(" ")}`,
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
        ? topicChecklist
        : ["Retry retrieval, broaden the query, or add a new official source adapter for this topic."],
    caveat: "This is not final client-facing tax advice. Docket still requires professional review before relying on the conclusion.",
  };
}

export async function retrieveOfficialAuthority(query: string): Promise<AuthorityResearchResult> {
  const retrievedAt = new Date().toISOString();
  const candidateCatalog = await discoverOfficialAuthorityCandidates(query);
  const ranked = rankAuthorityCatalog(query, candidateCatalog).slice(0, 6);
  const candidates = ranked.length > 0 ? ranked : [];
  const sources = await Promise.all(candidates.map((source) => fetchOfficialSource(source, query, retrievedAt)));
  const sortedSources = sources.sort(
    (a, b) => {
      const liveDiff = (b.fetchStatus === "LIVE" ? 1 : 0) - (a.fetchStatus === "LIVE" ? 1 : 0);
      if (liveDiff !== 0) return liveDiff;
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 2) return scoreDiff;
      return authorityRank(a.authorityLevel) - authorityRank(b.authorityLevel) || scoreDiff;
    },
  );

  return {
    query,
    retrievedAt,
    sources: sortedSources,
    answer: answerFromAuthorities(query, sortedSources),
  };
}
