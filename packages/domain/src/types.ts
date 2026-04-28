import { z } from "zod";

export const DOCKET_PRODUCT_RULE =
  "Docket is a source-backed tax intelligence operating system where AI prepares and humans approve.";

export const RiskLevelSchema = z.enum(["GREEN", "YELLOW", "RED"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const MaterialitySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type Materiality = z.infer<typeof MaterialitySchema>;

export const TaxFactStatusSchema = z.enum([
  "CLAIMED",
  "EXTRACTED",
  "NEEDS_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "CONTRADICTED",
  "SUPERSEDED",
]);
export type TaxFactStatus = z.infer<typeof TaxFactStatusSchema>;

export const ReviewStatusSchema = z.enum([
  "NOT_REVIEWED",
  "AI_PREPARED",
  "PREPARER_REVIEWED",
  "REVIEWER_APPROVED",
  "PARTNER_OVERRIDE",
  "REJECTED",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const SourceTypeSchema = z.enum([
  "IRS_TRANSCRIPT",
  "FILED_PRIOR_YEAR_RETURN",
  "SOURCE_DOCUMENT",
  "BROKERAGE_EXPORT",
  "SIGNED_PORTAL_ANSWER",
  "CLIENT_MESSAGE",
  "MEETING_TRANSCRIPT",
  "STAFF_NOTE",
  "AI_INFERENCE",
  "REVIEWER_OVERRIDE",
  "TAX_AUTHORITY",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const DocumentClassSchema = z.enum([
  "W2",
  "FORM_1099_NEC",
  "FORM_1099_K",
  "FORM_1099_INT",
  "FORM_1099_DIV",
  "FORM_1099_B",
  "FORM_1098",
  "FORM_1095_A",
  "MILEAGE_LOG",
  "BUSINESS_EXPENSE_SUMMARY",
  "PRIOR_YEAR_RETURN_SUMMARY",
  "CLIENT_ORGANIZER",
  "ENGAGEMENT_LETTER",
  "CONSENT_7216",
  "FORM_8879",
  "UNKNOWN",
]);
export type DocumentClass = z.infer<typeof DocumentClassSchema>;

export const ConsentTypeSchema = z.enum([
  "AI_ASSISTED_TAX_PREP",
  "THIRD_PARTY_AI_PROCESSOR_DISCLOSURE",
  "MEETING_TRANSCRIPT_ANALYSIS",
  "PORTAL_MESSAGE_ANALYSIS",
  "ADVISORY_OPPORTUNITY_DETECTION",
  "PRODUCT_IMPROVEMENT_DATA_USE",
  "TAX_SOFTWARE_EXPORT",
  "EFILE_PROVIDER_DISCLOSURE",
  "PAYMENT_PROCESSOR_DISCLOSURE",
]);
export type ConsentType = z.infer<typeof ConsentTypeSchema>;

export const RoleSchema = z.enum([
  "FIRM_OWNER",
  "PARTNER",
  "MANAGER_REVIEWER",
  "PREPARER",
  "ADMIN_ASSISTANT",
  "CLIENT",
  "EXTERNAL_BOOKKEEPER",
  "READ_ONLY_AUDITOR",
  "DOCKET_ADMIN",
]);
export type Role = z.infer<typeof RoleSchema>;

export const PermissionSchema = z.enum([
  "run_ai_prep",
  "approve_tax_fact",
  "resolve_red_flag",
  "send_client_tax_advice",
  "mark_ready_to_file",
  "view_pii",
  "export_packet",
  "manage_firm_policy",
  "manage_consent",
  "view_audit_log",
  "manage_tax_knowledge",
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const TaxReturnStatusSchema = z.enum([
  "INTAKE",
  "DOCUMENT_COLLECTION",
  "AI_PREP",
  "IN_REVIEW",
  "CLIENT_CLARIFICATION",
  "READY_FOR_SIGNATURE",
  "READY_TO_FILE_STUB",
  "EXTENSION_RECOMMENDED",
  "FILED_OUTSIDE_DOCKET",
]);
export type TaxReturnStatus = z.infer<typeof TaxReturnStatusSchema>;

export const OpportunityStatusSchema = z.enum([
  "POSSIBLE",
  "NEEDS_FACTS",
  "NEEDS_DOCUMENTS",
  "READY_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
]);
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

export const IssueStatusSchema = z.enum([
  "OPEN",
  "CLIENT_QUESTION_PENDING",
  "ESCALATED",
  "RESOLVED",
  "WAIVED_BY_REVIEWER",
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const AuthorityLevelSchema = z.enum([
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
]);
export type AuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

export const AIWorkflowTaskSchema = z.enum([
  "document_classification",
  "field_extraction",
  "context_extraction",
  "authority_retrieval",
  "issue_spotting",
  "risk_scoring",
  "client_question_generation",
  "workpaper_generation",
  "reviewer_check",
  "summary_generation",
]);
export type AIWorkflowTask = z.infer<typeof AIWorkflowTaskSchema>;

export const AIPrepReasoningOutputSchema = z.object({
  establishedFacts: z.array(
    z.object({
      label: z.string(),
      sourceIds: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    }),
  ),
  issueSummaries: z.array(
    z.object({
      issueId: z.string(),
      title: z.string(),
      riskLevel: RiskLevelSchema,
      blocker: z.boolean(),
      sourceIds: z.array(z.string()),
      citationIds: z.array(z.string()),
      missingFacts: z.array(z.string()),
      recommendedAction: z.string(),
    }),
  ),
  professionalAnalyses: z
    .array(
      z.object({
        issueId: z.string(),
        title: z.string(),
        situationMode: z.string(),
        context: z.string(),
        factPatternSummary: z.string(),
        ruleSpace: z.array(z.string()),
        smellTests: z.array(z.string()),
        professionalJudgment: z.string(),
        establishedFacts: z.array(z.string()),
        clientClaims: z.array(z.string()),
        assumptionsToAvoid: z.array(z.string()),
        missingFacts: z.array(z.string()),
        authorityPosture: z.string(),
        diligenceDuties: z.array(z.string()),
        riskRationale: z.string(),
        reviewerChecklist: z.array(z.string()),
        clearanceStandard: z.string(),
        clientQuestionStrategy: z.string(),
        sourceIds: z.array(z.string()),
        citationIds: z.array(z.string()),
      }),
    )
    .optional(),
  clientQuestions: z.array(
    z.object({
      relatedIssueId: z.string().nullable(),
      question: z.string(),
      reason: z.string(),
      sourceIds: z.array(z.string()),
      citationIds: z.array(z.string()),
    }),
  ),
  reviewerNotes: z.array(
    z.object({
      title: z.string(),
      note: z.string(),
      sourceIds: z.array(z.string()),
      citationIds: z.array(z.string()),
    }),
  ),
  workpaperRefs: z.array(z.string()),
  authorityContext: z.object({
    knowledgeSnapshotId: z.string(),
    rulePackageId: z.string(),
    citations: z.array(
      z.object({
        citationId: z.string(),
        label: z.string(),
        authorityLevel: z.string(),
        sourceId: z.string(),
      }),
    ),
    caveat: z.string(),
  }),
  nextAction: z.string(),
});
export type AIPrepReasoningOutput = z.infer<typeof AIPrepReasoningOutputSchema>;

export type Firm = {
  id: string;
  name: string;
  defaultJurisdiction: string;
  taxKnowledgeFreshnessHours: number;
};

export type FirmUser = {
  id: string;
  firmId: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
};

export type Client = {
  id: string;
  firmId: string;
  displayName: string;
  email: string;
  phone: string;
  responsivenessScore: number;
  averageResponseDays: number;
  tags: string[];
};

export type ClientContact = {
  id: string;
  clientId: string;
  name: string;
  relationship: string;
  email: string;
  phone: string;
};

export type TaxHouseholdMember = {
  id: string;
  clientId: string;
  name: string;
  relationship: "TAXPAYER" | "SPOUSE" | "DEPENDENT" | "OTHER";
  residencyPeriods: ResidencyPeriod[];
  supportFacts: string[];
  studentStatus: string | null;
};

export type ResidencyPeriod = {
  jurisdiction: string;
  startDate: string;
  endDate: string | null;
  sourceIds: string[];
};

export type Engagement = {
  id: string;
  firmId: string;
  clientId: string;
  name: string;
  taxYear: number;
  scopes: EngagementScope[];
  status: "OPEN" | "ON_HOLD" | "CLOSED";
};

export type EngagementScope = {
  id: string;
  engagementId: string;
  scopeType:
    | "1040"
    | "SCHEDULE_C"
    | "MULTI_STATE_ISSUE_DETECTION"
    | "EXTENSION"
    | "TAX_PLANNING"
    | "BOOKKEEPING_CLEANUP";
  supportLevel: "SUPPORTED" | "PARTIAL" | "NOT_SUPPORTED";
};

export type TaxReturn = {
  id: string;
  firmId: string;
  clientId: string;
  engagementId: string;
  taxYear: number;
  returnType: string;
  jurisdiction: string;
  status: TaxReturnStatus;
  readinessScore: number;
  extensionRiskScore: number;
  riskLevel: RiskLevel;
  assignedPreparerId: string;
  assignedReviewerId: string;
  knowledgeSnapshotId: string;
  rulePackageId: string;
  createdAt: string;
  updatedAt: string;
};

export type ExtractedFieldFixture = {
  label: string;
  value: string | number | boolean;
  confidence: number;
  factType?: string;
  materiality?: Materiality;
};

export type SourceDocument = {
  id: string;
  firmId: string;
  clientId: string;
  taxReturnId: string;
  fileName: string;
  documentClass: DocumentClass;
  taxYear: number | null;
  sourceType: SourceType;
  uploadedBy: "CLIENT" | "FIRM_USER" | "SEED";
  receivedAt: string;
  processedAt: string | null;
  duplicateOfDocumentId: string | null;
  storageKey: string;
  fixtureFields: ExtractedFieldFixture[];
  suspiciousText: string | null;
};

export type DocumentExtraction = {
  id: string;
  sourceDocumentId: string;
  provider: "fixture" | "mock_ocr" | "external_ocr";
  status: "PENDING" | "COMPLETE" | "FAILED";
  confidence: number;
  createdAt: string;
};

export type ExtractedField = {
  id: string;
  extractionId: string;
  sourceDocumentId: string;
  label: string;
  value: string | number | boolean;
  confidence: number;
  normalizedFactType: string | null;
};

export type DocumentFlag = {
  id: string;
  sourceDocumentId: string;
  taxReturnId: string;
  flagType:
    | "WRONG_CLIENT"
    | "WRONG_TAX_YEAR"
    | "DUPLICATE"
    | "MISSING_PAGE"
    | "LOW_CONFIDENCE"
    | "UNEXPECTED_DOCUMENT"
    | "EXPECTED_DOCUMENT_MISSING"
    | "CLIENT_CLAIM_CONTRADICTION"
    | "PROMPT_INJECTION";
  severity: RiskLevel;
  message: string;
  status: IssueStatus;
};

export const EvidenceRefSchema = z.object({
  id: z.string().min(1),
  sourceType: SourceTypeSchema,
  sourceId: z.string().min(1),
  sourceDocumentId: z.string().min(1).nullable().optional(),
  conversationId: z.string().min(1).nullable().optional(),
  portalAnswerId: z.string().min(1).nullable().optional(),
  taxAuthoritySourceId: z.string().min(1).nullable().optional(),
  priorYearReturnId: z.string().min(1).nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
  fieldLabel: z.string().min(1).nullable().optional(),
  bbox: z.array(z.number()).length(4).nullable().optional(),
  sourceQuote: z.string().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const TaxFactSchema = z.object({
  id: z.string().min(1),
  firmId: z.string().min(1),
  clientId: z.string().min(1),
  taxReturnId: z.string().min(1),
  factType: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  taxYear: z.number().int(),
  jurisdiction: z.string().min(1),
  materiality: MaterialitySchema,
  status: TaxFactStatusSchema,
  confidence: z.number().min(0).max(1),
  reviewStatus: ReviewStatusSchema,
  evidenceRefs: z.array(EvidenceRefSchema),
  relatedIssueIds: z.array(z.string()),
  reviewerId: z.string().nullable(),
  acceptedAt: z.string().datetime().nullable(),
});
export type TaxFact = z.infer<typeof TaxFactSchema>;

export type ClientContextFact = {
  id: string;
  clientId: string;
  taxReturnId: string;
  factType: string;
  value: string | number | boolean;
  status: TaxFactStatus;
  sourceIds: string[];
  confidence: number;
};

export type ClientClaim = {
  id: string;
  clientId: string;
  taxReturnId: string;
  claimType: string;
  statement: string;
  normalizedValue: string | number | boolean | null;
  sourceType: SourceType;
  sourceId: string;
  evidenceRefs: EvidenceRef[];
  status: TaxFactStatus;
  createdAt: string;
};

export type Conversation = {
  id: string;
  firmId: string;
  clientId: string;
  taxReturnId: string;
  channel: "PORTAL" | "EMAIL" | "SMS" | "STAFF_NOTE" | "MEETING_TRANSCRIPT";
  title: string;
  sourceProvider: "mock" | "google_meet" | "zoom" | "manual";
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  authorType: "CLIENT" | "FIRM_USER" | "SYSTEM";
  body: string;
  createdAt: string;
};

export type ConversationInsight = {
  id: string;
  conversationId: string;
  taxReturnId: string;
  insightType:
    | "STOCK_SALE_CLAIM"
    | "RESIDENCY_CHANGE_CLAIM"
    | "HOME_OFFICE_CLAIM"
    | "PROMPT_INJECTION_SIGNAL"
    | "MISSING_DOCUMENT_SIGNAL";
  summary: string;
  riskLevel: RiskLevel;
  sourceQuote: string;
  relatedIssueId: string | null;
};

export type PriorYearPattern = {
  id: string;
  clientId: string;
  taxReturnId: string;
  patternType: string;
  priorTaxYear: number;
  description: string;
  expectedCurrentYearDocumentClass: DocumentClass | null;
  resolvedByDocumentId: string | null;
  riskLevel: RiskLevel;
};

export type MissingDocument = {
  id: string;
  clientId: string;
  taxReturnId: string;
  expectedDocumentClass: DocumentClass;
  reason: string;
  sourceIds: string[];
  severity: RiskLevel;
  status: "MISSING" | "REQUESTED" | "RECEIVED" | "WAIVED";
};

export type Contradiction = {
  id: string;
  clientId: string;
  taxReturnId: string;
  title: string;
  description: string;
  sourceIds: string[];
  severity: RiskLevel;
  status: IssueStatus;
};

export type DeductionOpportunity = {
  id: string;
  clientId: string;
  taxReturnId: string;
  opportunityType:
    | "HOME_OFFICE"
    | "BUSINESS_MILEAGE"
    | "SELF_EMPLOYED_HEALTH_INSURANCE"
    | "RETIREMENT_PLANNING"
    | "EDUCATION_CREDIT"
    | "BOOKKEEPING_CLEANUP";
  title: string;
  whyDetected: string;
  sourceIds: string[];
  missingFacts: string[];
  missingDocuments: DocumentClass[];
  riskLevel: RiskLevel;
  status: OpportunityStatus;
  clientQuestion: string;
  reviewerAction: string;
};

export type TaxIssue = {
  id: string;
  firmId: string;
  clientId: string;
  taxReturnId: string;
  issueType: string;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  status: IssueStatus;
  blocker: boolean;
  sourceIds: string[];
  recommendedAction: string;
  assignedToRole: Role;
  createdAt: string;
  resolvedAt: string | null;
};

export type TaxFlag = {
  id: string;
  taxReturnId: string;
  riskLevel: RiskLevel;
  label: string;
  reason: string;
  sourceIds: string[];
};

export type ClientClarification = {
  id: string;
  clientId: string;
  taxReturnId: string;
  relatedIssueId: string | null;
  question: string;
  generatedByAiRunId: string | null;
  status: "DRAFT" | "AWAITING_CLIENT" | "ANSWERED" | "APPROVED_TO_SEND";
  answer: string | null;
  answeredAt: string | null;
  reviewerApproved: boolean;
  evidenceRefs: EvidenceRef[];
};

export type ReviewerNote = {
  id: string;
  taxReturnId: string;
  issueId: string | null;
  authorUserId: string;
  body: string;
  createdAt: string;
};

export type Workpaper = {
  id: string;
  taxReturnId: string;
  title: string;
  section: string;
  body: string;
  evidenceRefIds: string[];
  knowledgeSnapshotId: string;
  status: "DRAFT" | "READY_FOR_REVIEW" | "APPROVED";
};

export type TaxAuthoritySource = {
  id: string;
  jurisdiction: string;
  title: string;
  authorityLevel: AuthorityLevel;
  sourceUrl: string;
  topicTags: string[];
  retrievedAt: string;
  publishedAt: string;
  effectiveDate: string;
  nonprecedential: boolean;
};

export type TaxAuthorityVersion = {
  id: string;
  sourceId: string;
  contentHash: string;
  supersedesVersionId: string | null;
  createdAt: string;
};

export type TaxCitation = {
  id: string;
  sourceId: string;
  label: string;
  quote: string;
  authorityLevel: AuthorityLevel;
};

export type TaxSourceIngestionRun = {
  id: string;
  sourceProvider: "irs" | "federal_register" | "ecfr" | "state_dor" | "mock";
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  startedAt: string;
  completedAt: string;
  changedSourceIds: string[];
};

export type TaxSourceChange = {
  id: string;
  sourceId: string;
  title: string;
  impactLevel: RiskLevel;
  affectedForms: string[];
  affectedTaxYears: number[];
  reviewStatus: ReviewStatus;
};

export type TaxImpactAssessment = {
  id: string;
  sourceChangeId: string;
  taxReturnId: string;
  summary: string;
  requiresReviewerApproval: boolean;
};

export type TaxKnowledgeSnapshot = {
  id: string;
  label: string;
  jurisdiction: string;
  taxYear: number;
  createdAt: string;
  sourceVersionIds: string[];
  lastSyncStatus: "CURRENT" | "STALE" | "FAILED";
  lastSyncedAt: string;
};

export type TaxRule = {
  id: string;
  topic: string;
  deterministic: boolean;
  supportLevel: "SUPPORTED" | "PARTIAL" | "NOT_SUPPORTED";
};

export type TaxRuleVersion = {
  id: string;
  ruleId: string;
  version: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
};

export type TaxRulePackage = {
  id: string;
  version: string;
  taxYear: number;
  status: "DRAFT" | "APPROVED" | "SUPERSEDED";
  ruleVersionIds: string[];
};

export type ReturnKnowledgeSnapshot = {
  id: string;
  taxReturnId: string;
  knowledgeSnapshotId: string;
  rulePackageId: string;
  attachedAt: string;
};

export type AIReasoningRun = {
  id: string;
  firmId: string;
  taxReturnId: string;
  task: AIWorkflowTask;
  provider: "mock" | "openai" | "anthropic" | "claude_code_cli" | "codex_cli" | "other";
  model: string;
  promptVersion: string;
  toolVersion: string;
  knowledgeSnapshotId: string;
  inputSourceIds: string[];
  outputSchema: string;
  output: unknown;
  confidence: number;
  costEstimateUsd: number;
  latencyMs: number;
  reviewStatus: ReviewStatus;
  humanEdits: string | null;
  finalOutcome: string | null;
  createdAt: string;
};

export type AIPrepRun = {
  id: string;
  taxReturnId: string;
  status: "PENDING" | "COMPLETE" | "FAILED";
  aiReasoningRunIds: string[];
  createdFactIds: string[];
  createdIssueIds: string[];
  createdClarificationIds: string[];
  createdWorkpaperIds: string[];
  costEstimateUsd: number;
  createdAt: string;
};

export type ModelProvider = {
  id: string;
  name: "mock" | "openai" | "anthropic" | "claude_code_cli" | "codex_cli" | "other";
  enabled: boolean;
  externalCallsAllowed: boolean;
};

export type PromptVersion = {
  id: string;
  task: AIWorkflowTask;
  version: string;
  status: "ACTIVE" | "EXPERIMENTAL" | "RETIRED";
};

export type ModelEvalRun = {
  id: string;
  benchmarkCaseIds: string[];
  status: "PASS" | "FAIL";
  falseClearanceRate: number;
  citationCorrectness: number;
  unsupportedFactRate: number;
  reviewerOverrideRate: number;
  costUsd: number;
  latencyMs: number;
};

export type TaxProBenchmarkCase = {
  id: string;
  category:
    | "document_extraction"
    | "missing_document_detection"
    | "contradiction_detection"
    | "prior_year_comparison"
    | "deduction_opportunity_detection"
    | "risk_grading"
    | "client_question_quality"
    | "authority_retrieval"
    | "unsupported_area_escalation"
    | "review_gate_enforcement"
    | "prompt_injection_resistance";
  title: string;
  fixtureSummary: string;
  expectedFindings: string[];
  mustBlockFiling: boolean;
};

export type ReviewerCorrection = {
  id: string;
  aiRunId: string;
  reviewerId: string;
  correctionType: string;
  summary: string;
};

export type ExpertPreferenceRating = {
  id: string;
  benchmarkCaseId: string;
  raterId: string;
  score: number;
  notes: string;
};

export type ConsentRecord = {
  id: string;
  firmId: string;
  clientId: string;
  taxReturnId: string | null;
  consentType: ConsentType;
  scope: string;
  consentTextVersion: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  signedBy: string;
  ipAddress: string | null;
  userAgent: string | null;
  relatedDocumentId: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  firmId: string;
  clientId: string | null;
  taxReturnId: string | null;
  actorType: "AI" | "CLIENT" | "FIRM_USER" | "SYSTEM";
  actorId: string | null;
  eventType:
    | "AI_EXTRACTION_RUN"
    | "AI_REASONING_RUN"
    | "FACT_CREATED"
    | "FACT_ACCEPTED"
    | "FACT_REJECTED"
    | "ISSUE_CREATED"
    | "ISSUE_RESOLVED"
    | "CLIENT_QUESTION_GENERATED"
    | "CLIENT_ANSWER_SUBMITTED"
    | "WORKPAPER_GENERATED"
    | "REVIEW_APPROVAL_ADDED"
    | "EXPORT_PACKET_GENERATED"
    | "STATUS_CHANGED"
    | "CONSENT_GRANTED"
    | "CONSENT_REVOKED"
    | "KNOWLEDGE_SOURCE_SYNCED"
    | "WORKFLOW_BLOCKED"
    | "PROMPT_INJECTION_FLAGGED";
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type FirmPolicy = {
  id: string;
  firmId: string;
  policyType: string;
  name: string;
  description: string;
  severity: RiskLevel;
  conditionsJson: Record<string, string | number | boolean>;
  action: "BLOCK" | "WARN" | "ESCALATE" | "REQUEST_DOCUMENT";
  requiredRole: Role;
  enabled: boolean;
};

export type SecuritySetting = {
  id: string;
  firmId: string;
  mfaRequired: boolean;
  sessionLoggingEnabled: boolean;
  piiLoggingAllowed: false;
};

export type DataRetentionPolicy = {
  id: string;
  firmId: string;
  recordType: string;
  retainForYears: number;
  legalBasis: string;
};

export type IntegrationConnection = {
  id: string;
  firmId: string;
  provider:
    | "mock_ai"
    | "claude_code_cli"
    | "mock_ocr"
    | "google_meet"
    | "zoom"
    | "irs_transcript"
    | "tax_software_export"
    | "efile_provider"
    | "payment_processor"
    | "esign";
  status: "NOT_CONFIGURED" | "CONNECTED" | "ERROR";
  externalCallsAllowed: boolean;
};

export type SubprocessorRecord = {
  id: string;
  firmId: string;
  name: string;
  purpose: string;
  enabled: boolean;
  consentTypesRequired: ConsentType[];
};

export type SignatureAuthorization = {
  id: string;
  taxReturnId: string;
  authorizationType: "FORM_8879" | "ENGAGEMENT_LETTER" | "PAYMENT_AUTHORIZATION";
  status: "NOT_STARTED" | "SENT" | "SIGNED" | "VOID";
  signedAt: string | null;
  retentionRequirement: string;
};

export type ExportPackage = {
  id: string;
  taxReturnId: string;
  state:
    | "NOT_STARTED"
    | "GENERATING"
    | "GENERATED"
    | "STALE_DUE_TO_CHANGE"
    | "APPROVED_FOR_EXPORT"
    | "EXPORTED_STUB";
  generatedAt: string | null;
  packetJson: Record<string, unknown>;
  efileDisabledNotice: string;
};

export type PostFilingEvent = {
  id: string;
  taxReturnId: string;
  eventType:
    | "EFILE_REJECTION"
    | "IRS_NOTICE"
    | "STATE_NOTICE"
    | "AMENDMENT"
    | "PENALTY_NOTICE"
    | "REFUND_ISSUE"
    | "INSTALLMENT_AGREEMENT"
    | "CLIENT_FOLLOW_UP"
    | "POST_FILING_DOCUMENT";
  status: "OPEN" | "RESOLVED";
};

export type DocketData = {
  firms: Firm[];
  firmUsers: FirmUser[];
  clients: Client[];
  clientContacts: ClientContact[];
  householdMembers: TaxHouseholdMember[];
  engagements: Engagement[];
  taxReturns: TaxReturn[];
  sourceDocuments: SourceDocument[];
  documentExtractions: DocumentExtraction[];
  extractedFields: ExtractedField[];
  documentFlags: DocumentFlag[];
  evidenceRefs: EvidenceRef[];
  taxFacts: TaxFact[];
  clientContextFacts: ClientContextFact[];
  clientClaims: ClientClaim[];
  conversations: Conversation[];
  conversationMessages: ConversationMessage[];
  conversationInsights: ConversationInsight[];
  priorYearPatterns: PriorYearPattern[];
  missingDocuments: MissingDocument[];
  contradictions: Contradiction[];
  deductionOpportunities: DeductionOpportunity[];
  taxIssues: TaxIssue[];
  taxFlags: TaxFlag[];
  clientClarifications: ClientClarification[];
  reviewerNotes: ReviewerNote[];
  workpapers: Workpaper[];
  taxAuthoritySources: TaxAuthoritySource[];
  taxAuthorityVersions: TaxAuthorityVersion[];
  taxCitations: TaxCitation[];
  taxSourceIngestionRuns: TaxSourceIngestionRun[];
  taxSourceChanges: TaxSourceChange[];
  taxImpactAssessments: TaxImpactAssessment[];
  taxKnowledgeSnapshots: TaxKnowledgeSnapshot[];
  taxRules: TaxRule[];
  taxRuleVersions: TaxRuleVersion[];
  taxRulePackages: TaxRulePackage[];
  returnKnowledgeSnapshots: ReturnKnowledgeSnapshot[];
  aiReasoningRuns: AIReasoningRun[];
  aiPrepRuns: AIPrepRun[];
  modelProviders: ModelProvider[];
  promptVersions: PromptVersion[];
  modelEvalRuns: ModelEvalRun[];
  taxProBenchmarkCases: TaxProBenchmarkCase[];
  reviewerCorrections: ReviewerCorrection[];
  expertPreferenceRatings: ExpertPreferenceRating[];
  consentRecords: ConsentRecord[];
  auditEvents: AuditEvent[];
  firmPolicies: FirmPolicy[];
  securitySettings: SecuritySetting[];
  dataRetentionPolicies: DataRetentionPolicy[];
  integrationConnections: IntegrationConnection[];
  subprocessorRecords: SubprocessorRecord[];
  signatureAuthorizations: SignatureAuthorization[];
  exportPackages: ExportPackage[];
  postFilingEvents: PostFilingEvent[];
};

export type WorkflowResult = {
  data: DocketData;
  auditEvents: AuditEvent[];
  blocked: boolean;
  blockers: string[];
};
