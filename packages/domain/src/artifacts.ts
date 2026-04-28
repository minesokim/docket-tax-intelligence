import { z } from "zod";

import {
  AuthorityLevelSchema,
  MaterialitySchema,
  ReviewStatusSchema,
  RiskLevelSchema,
  SourceTypeSchema,
  TaxFactStatusSchema,
  type ReviewStatus,
  type SourceType,
} from "./types";

export const SourceAuthorityTierSchema = z.enum([
  "PRIMARY_CONTROLLING",
  "PRIMARY_ADMINISTRATIVE",
  "OFFICIAL_INTERPRETIVE",
  "CLIENT_EVIDENCE",
  "FIRM_WORK_PRODUCT",
  "COMMUNITY_SIGNAL",
  "UNTRUSTED_INPUT",
]);
export type SourceAuthorityTier = z.infer<typeof SourceAuthorityTierSchema>;

export const RetrievalSourceTypeSchema = z.enum([
  "client",
  "document",
  "tax_fact",
  "client_claim",
  "conversation",
  "prior_year_pattern",
  "missing_document",
  "issue",
  "workpaper",
  "client_question",
  "review_gate",
  "tax_authority",
  "tax_citation",
]);
export type RetrievalSourceType = z.infer<typeof RetrievalSourceTypeSchema>;

export const ReviewerStateSchema = z.enum([
  "UNREVIEWED",
  "NEEDS_EVIDENCE",
  "EVIDENCE_ATTACHED",
  "PREPARER_READY",
  "REVIEWER_REVIEWING",
  "REVIEWER_APPROVED",
  "REVIEWER_REJECTED",
  "PARTNER_OVERRIDE",
]);
export type ReviewerState = z.infer<typeof ReviewerStateSchema>;

export const ArtifactConfidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  sourceSupport: z.number().min(0).max(1),
  retrievalConfidence: z.number().min(0).max(1),
  authorityFit: z.number().min(0).max(1),
  recencyConfidence: z.number().min(0).max(1),
  reviewState: ReviewerStateSchema,
  rationale: z.string().min(1),
});
export type ArtifactConfidence = z.infer<typeof ArtifactConfidenceSchema>;

export const SourcePacketItemSchema = z.object({
  id: z.string().min(1),
  sourceType: RetrievalSourceTypeSchema,
  label: z.string().min(1),
  excerpt: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  sourceDate: z.string().nullable(),
  retrievedAt: z.string(),
  taxYear: z.number().int().nullable(),
  jurisdiction: z.string().nullable(),
  authorityTier: SourceAuthorityTierSchema,
  authorityLevel: AuthorityLevelSchema.nullable(),
  sourceReliability: z.number().min(0).max(1),
  recencyConfidence: z.number().min(0).max(1),
  retrievalConfidence: z.number().min(0).max(1),
  evidenceRefIds: z.array(z.string()),
});
export type SourcePacketItem = z.infer<typeof SourcePacketItemSchema>;

export const FactNodeSchema = z.object({
  id: z.string().min(1),
  factType: z.string().min(1),
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  status: TaxFactStatusSchema,
  materiality: MaterialitySchema,
  taxYear: z.number().int(),
  jurisdiction: z.string(),
  evidenceRefIds: z.array(z.string()),
  sourcePacketIds: z.array(z.string()),
  derivedFromFactIds: z.array(z.string()),
  contradictsFactIds: z.array(z.string()),
  confidence: ArtifactConfidenceSchema,
  reviewerState: ReviewerStateSchema,
});
export type FactNode = z.infer<typeof FactNodeSchema>;

export const CitationArtifactSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourcePacketId: z.string().min(1),
  authorityLevel: AuthorityLevelSchema.nullable(),
  quote: z.string().min(1),
  confidence: ArtifactConfidenceSchema,
});
export type CitationArtifact = z.infer<typeof CitationArtifactSchema>;

export const ReconciliationTableArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  relatedIssueId: z.string().nullable(),
  columns: z.array(z.string().min(1)).min(2),
  rows: z.array(
    z.object({
      id: z.string().min(1),
      cells: z.array(z.string()),
      sourcePacketIds: z.array(z.string()),
      status: z.enum(["MATCHED", "UNRESOLVED", "CONTRADICTED", "NEEDS_SOURCE"]),
    }),
  ),
  confidence: ArtifactConfidenceSchema,
});
export type ReconciliationTableArtifact = z.infer<typeof ReconciliationTableArtifactSchema>;

export const IssueAnalysisArtifactSchema = z.object({
  id: z.string().min(1),
  issueId: z.string().min(1),
  title: z.string().min(1),
  riskLevel: RiskLevelSchema,
  blocker: z.boolean(),
  reviewerState: ReviewerStateSchema,
  situationMode: z.string().min(1),
  factPatternSummary: z.string().min(1),
  verifiedFactNodeIds: z.array(z.string()),
  claimSourcePacketIds: z.array(z.string()),
  missingFacts: z.array(z.string()),
  authoritySourcePacketIds: z.array(z.string()),
  smellTests: z.array(z.string()),
  riskRationale: z.string().min(1),
  clientQuestionIds: z.array(z.string()),
  preparerTaskIds: z.array(z.string()),
  workpaperIds: z.array(z.string()),
  citationIds: z.array(z.string()),
  confidence: ArtifactConfidenceSchema,
});
export type IssueAnalysisArtifact = z.infer<typeof IssueAnalysisArtifactSchema>;

export const ClientQuestionArtifactSchema = z.object({
  id: z.string().min(1),
  relatedIssueId: z.string().nullable(),
  question: z.string().min(1),
  reason: z.string().min(1),
  sourcePacketIds: z.array(z.string()),
  reviewerState: ReviewerStateSchema,
  confidence: ArtifactConfidenceSchema,
});
export type ClientQuestionArtifact = z.infer<typeof ClientQuestionArtifactSchema>;

export const PreparerTaskArtifactSchema = z.object({
  id: z.string().min(1),
  relatedIssueId: z.string().nullable(),
  task: z.string().min(1),
  sourcePacketIds: z.array(z.string()),
  priority: z.number().int(),
  confidence: ArtifactConfidenceSchema,
});
export type PreparerTaskArtifact = z.infer<typeof PreparerTaskArtifactSchema>;

export const WorkpaperArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  section: z.string().min(1),
  body: z.string().min(1),
  sourcePacketIds: z.array(z.string()),
  reviewerState: ReviewerStateSchema,
  confidence: ArtifactConfidenceSchema,
});
export type WorkpaperArtifact = z.infer<typeof WorkpaperArtifactSchema>;

export const MemoArtifactSchema = z.object({
  id: z.string().min(1),
  headline: z.string().min(1),
  paragraphs: z.array(z.string().min(1)),
  verdict: z.object({
    filingStatus: z.string().min(1),
    readinessScore: z.number().int(),
    extensionRiskScore: z.number().int(),
    blockerCount: z.number().int(),
  }),
  issueAnalysisIds: z.array(z.string()),
  citationIds: z.array(z.string()),
  confidence: ArtifactConfidenceSchema,
});
export type MemoArtifact = z.infer<typeof MemoArtifactSchema>;

export const OrchestrationTraceEventSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(["intent", "context", "retrieval", "issue_detection", "issue_reasoning", "cross_issue_checks", "synthesis", "validation"]),
  summary: z.string().min(1),
  toolName: z.string().nullable(),
  query: z.string().nullable(),
  sourcePacketIds: z.array(z.string()),
  startedAt: z.string(),
  completedAt: z.string(),
  latencyMs: z.number().int().nonnegative(),
  cacheStatus: z.enum(["MISS", "HIT", "NOT_CACHEABLE"]),
});
export type OrchestrationTraceEvent = z.infer<typeof OrchestrationTraceEventSchema>;

export const ChatArtifactEnvelopeSchema = z.object({
  id: z.string().min(1),
  intent: z.enum(["casual", "research", "client_lookup", "client_status", "issue_analysis", "deep_memo", "reconciliation", "client_draft", "workpaper"]),
  clientId: z.string().nullable(),
  taxReturnId: z.string().nullable(),
  generatedAt: z.string(),
  immutableContentHash: z.string().min(1),
  sourcePacket: z.array(SourcePacketItemSchema),
  factGraph: z.array(FactNodeSchema),
  memo: MemoArtifactSchema.nullable(),
  issueAnalyses: z.array(IssueAnalysisArtifactSchema),
  citations: z.array(CitationArtifactSchema),
  reconciliationTables: z.array(ReconciliationTableArtifactSchema),
  clientQuestions: z.array(ClientQuestionArtifactSchema),
  preparerTasks: z.array(PreparerTaskArtifactSchema),
  workpapers: z.array(WorkpaperArtifactSchema),
  trace: z.array(OrchestrationTraceEventSchema),
  confidence: ArtifactConfidenceSchema,
});
export type ChatArtifactEnvelope = z.infer<typeof ChatArtifactEnvelopeSchema>;

export function artifactConfidence(
  rationale: string,
  overrides: Partial<Omit<ArtifactConfidence, "rationale">> = {},
): ArtifactConfidence {
  return {
    overall: overrides.overall ?? 0.78,
    sourceSupport: overrides.sourceSupport ?? 0.75,
    retrievalConfidence: overrides.retrievalConfidence ?? 0.8,
    authorityFit: overrides.authorityFit ?? 0.65,
    recencyConfidence: overrides.recencyConfidence ?? 0.8,
    reviewState: overrides.reviewState ?? "UNREVIEWED",
    rationale,
  };
}

export function reviewStateFromStatus(status: ReviewStatus): ReviewerState {
  if (status === "REVIEWER_APPROVED") return "REVIEWER_APPROVED";
  if (status === "PARTNER_OVERRIDE") return "PARTNER_OVERRIDE";
  if (status === "REJECTED") return "REVIEWER_REJECTED";
  if (status === "PREPARER_REVIEWED") return "PREPARER_READY";
  return "UNREVIEWED";
}

export function authorityTierForSourceType(sourceType: SourceType): SourceAuthorityTier {
  if (sourceType === "TAX_AUTHORITY") return "OFFICIAL_INTERPRETIVE";
  if (sourceType === "IRS_TRANSCRIPT" || sourceType === "FILED_PRIOR_YEAR_RETURN") return "CLIENT_EVIDENCE";
  if (sourceType === "SOURCE_DOCUMENT" || sourceType === "BROKERAGE_EXPORT") return "CLIENT_EVIDENCE";
  if (sourceType === "SIGNED_PORTAL_ANSWER" || sourceType === "CLIENT_MESSAGE" || sourceType === "MEETING_TRANSCRIPT") return "UNTRUSTED_INPUT";
  if (sourceType === "REVIEWER_OVERRIDE") return "FIRM_WORK_PRODUCT";
  return "UNTRUSTED_INPUT";
}
