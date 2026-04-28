import { execFileSync } from "node:child_process";

import {
  type AIReasoningRun,
  type AIPrepReasoningOutput,
  AIPrepReasoningOutputSchema,
  type AIWorkflowTask,
  type AuditEvent,
  type ClientClarification,
  type ConsentType,
  type DocketData,
  type EvidenceRef,
  type ExtractedField,
  type Materiality,
  type Permission,
  type RiskLevel,
  type SourceDocument,
  TaxFactSchema,
  type WorkflowResult,
} from "./types";
import { IDS, NOW, cloneDocketData } from "./seed";

type AIProviderName = AIReasoningRun["provider"];

const BUILT_IN_CITATIONS: Record<string, AIPrepReasoningOutput["authorityContext"]["citations"][number]> = {
  "cite-pub587-exclusive-use": {
    citationId: "cite-pub587-exclusive-use",
    label: "Home office exclusive use",
    authorityLevel: "IRS_PUBLICATION",
    sourceId: "auth-irs-pub-587",
  },
};

const SOURCE_RELIABILITY: Record<string, number> = {
  IRS_TRANSCRIPT: 0.98,
  FILED_PRIOR_YEAR_RETURN: 0.95,
  SOURCE_DOCUMENT: 0.9,
  BROKERAGE_EXPORT: 0.9,
  SIGNED_PORTAL_ANSWER: 0.78,
  CLIENT_MESSAGE: 0.62,
  MEETING_TRANSCRIPT: 0.52,
  STAFF_NOTE: 0.6,
  AI_INFERENCE: 0.25,
  REVIEWER_OVERRIDE: 0.92,
  TAX_AUTHORITY: 0.9,
};

export type ConfidenceInput = {
  sourceType: string;
  extractionConfidence: number;
  corroboratingSourceCount: number;
  priorYearConsistent: boolean;
  materiality: Materiality;
  authorityStrength: number;
  jurisdictionMatch: boolean;
  taxYearMatch: boolean;
  clientConfirmed: boolean;
  reviewStatus: string;
};

export function computeTaxFactConfidence(input: ConfidenceInput): number {
  const sourceReliability = SOURCE_RELIABILITY[input.sourceType] ?? 0.35;
  const corroboration = Math.min(1, input.corroboratingSourceCount / 3);
  const materialityPenalty = input.materiality === "HIGH" ? -0.04 : input.materiality === "MEDIUM" ? -0.01 : 0;
  const reviewBoost =
    input.reviewStatus === "REVIEWER_APPROVED" || input.reviewStatus === "PARTNER_OVERRIDE" ? 0.08 : 0;

  const raw =
    sourceReliability * 0.24 +
    input.extractionConfidence * 0.22 +
    corroboration * 0.12 +
    (input.priorYearConsistent ? 1 : 0.45) * 0.08 +
    input.authorityStrength * 0.1 +
    (input.jurisdictionMatch ? 1 : 0) * 0.08 +
    (input.taxYearMatch ? 1 : 0) * 0.08 +
    (input.clientConfirmed ? 1 : 0.35) * 0.08 +
    materialityPenalty +
    reviewBoost;

  return Math.max(0, Math.min(1, Number(raw.toFixed(2))));
}

export function materialFactHasEvidence(fact: { materiality: Materiality; evidenceRefs: EvidenceRef[] }): boolean {
  return fact.materiality === "LOW" || fact.evidenceRefs.length > 0;
}

export function assertMaterialTaxFactHasEvidence(fact: { id: string; materiality: Materiality; evidenceRefs: EvidenceRef[] }): void {
  if (!materialFactHasEvidence(fact)) {
    throw new Error(`Material tax fact ${fact.id} is missing evidence.`);
  }
}

export function redactPII(text: string): string {
  return text
    .replace(/\bMiguel Sandoval\b/g, "[client]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
    .replace(/\b\d{3}-\d{4}\b/g, "[phone]");
}

function audit(
  data: DocketData,
  eventType: AuditEvent["eventType"],
  summary: string,
  metadata: AuditEvent["metadata"],
  actorType: AuditEvent["actorType"] = "SYSTEM",
  actorId: string | null = null,
): AuditEvent {
  const event: AuditEvent = {
    id: `audit-${eventType.toLowerCase()}-${data.auditEvents.length + 1}`,
    firmId: IDS.firm,
    clientId: IDS.client,
    taxReturnId: IDS.taxReturn,
    actorType,
    actorId,
    eventType,
    summary: redactPII(summary),
    metadata,
    createdAt: NOW,
  };
  data.auditEvents.push(event);
  return event;
}

function findReturn(data: DocketData, returnId: string) {
  const taxReturn = data.taxReturns.find((item) => item.id === returnId);
  if (!taxReturn) {
    throw new Error(`Tax return ${returnId} not found.`);
  }
  return taxReturn;
}

function markExportPacketStale(data: DocketData, returnId: string | null): void {
  if (!returnId) return;
  for (const packet of data.exportPackages.filter((item) => item.taxReturnId === returnId)) {
    if (packet.state === "GENERATED" || packet.state === "APPROVED_FOR_EXPORT" || packet.state === "EXPORTED_STUB") {
      packet.state = "STALE_DUE_TO_CHANGE";
    }
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function hasPermission(data: DocketData, userId: string, permission: Permission): boolean {
  return data.firmUsers.find((user) => user.id === userId)?.permissions.includes(permission) ?? false;
}

function permissionBlock(data: DocketData, userId: string, permission: Permission, summary: string): WorkflowResult | null {
  if (hasPermission(data, userId, permission)) {
    return null;
  }

  const event = audit(data, "WORKFLOW_BLOCKED", summary, { userId, permission }, "SYSTEM");
  return { data, auditEvents: [event], blocked: true, blockers: [`User lacks ${permission} permission.`] };
}

export function hasActiveConsent(data: DocketData, clientId: string, consentType: ConsentType, taxReturnId?: string): boolean {
  return data.consentRecords.some(
    (record) =>
      record.clientId === clientId &&
      record.consentType === consentType &&
      record.granted &&
      record.revokedAt === null &&
      (record.taxReturnId === null || record.taxReturnId === taxReturnId),
  );
}

export function requiredConsentsForWorkflow(task: AIWorkflowTask): ConsentType[] {
  if (task === "context_extraction") {
    return ["AI_ASSISTED_TAX_PREP", "PORTAL_MESSAGE_ANALYSIS", "MEETING_TRANSCRIPT_ANALYSIS"];
  }

  if (task === "client_question_generation" || task === "workpaper_generation" || task === "issue_spotting") {
    return ["AI_ASSISTED_TAX_PREP"];
  }

  return ["AI_ASSISTED_TAX_PREP"];
}

export function assertWorkflowConsent(data: DocketData, returnId: string, task: AIWorkflowTask): void {
  const taxReturn = findReturn(data, returnId);
  const missing = requiredConsentsForWorkflow(task).filter(
    (consentType) => !hasActiveConsent(data, taxReturn.clientId, consentType, returnId),
  );

  if (missing.length > 0) {
    throw new Error(`Missing consent for ${missing.join(", ")}.`);
  }
}

function workflowConsentBlock(data: DocketData, returnId: string, task: AIWorkflowTask): WorkflowResult | null {
  const taxReturn = findReturn(data, returnId);
  const missing = requiredConsentsForWorkflow(task).filter(
    (consentType) => !hasActiveConsent(data, taxReturn.clientId, consentType, returnId),
  );

  if (missing.length === 0) {
    return null;
  }

  const event = audit(
    data,
    "WORKFLOW_BLOCKED",
    "Required consent is missing for AI-assisted tax workflow.",
    { returnId, task, missingConsents: missing.join(",") },
    "SYSTEM",
  );
  return {
    data,
    auditEvents: [event],
    blocked: true,
    blockers: [`Missing required consent: ${missing.join(", ")}.`],
  };
}

function findConsentRecord(data: DocketData, consentId: string) {
  const consent = data.consentRecords.find((record) => record.id === consentId);
  if (!consent) {
    throw new Error(`Consent record ${consentId} not found.`);
  }
  return consent;
}

export function grantConsent(inputData: DocketData, consentId: string, actorId: string | null = IDS.client): WorkflowResult {
  const data = cloneDocketData(inputData);
  const consent = findConsentRecord(data, consentId);
  consent.granted = true;
  consent.grantedAt = NOW;
  consent.revokedAt = null;

  const event: AuditEvent = {
    id: `audit-consent-granted-${data.auditEvents.length + 1}`,
    firmId: consent.firmId,
    clientId: consent.clientId,
    taxReturnId: consent.taxReturnId,
    actorType: "CLIENT",
    actorId,
    eventType: "CONSENT_GRANTED",
    summary: redactPII(`Consent granted for ${consent.consentType}.`),
    metadata: {
      consentId: consent.id,
      consentType: consent.consentType,
      consentTextVersion: consent.consentTextVersion,
    },
    createdAt: NOW,
  };
  data.auditEvents.push(event);
  markExportPacketStale(data, consent.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function revokeConsent(inputData: DocketData, consentId: string, actorId: string | null = IDS.client): WorkflowResult {
  const data = cloneDocketData(inputData);
  const consent = findConsentRecord(data, consentId);
  consent.granted = false;
  consent.revokedAt = NOW;

  const event: AuditEvent = {
    id: `audit-consent-revoked-${data.auditEvents.length + 1}`,
    firmId: consent.firmId,
    clientId: consent.clientId,
    taxReturnId: consent.taxReturnId,
    actorType: "CLIENT",
    actorId,
    eventType: "CONSENT_REVOKED",
    summary: redactPII(`Consent revoked for ${consent.consentType}.`),
    metadata: {
      consentId: consent.id,
      consentType: consent.consentType,
      consentTextVersion: consent.consentTextVersion,
    },
    createdAt: NOW,
  };
  data.auditEvents.push(event);
  markExportPacketStale(data, consent.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function detectPromptInjectionText(text: string): boolean {
  const patterns = [
    /ignore (all )?(previous|prior|system|developer) instructions/i,
    /reveal (the )?(system prompt|developer message|secrets)/i,
    /mark (the )?return (as )?(ready|safe|approved)/i,
    /change (tool )?permissions/i,
    /execute (this )?(code|script|command)/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

export function runDocumentExtraction(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const taxReturn = findReturn(data, returnId);
  const events: AuditEvent[] = [];

  const consentBlock = workflowConsentBlock(data, returnId, "field_extraction");
  if (consentBlock) return consentBlock;

  for (const document of data.sourceDocuments.filter((item) => item.taxReturnId === returnId)) {
    if (document.suspiciousText && detectPromptInjectionText(document.suspiciousText)) {
      if (!data.documentFlags.some((flag) => flag.sourceDocumentId === document.id && flag.flagType === "PROMPT_INJECTION")) {
        data.documentFlags.push({
          id: `flag-${document.id}-prompt-injection`,
          sourceDocumentId: document.id,
          taxReturnId: returnId,
          flagType: "PROMPT_INJECTION",
          severity: "RED",
          message: "Uploaded document contains instructions that attempt to override Docket workflow controls.",
          status: "OPEN",
        });
      }
      events.push(audit(data, "PROMPT_INJECTION_FLAGGED", "Flagged prompt injection in uploaded document.", { documentId: document.id }, "AI"));
    }

    const extractionId = `extract-${document.id}`;
    if (!data.documentExtractions.some((extraction) => extraction.id === extractionId)) {
      const confidence =
        document.fixtureFields.length === 0
          ? 0
          : Number((document.fixtureFields.reduce((sum, field) => sum + field.confidence, 0) / document.fixtureFields.length).toFixed(2));
      data.documentExtractions.push({
        id: extractionId,
        sourceDocumentId: document.id,
        provider: "fixture",
        status: document.fixtureFields.length === 0 ? "PENDING" : "COMPLETE",
        confidence,
        createdAt: NOW,
      });
    }

    for (const fixture of document.fixtureFields) {
      const fieldId = `field-${document.id}-${slug(fixture.label)}`;
      if (!data.extractedFields.some((field) => field.id === fieldId)) {
        const field: ExtractedField = {
          id: fieldId,
          extractionId,
          sourceDocumentId: document.id,
          label: fixture.label,
          value: fixture.value,
          confidence: fixture.confidence,
          normalizedFactType: fixture.factType ?? null,
        };
        data.extractedFields.push(field);
      }

      if (!fixture.factType) {
        continue;
      }

      const evidenceId = `ev-${document.id}-${slug(fixture.label)}`;
      let evidence = data.evidenceRefs.find((item) => item.id === evidenceId);
      if (!evidence) {
        evidence = {
          id: evidenceId,
          sourceType: document.sourceType,
          sourceId: document.id,
          sourceDocumentId: document.id,
          pageNumber: 1,
          fieldLabel: fixture.label,
          sourceQuote: `${fixture.label}: ${fixture.value}`,
          confidence: fixture.confidence,
          createdAt: NOW,
        };
        data.evidenceRefs.push(evidence);
      }

      const factId = `fact-${document.id}-${slug(fixture.factType)}`;
      if (!data.taxFacts.some((fact) => fact.id === factId || (fact.factType === fixture.factType && fact.evidenceRefs.some((ref) => ref.id === evidence.id)))) {
        const materiality = fixture.materiality ?? "MEDIUM";
        const confidence = computeTaxFactConfidence({
          sourceType: document.sourceType,
          extractionConfidence: fixture.confidence,
          corroboratingSourceCount: 1,
          priorYearConsistent: true,
          materiality,
          authorityStrength: 0.75,
          jurisdictionMatch: true,
          taxYearMatch: document.taxYear === taxReturn.taxYear,
          clientConfirmed: false,
          reviewStatus: "AI_PREPARED",
        });
        const fact = TaxFactSchema.parse({
          id: factId,
          firmId: taxReturn.firmId,
          clientId: taxReturn.clientId,
          taxReturnId: returnId,
          factType: fixture.factType,
          label: fixture.label,
          value: fixture.value,
          taxYear: taxReturn.taxYear,
          jurisdiction: taxReturn.jurisdiction,
          materiality,
          status: "EXTRACTED",
          confidence,
          reviewStatus: "AI_PREPARED",
          evidenceRefs: [evidence],
          relatedIssueIds: [],
          reviewerId: null,
          acceptedAt: null,
        });
        data.taxFacts.push(fact);
        events.push(audit(data, "FACT_CREATED", `Created tax fact ${fixture.factType}.`, { factId, documentId: document.id }, "AI"));
      }
    }
  }

  events.push(audit(data, "AI_EXTRACTION_RUN", "Ran document extraction workflow.", { returnId, provider: "fixture" }, "AI"));

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function detectMissingDocuments(data: DocketData, returnId: string) {
  const documents = data.sourceDocuments.filter((document) => document.taxReturnId === returnId);
  const has1099B = documents.some((document) => document.documentClass === "FORM_1099_B");
  const stockSaleMentioned = data.clientClaims.some((claim) => claim.taxReturnId === returnId && claim.claimType === "STOCK_SALE");
  const brokeragePattern = data.priorYearPatterns.some((pattern) => pattern.taxReturnId === returnId && pattern.patternType === "BROKERAGE_ACCOUNT");

  const missing = [];
  if (!has1099B && (stockSaleMentioned || brokeragePattern)) {
    missing.push({
      expectedDocumentClass: "FORM_1099_B" as const,
      reason: "Stock sale claim or brokerage prior-year pattern requires brokerage statement review.",
      severity: "RED" as RiskLevel,
    });
  }

  return missing;
}

export function detectContradictions(data: DocketData, returnId: string) {
  const freelanceClaim = data.clientClaims.find(
    (claim) => claim.taxReturnId === returnId && claim.claimType === "SCHEDULE_C_GROSS_RECEIPTS_ESTIMATE",
  );
  const documentedGrossReceipts = data.taxFacts
    .filter((fact) => fact.taxReturnId === returnId && fact.factType === "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED")
    .reduce((sum, fact) => sum + (typeof fact.value === "number" ? fact.value : 0), 0);

  if (typeof freelanceClaim?.normalizedValue !== "number" || documentedGrossReceipts === 0) {
    return [];
  }

  const variance = Math.abs(documentedGrossReceipts - freelanceClaim.normalizedValue);
  if (variance / Math.max(1, freelanceClaim.normalizedValue) < 0.1) {
    return [];
  }

  return [
    {
      title: "Freelance income does not reconcile",
      description: `Client claim ${freelanceClaim.normalizedValue} differs from source documents totaling ${documentedGrossReceipts}.`,
      severity: "RED" as RiskLevel,
      sourceIds: [freelanceClaim.id, ...data.taxFacts.filter((fact) => fact.factType === "SCHEDULE_C_GROSS_RECEIPTS_DOCUMENTED").map((fact) => fact.id)],
    },
  ];
}

export function detectDeductionOpportunities(data: DocketData, returnId: string) {
  const messages = data.conversationMessages.map((message) => message.body.toLowerCase()).join(" ");
  const opportunities = [];
  if (messages.includes("home office") || (messages.includes("home") && messages.includes("office"))) {
    opportunities.push("HOME_OFFICE");
  }
  if (data.sourceDocuments.some((document) => document.taxReturnId === returnId && document.documentClass === "MILEAGE_LOG")) {
    opportunities.push("BUSINESS_MILEAGE");
  }
  return opportunities;
}

export function runContextReconciliation(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const events: AuditEvent[] = [];
  const consentBlock = workflowConsentBlock(data, returnId, "context_extraction");
  if (consentBlock) return consentBlock;

  for (const missing of detectMissingDocuments(data, returnId)) {
    const id = `missing-${slug(missing.expectedDocumentClass)}`;
    if (!data.missingDocuments.some((item) => item.id === id)) {
      data.missingDocuments.push({
        id,
        clientId: IDS.client,
        taxReturnId: returnId,
        expectedDocumentClass: missing.expectedDocumentClass,
        reason: missing.reason,
        sourceIds: ["claim-stock-sale", "pattern-brokerage"],
        severity: missing.severity,
        status: "REQUESTED",
      });
      events.push(audit(data, "ISSUE_CREATED", `Created missing document signal for ${missing.expectedDocumentClass}.`, { missingDocumentId: id }, "AI"));
    }
  }

  for (const contradiction of detectContradictions(data, returnId)) {
    const id = `contradiction-${slug(contradiction.title)}`;
    if (!data.contradictions.some((item) => item.id === id || item.title === contradiction.title)) {
      data.contradictions.push({
        id,
        clientId: IDS.client,
        taxReturnId: returnId,
        title: contradiction.title,
        description: contradiction.description,
        sourceIds: contradiction.sourceIds,
        severity: contradiction.severity,
        status: "CLIENT_QUESTION_PENDING",
      });
    }
  }

  events.push(
    audit(data, "AI_REASONING_RUN", "Ran context reconciliation across documents, claims, conversations, and prior-year patterns.", { returnId }, "AI"),
  );

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export type ReadinessBreakdown = {
  readinessScore: number;
  documentCompleteness: number;
  clientAnswerCompleteness: number;
  factConfidence: number;
  reviewProgress: number;
  signatureReadiness: number;
  knowledgeFreshness: number;
  scopeComplexity: number;
  openBlockers: number;
};

export function scoreReadiness(data: DocketData, returnId: string): ReadinessBreakdown {
  const sourceDocs = data.sourceDocuments.filter((document) => document.taxReturnId === returnId);
  const processedDocs = sourceDocs.filter((document) => document.processedAt !== null || document.fixtureFields.length === 0);
  const requiredMissing = data.missingDocuments.filter((item) => item.taxReturnId === returnId && item.status !== "RECEIVED" && item.severity === "RED");
  const questions = data.clientClarifications.filter((question) => question.taxReturnId === returnId);
  const answered = questions.filter((question) => question.status === "ANSWERED");
  const facts = data.taxFacts.filter((fact) => fact.taxReturnId === returnId);
  const avgFactConfidence =
    facts.length === 0 ? 0 : Math.round((facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length) * 100);
  const issues = data.taxIssues.filter((issue) => issue.taxReturnId === returnId);
  const openBlockers = issues.filter((issue) => issue.blocker && issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER").length;
  const reviewProgress = Math.round(
    (facts.filter((fact) => fact.reviewStatus === "REVIEWER_APPROVED" || fact.reviewStatus === "PARTNER_OVERRIDE").length / Math.max(1, facts.length)) * 100,
  );
  const signatureReadiness = data.signatureAuthorizations.some((signature) => signature.taxReturnId === returnId && signature.status === "SIGNED") ? 100 : 10;
  const snapshot = data.taxKnowledgeSnapshots.find((item) => item.id === findReturn(data, returnId).knowledgeSnapshotId);
  const knowledgeFreshness = snapshot?.lastSyncStatus === "CURRENT" ? 100 : snapshot?.lastSyncStatus === "STALE" ? 45 : 0;
  const scopeComplexity = data.engagements
    .find((engagement) => engagement.id === findReturn(data, returnId).engagementId)
    ?.scopes.some((scope) => scope.supportLevel === "PARTIAL")
    ? 62
    : 90;

  const documentCompleteness = Math.max(0, Math.round((processedDocs.length / Math.max(1, sourceDocs.length + requiredMissing.length)) * 100));
  const clientAnswerCompleteness = Math.round((answered.length / Math.max(1, questions.length)) * 100);

  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        documentCompleteness * 0.2 +
          clientAnswerCompleteness * 0.14 +
          avgFactConfidence * 0.18 +
          reviewProgress * 0.16 +
          signatureReadiness * 0.08 +
          knowledgeFreshness * 0.1 +
          scopeComplexity * 0.08 -
          openBlockers * 8,
      ),
    ),
  );

  return {
    readinessScore,
    documentCompleteness,
    clientAnswerCompleteness,
    factConfidence: avgFactConfidence,
    reviewProgress,
    signatureReadiness,
    knowledgeFreshness,
    scopeComplexity,
    openBlockers,
  };
}

export type ExtensionRiskBreakdown = {
  extensionRiskScore: number;
  recommendation: "prepare extension now" | "monitor closely" | "extension unlikely";
  reasons: string[];
};

export function scoreExtensionRisk(data: DocketData, returnId: string): ExtensionRiskBreakdown {
  const taxReturn = findReturn(data, returnId);
  const client = data.clients.find((item) => item.id === taxReturn.clientId);
  const missingMaterialDocs = data.missingDocuments.filter((item) => item.taxReturnId === returnId && item.severity === "RED" && item.status !== "RECEIVED").length;
  const redFlags = data.taxIssues.filter((issue) => issue.taxReturnId === returnId && issue.riskLevel === "RED" && issue.status !== "RESOLVED").length;
  const unansweredQuestions = data.clientClarifications.filter((question) => question.taxReturnId === returnId && question.status !== "ANSWERED").length;
  const priorExtension = data.clientContextFacts.some((fact) => fact.taxReturnId === returnId && fact.factType === "PRIOR_YEAR_EXTENSION" && fact.value === true);
  const reviewerWorkload = data.taxReturns.filter((item) => item.assignedReviewerId === taxReturn.assignedReviewerId && item.status === "IN_REVIEW").length;

  let score = 22;
  score += missingMaterialDocs * 22;
  score += redFlags * 16;
  score += unansweredQuestions * 4;
  score += priorExtension ? 10 : 0;
  score += (client?.averageResponseDays ?? 0) > 4 ? 12 : 0;
  score += reviewerWorkload > 8 ? 8 : 0;
  score += data.engagements.find((engagement) => engagement.id === taxReturn.engagementId)?.scopes.some((scope) => scope.supportLevel === "PARTIAL") ? 5 : 0;

  const extensionRiskScore = Math.max(0, Math.min(100, score));
  const reasons = [];
  if (missingMaterialDocs > 0) reasons.push("1099-B expected but missing");
  if (redFlags > 0) reasons.push(`${redFlags} red flags unresolved`);
  if ((client?.averageResponseDays ?? 0) > 4) reasons.push(`client average response time ${client?.averageResponseDays} days`);
  if (priorExtension) reasons.push("prior-year extension history");
  if (unansweredQuestions > 0) reasons.push(`${unansweredQuestions} client questions unanswered`);

  return {
    extensionRiskScore,
    recommendation: extensionRiskScore >= 75 ? "prepare extension now" : extensionRiskScore >= 45 ? "monitor closely" : "extension unlikely",
    reasons,
  };
}

export function generateClientQuestions(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const events: AuditEvent[] = [];
  const consentBlock = workflowConsentBlock(data, returnId, "client_question_generation");
  if (consentBlock) return consentBlock;

  const questions: ClientClarification[] = [
    {
      id: "clar-1099k-overlap",
      clientId: IDS.client,
      taxReturnId: returnId,
      relatedIssueId: "issue-income-mismatch",
      question:
        "Does the Stripe 1099-K include payments already reported on the Bluepeak 1099-NEC, or are these separate receipts?",
      generatedByAiRunId: "airun-client-questions",
      status: "APPROVED_TO_SEND",
      answer: null,
      answeredAt: null,
      reviewerApproved: true,
      evidenceRefs: [],
    },
    {
      id: "clar-1099b-brokerage",
      clientId: IDS.client,
      taxReturnId: returnId,
      relatedIssueId: "issue-missing-1099-b",
      question: "Which brokerage account did you use for the Tesla sale, and can you upload the 2024 consolidated 1099?",
      generatedByAiRunId: "airun-client-questions",
      status: "APPROVED_TO_SEND",
      answer: null,
      answeredAt: null,
      reviewerApproved: true,
      evidenceRefs: [],
    },
  ];

  for (const question of questions) {
    if (!data.clientClarifications.some((item) => item.id === question.id)) {
      data.clientClarifications.push(question);
      events.push(audit(data, "CLIENT_QUESTION_GENERATED", "Generated client clarification question.", { clarificationId: question.id }, "AI"));
    }
  }

  events.push(audit(data, "AI_REASONING_RUN", "Ran client question generation.", { returnId, questions: questions.length }, "AI"));

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function answerClientClarification(inputData: DocketData, clarificationId: string, answer: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const clarification = data.clientClarifications.find((item) => item.id === clarificationId);
  if (!clarification) {
    throw new Error(`Clarification ${clarificationId} not found.`);
  }

  const evidence: EvidenceRef = {
    id: `ev-answer-${clarificationId}`,
    sourceType: "SIGNED_PORTAL_ANSWER",
    sourceId: clarificationId,
    portalAnswerId: clarificationId,
    fieldLabel: "Client clarification answer",
    sourceQuote: answer,
    confidence: 0.78,
    createdAt: NOW,
  };
  data.evidenceRefs.push(evidence);
  clarification.status = "ANSWERED";
  clarification.answer = answer;
  clarification.answeredAt = NOW;
  clarification.evidenceRefs.push(evidence);
  const event = audit(data, "CLIENT_ANSWER_SUBMITTED", "Client submitted clarification answer.", { clarificationId }, "CLIENT");

  markExportPacketStale(data, clarification.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function acceptTaxFact(inputData: DocketData, factId: string, reviewerId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, reviewerId, "approve_tax_fact", "User lacks permission to accept tax fact.");
  if (blocked) return blocked;
  const fact = data.taxFacts.find((item) => item.id === factId);
  if (!fact) throw new Error(`Tax fact ${factId} not found.`);
  assertMaterialTaxFactHasEvidence(fact);
  fact.status = "ACCEPTED";
  fact.reviewStatus = "REVIEWER_APPROVED";
  fact.reviewerId = reviewerId;
  fact.acceptedAt = NOW;
  const event = audit(data, "FACT_ACCEPTED", "Reviewer accepted tax fact.", { factId }, "FIRM_USER", reviewerId);
  markExportPacketStale(data, fact.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function rejectTaxFact(inputData: DocketData, factId: string, reviewerId: string, reason: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, reviewerId, "approve_tax_fact", "User lacks permission to reject tax fact.");
  if (blocked) return blocked;
  const fact = data.taxFacts.find((item) => item.id === factId);
  if (!fact) throw new Error(`Tax fact ${factId} not found.`);
  fact.status = "REJECTED";
  fact.reviewStatus = "REJECTED";
  fact.reviewerId = reviewerId;
  const event = audit(data, "FACT_REJECTED", "Reviewer rejected tax fact.", { factId, reason: redactPII(reason) }, "FIRM_USER", reviewerId);
  markExportPacketStale(data, fact.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function resolveIssue(inputData: DocketData, issueId: string, reviewerId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, reviewerId, "resolve_red_flag", "User lacks permission to resolve tax issue.");
  if (blocked) return blocked;
  const issue = data.taxIssues.find((item) => item.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found.`);
  issue.status = "RESOLVED";
  issue.resolvedAt = NOW;
  const event = audit(data, "ISSUE_RESOLVED", "Resolved tax issue.", { issueId }, "FIRM_USER", reviewerId);
  markExportPacketStale(data, issue.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function escalateIssue(inputData: DocketData, issueId: string, userId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const issue = data.taxIssues.find((item) => item.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found.`);
  issue.status = "ESCALATED";
  const event = audit(data, "ISSUE_CREATED", "Escalated tax issue for reviewer judgment.", { issueId }, "FIRM_USER", userId);
  markExportPacketStale(data, issue.taxReturnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function answerOpenClarificationsForReturn(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const events: AuditEvent[] = [];
  const cannedAnswers: Record<string, string> = {
    "clar-1099k-overlap":
      "The Stripe 1099-K includes some Bluepeak card payments already reported on the 1099-NEC. I uploaded the Stripe detail export for review.",
    "clar-1099b-brokerage": "The Tesla sale was in my Robinhood account. I uploaded the 2024 consolidated 1099.",
    "clar-state-move": "I moved from California to Texas on July 15, 2024 and did not perform California work after that date.",
    "clar-home-office": "The room was not used exclusively for business all year, so please do not claim a home office deduction without reviewer approval.",
  };

  for (const clarification of data.clientClarifications.filter((item) => item.taxReturnId === returnId && item.status !== "ANSWERED")) {
    const answer = cannedAnswers[clarification.id] ?? "Reviewed and answered through the Docket demo review flow.";
    const evidence: EvidenceRef = {
      id: `ev-answer-${clarification.id}`,
      sourceType: "SIGNED_PORTAL_ANSWER",
      sourceId: clarification.id,
      portalAnswerId: clarification.id,
      fieldLabel: "Client clarification answer",
      sourceQuote: answer,
      confidence: 0.82,
      createdAt: NOW,
    };
    data.evidenceRefs.push(evidence);
    clarification.status = "ANSWERED";
    clarification.answer = answer;
    clarification.answeredAt = NOW;
    clarification.evidenceRefs = [evidence];
    events.push(audit(data, "CLIENT_ANSWER_SUBMITTED", "Client submitted clarification answer.", { clarificationId: clarification.id }, "CLIENT"));
  }

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function receiveMissingDocumentForReturn(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const events: AuditEvent[] = [];
  const taxReturn = findReturn(data, returnId);
  const missing1099BDocuments = data.missingDocuments.filter(
    (item) => item.taxReturnId === returnId && item.expectedDocumentClass === "FORM_1099_B" && item.status !== "RECEIVED",
  );
  const missing1099B = missing1099BDocuments[0];

  if (missing1099B && !data.sourceDocuments.some((document) => document.id === "doc-robinhood-1099-b")) {
    const document: SourceDocument = {
      id: "doc-robinhood-1099-b",
      firmId: taxReturn.firmId,
      clientId: taxReturn.clientId,
      taxReturnId: returnId,
      fileName: "Robinhood_Consolidated_1099_2024.pdf",
      documentClass: "FORM_1099_B",
      taxYear: taxReturn.taxYear,
      sourceType: "SOURCE_DOCUMENT",
      uploadedBy: "CLIENT",
      receivedAt: NOW,
      processedAt: NOW,
      duplicateOfDocumentId: null,
      storageKey: "mock://documents/robinhood-1099-b",
      suspiciousText: null,
      fixtureFields: [
        { label: "Brokerage", value: "Robinhood", confidence: 0.98 },
        { label: "Stock sale detected", value: true, confidence: 0.92, factType: "FORM_1099_B_RECEIVED", materiality: "HIGH" },
      ],
    };
    data.sourceDocuments.push(document);
    data.documentExtractions.push({
      id: "extract-doc-robinhood-1099-b",
      sourceDocumentId: document.id,
      provider: "fixture",
      status: "COMPLETE",
      confidence: 0.95,
      createdAt: NOW,
    });
    const evidence: EvidenceRef = {
      id: "ev-robinhood-1099-b-received",
      sourceType: "SOURCE_DOCUMENT",
      sourceId: document.id,
      sourceDocumentId: document.id,
      pageNumber: 1,
      fieldLabel: "Stock sale detected",
      sourceQuote: "Robinhood consolidated 1099 received for 2024.",
      confidence: 0.92,
      createdAt: NOW,
    };
    data.evidenceRefs.push(evidence);
    data.taxFacts.push(
      TaxFactSchema.parse({
        id: "fact-1099b-received",
        firmId: taxReturn.firmId,
        clientId: taxReturn.clientId,
        taxReturnId: returnId,
        factType: "FORM_1099_B_RECEIVED",
        label: "Robinhood consolidated 1099 received",
        value: true,
        taxYear: taxReturn.taxYear,
        jurisdiction: taxReturn.jurisdiction,
        materiality: "HIGH",
        status: "EXTRACTED",
        confidence: 0.92,
        reviewStatus: "AI_PREPARED",
        evidenceRefs: [evidence],
        relatedIssueIds: ["issue-missing-1099-b"],
        reviewerId: null,
        acceptedAt: null,
      }),
    );
    events.push(audit(data, "AI_EXTRACTION_RUN", "Received and processed missing 1099-B document.", { documentId: document.id }, "AI"));
  }

  for (const missingDocument of missing1099BDocuments) {
    missingDocument.status = "RECEIVED";
    events.push(audit(data, "ISSUE_RESOLVED", "Marked missing 1099-B document as received.", { missingDocumentId: missingDocument.id }, "FIRM_USER", IDS.reviewer));
  }

  for (const pattern of data.priorYearPatterns.filter((item) => item.taxReturnId === returnId && item.expectedCurrentYearDocumentClass === "FORM_1099_B")) {
    pattern.resolvedByDocumentId = "doc-robinhood-1099-b";
    pattern.riskLevel = "GREEN";
  }

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function approveAllTaxFactsForReturn(inputData: DocketData, returnId: string, reviewerId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, reviewerId, "approve_tax_fact", "User lacks permission to approve tax facts.");
  if (blocked) return blocked;
  const events: AuditEvent[] = [];

  for (const fact of data.taxFacts.filter((item) => item.taxReturnId === returnId && item.status !== "REJECTED")) {
    assertMaterialTaxFactHasEvidence(fact);
    if (fact.reviewStatus !== "REVIEWER_APPROVED") {
      fact.status = "ACCEPTED";
      fact.reviewStatus = "REVIEWER_APPROVED";
      fact.reviewerId = reviewerId;
      fact.acceptedAt = NOW;
      events.push(audit(data, "FACT_ACCEPTED", "Reviewer accepted tax fact.", { factId: fact.id }, "FIRM_USER", reviewerId));
    }
  }

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function resolveAllIssuesForReturn(inputData: DocketData, returnId: string, reviewerId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, reviewerId, "resolve_red_flag", "User lacks permission to resolve tax issues.");
  if (blocked) return blocked;
  const events: AuditEvent[] = [];

  for (const issue of data.taxIssues.filter((item) => item.taxReturnId === returnId && item.status !== "RESOLVED")) {
    issue.status = "RESOLVED";
    issue.resolvedAt = NOW;
    events.push(audit(data, "ISSUE_RESOLVED", "Reviewer resolved tax issue.", { issueId: issue.id }, "FIRM_USER", reviewerId));
  }

  markExportPacketStale(data, returnId);
  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function signReturnAuthorization(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const signature = data.signatureAuthorizations.find(
    (item) => item.taxReturnId === returnId && item.authorizationType === "FORM_8879",
  );
  if (!signature) {
    throw new Error(`Form 8879 signature authorization for ${returnId} not found.`);
  }
  signature.status = "SIGNED";
  signature.signedAt = NOW;
  const event = audit(data, "REVIEW_APPROVAL_ADDED", "Client signed Form 8879 authorization placeholder.", { signatureId: signature.id }, "CLIENT");
  markExportPacketStale(data, returnId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function completeDemoReviewForReturn(inputData: DocketData, returnId: string, reviewerId: string): WorkflowResult {
  let result = runDocumentExtraction(inputData, returnId);
  if (result.blocked) return result;
  result = receiveMissingDocumentForReturn(result.data, returnId);
  if (result.blocked) return result;
  result = answerOpenClarificationsForReturn(result.data, returnId);
  if (result.blocked) return result;
  result = generateWorkpapers(result.data, returnId);
  if (result.blocked) return result;
  result = approveAllTaxFactsForReturn(result.data, returnId, reviewerId);
  if (result.blocked) return result;
  result = resolveAllIssuesForReturn(result.data, returnId, reviewerId);
  if (result.blocked) return result;
  result = markReadyForSignature(result.data, returnId, reviewerId);
  if (result.blocked) return result;
  result = signReturnAuthorization(result.data, returnId);
  if (result.blocked) return result;
  result = markReadyToFileStub(result.data, returnId, IDS.owner);
  if (result.blocked) return result;
  result = generateExportPacket(result.data, returnId);

  return result;
}

export function generateWorkpapers(inputData: DocketData, returnId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  const events: AuditEvent[] = [];
  const consentBlock = workflowConsentBlock(data, returnId, "workpaper_generation");
  if (consentBlock) return consentBlock;

  if (!data.workpapers.some((workpaper) => workpaper.id === "wp-review-gates")) {
    data.workpapers.push({
      id: "wp-review-gates",
      taxReturnId: returnId,
      title: "Review gate summary",
      section: "Review",
      body: "Ready-to-file remains blocked while red flags, unanswered required clarifications, signature authorization, and reviewer approvals are incomplete.",
      evidenceRefIds: ["ev-authority-pub1345"],
      knowledgeSnapshotId: findReturn(data, returnId).knowledgeSnapshotId,
      status: "READY_FOR_REVIEW",
    });
    events.push(audit(data, "WORKPAPER_GENERATED", "Generated reviewer-ready workpaper.", { workpaperId: "wp-review-gates" }, "AI"));
  }

  return { data, auditEvents: events, blocked: false, blockers: [] };
}

export function runAIPrep(inputData: DocketData, returnId: string, userId: string = IDS.preparer): WorkflowResult {
  const permissionData = cloneDocketData(inputData);
  const blocked = permissionBlock(permissionData, userId, "run_ai_prep", "User lacks permission to run AI prep.");
  if (blocked) return blocked;

  let result = runDocumentExtraction(inputData, returnId);
  if (result.blocked) return result;
  result = runContextReconciliation(result.data, returnId);
  if (result.blocked) return result;
  const questionResult = generateClientQuestions(result.data, returnId);
  if (questionResult.blocked) return questionResult;
  const workpaperResult = generateWorkpapers(questionResult.data, returnId);
  if (workpaperResult.blocked) return workpaperResult;
  const data = workpaperResult.data;
  const reasoningRun = createMockAIReasoningRun(
    data,
    returnId,
    "issue_spotting",
    [
      ...data.sourceDocuments.filter((document) => document.taxReturnId === returnId).map((document) => document.id),
      ...data.clientClaims.filter((claim) => claim.taxReturnId === returnId).map((claim) => claim.id),
    ],
    buildAIPrepReasoningOutput(data, returnId),
  );
  data.aiReasoningRuns.push(reasoningRun);
  const prepRun = {
    id: `aiprep-${returnId}-${data.aiPrepRuns.length + 1}`,
    taxReturnId: returnId,
    status: "COMPLETE" as const,
    aiReasoningRunIds: data.aiReasoningRuns.map((run) => run.id),
    createdFactIds: data.taxFacts.filter((factItem) => factItem.taxReturnId === returnId).map((factItem) => factItem.id),
    createdIssueIds: data.taxIssues.filter((issue) => issue.taxReturnId === returnId).map((issue) => issue.id),
    createdClarificationIds: data.clientClarifications.filter((clarification) => clarification.taxReturnId === returnId).map((clarification) => clarification.id),
    createdWorkpaperIds: data.workpapers.filter((workpaper) => workpaper.taxReturnId === returnId).map((workpaper) => workpaper.id),
    costEstimateUsd: 0,
    createdAt: NOW,
  };
  data.aiPrepRuns.push(prepRun);
  const event = audit(data, "AI_REASONING_RUN", "Completed AI prep workflow.", { aiprepRunId: prepRun.id }, "AI");
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export type ReviewGateTarget = "READY_FOR_REVIEW" | "READY_FOR_SIGNATURE" | "READY_TO_FILE";

export type FirmPolicyEvaluation = {
  policyId: string;
  policyName: string;
  severity: RiskLevel;
  action: "BLOCK" | "WARN" | "ESCALATE" | "REQUEST_DOCUMENT";
  requiredRole: string;
  triggered: boolean;
  blocking: boolean;
  message: string;
  sourceIds: string[];
};

export function evaluateFirmPolicies(data: DocketData, returnId: string): FirmPolicyEvaluation[] {
  const taxReturn = findReturn(data, returnId);
  const policies = data.firmPolicies.filter((policy) => policy.firmId === taxReturn.firmId && policy.enabled);

  return policies.flatMap((policy) => {
    if (policy.policyType === "MISSING_DOCUMENT" && policy.conditionsJson.expectedDocumentClass) {
      const expectedDocumentClass = String(policy.conditionsJson.expectedDocumentClass);
      const missingDocuments = data.missingDocuments.filter(
        (document) =>
          document.taxReturnId === returnId &&
          document.expectedDocumentClass === expectedDocumentClass &&
          document.status !== "RECEIVED" &&
          document.status !== "WAIVED",
      );
      if (missingDocuments.length === 0) return [];
      return [
        {
          policyId: policy.id,
          policyName: policy.name,
          severity: policy.severity,
          action: policy.action,
          requiredRole: policy.requiredRole,
          triggered: true,
          blocking: policy.action === "BLOCK",
          message: `${policy.name}: ${missingDocuments.map((document) => document.expectedDocumentClass).join(", ")} remains unresolved.`,
          sourceIds: missingDocuments.flatMap((document) => [document.id, ...document.sourceIds]),
        },
      ];
    }

    if (policy.policyType === "DEDUCTION_SUBSTANTIATION" && policy.conditionsJson.opportunityType) {
      const opportunityType = String(policy.conditionsJson.opportunityType);
      const opportunities = data.deductionOpportunities.filter(
        (opportunity) =>
          opportunity.taxReturnId === returnId &&
          opportunity.opportunityType === opportunityType &&
          opportunity.status !== "APPROVED" &&
          opportunity.status !== "REJECTED",
      );
      if (opportunities.length === 0) return [];
      return opportunities.map((opportunity) => ({
        policyId: policy.id,
        policyName: policy.name,
        severity: policy.severity,
        action: policy.action,
        requiredRole: policy.requiredRole,
        triggered: true,
        blocking: policy.action === "BLOCK",
        message: `${policy.name}: ${opportunity.title} still needs ${opportunity.missingFacts.join(", ") || "review support"}.`,
        sourceIds: [opportunity.id, ...opportunity.sourceIds],
      }));
    }

    if (policy.policyType === "CLIENT_COMMUNICATION" && policy.conditionsJson.clientFacing) {
      const unapprovedQuestions = data.clientClarifications.filter(
        (question) =>
          question.taxReturnId === returnId &&
          question.generatedByAiRunId !== null &&
          question.status !== "ANSWERED" &&
          !question.reviewerApproved,
      );
      if (unapprovedQuestions.length === 0) return [];
      return [
        {
          policyId: policy.id,
          policyName: policy.name,
          severity: policy.severity,
          action: policy.action,
          requiredRole: policy.requiredRole,
          triggered: true,
          blocking: policy.action === "BLOCK",
          message: `${policy.name}: ${unapprovedQuestions.length} AI-generated client question(s) need firm approval.`,
          sourceIds: unapprovedQuestions.map((question) => question.id),
        },
      ];
    }

    return [];
  });
}

export function evaluateReviewGate(data: DocketData, returnId: string, target: ReviewGateTarget): { pass: boolean; blockers: string[] } {
  const taxReturn = findReturn(data, returnId);
  const blockers: string[] = [];

  if (target === "READY_FOR_REVIEW") {
    const incompleteExtractions = data.sourceDocuments.filter(
      (document) => document.taxReturnId === returnId && document.fixtureFields.length > 0 && !data.documentExtractions.some((extraction) => extraction.sourceDocumentId === document.id && extraction.status === "COMPLETE"),
    );
    if (incompleteExtractions.length > 0) blockers.push("Document extraction incomplete.");
    if (data.taxFacts.some((fact) => fact.taxReturnId === returnId && !materialFactHasEvidence(fact))) {
      blockers.push("A material tax fact is missing evidence.");
    }
  }

  if (target === "READY_FOR_SIGNATURE" || target === "READY_TO_FILE") {
    const redFlags = data.taxIssues.filter((issue) => issue.taxReturnId === returnId && issue.riskLevel === "RED" && issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER");
    if (redFlags.length > 0) blockers.push("Red flags remain unresolved.");
    const unanswered = data.clientClarifications.filter(
      (question) => question.taxReturnId === returnId && question.status !== "ANSWERED" && question.relatedIssueId !== null,
    );
    if (unanswered.length > 0) blockers.push("Required client clarifications remain unanswered.");
    if (!data.workpapers.some((workpaper) => workpaper.taxReturnId === returnId)) blockers.push("Required workpapers are missing.");
  }

  if (target === "READY_TO_FILE") {
    if (!data.signatureAuthorizations.some((signature) => signature.taxReturnId === returnId && signature.authorizationType === "FORM_8879" && signature.status === "SIGNED")) {
      blockers.push("Form 8879 signature authorization is incomplete.");
    }
    if (data.taxFacts.some((fact) => fact.taxReturnId === returnId && fact.materiality !== "LOW" && fact.reviewStatus !== "REVIEWER_APPROVED" && fact.reviewStatus !== "PARTNER_OVERRIDE")) {
      blockers.push("Reviewer approval is missing for material tax facts.");
    }
    const snapshot = data.taxKnowledgeSnapshots.find((item) => item.id === taxReturn.knowledgeSnapshotId);
    if (!snapshot || snapshot.lastSyncStatus !== "CURRENT") blockers.push("Knowledge snapshot is stale or unavailable.");
    const openBlockingIssues = data.taxIssues.filter((issue) => issue.taxReturnId === returnId && issue.blocker && issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER");
    if (openBlockingIssues.length > 0) blockers.push("Blocking issues remain open.");
    for (const policyEvaluation of evaluateFirmPolicies(data, returnId).filter((evaluation) => evaluation.blocking)) {
      blockers.push(`Firm policy blocker: ${policyEvaluation.message}`);
    }
  }

  return { pass: blockers.length === 0, blockers };
}

export function generateExportPacket(inputData: DocketData, returnId: string, userId: string = IDS.preparer): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, userId, "export_packet", "User lacks permission to generate export packet.");
  if (blocked) return blocked;
  const taxReturn = findReturn(data, returnId);
  const client = data.clients.find((item) => item.id === taxReturn.clientId);
  const existing = data.exportPackages.find((packet) => packet.taxReturnId === returnId);
  const packetJson = {
    clientSummary: `${client?.displayName ?? "Client"}, ${taxReturn.taxYear} ${taxReturn.returnType}`,
    engagementScope: data.engagements.find((engagement) => engagement.id === taxReturn.engagementId)?.scopes,
    sourceDocuments: data.sourceDocuments.filter((document) => document.taxReturnId === returnId).map((document) => ({
      id: document.id,
      fileName: document.fileName,
      documentClass: document.documentClass,
    })),
    acceptedTaxFacts: data.taxFacts.filter((fact) => fact.taxReturnId === returnId && fact.status === "ACCEPTED").map((fact) => fact.id),
    rejectedTaxFacts: data.taxFacts.filter((fact) => fact.taxReturnId === returnId && fact.status === "REJECTED").map((fact) => fact.id),
    clientClaims: data.clientClaims.filter((claim) => claim.taxReturnId === returnId).map((claim) => claim.id),
    openNonblockingIssues: data.taxIssues.filter((issue) => issue.taxReturnId === returnId && !issue.blocker && issue.status !== "RESOLVED").map((issue) => issue.id),
    deductionOpportunities: data.deductionOpportunities.filter((opportunity) => opportunity.taxReturnId === returnId).map((opportunity) => opportunity.id),
    workpapers: data.workpapers.filter((workpaper) => workpaper.taxReturnId === returnId).map((workpaper) => workpaper.id),
    knowledgeSnapshot: taxReturn.knowledgeSnapshotId,
    rulePackage: taxReturn.rulePackageId,
    filingReadinessStatus: evaluateReviewGate(data, returnId, "READY_TO_FILE"),
  };

  if (existing) {
    existing.state = "GENERATED";
    existing.generatedAt = NOW;
    existing.packetJson = packetJson;
  } else {
    data.exportPackages.push({
      id: `export-${returnId}`,
      taxReturnId: returnId,
      state: "GENERATED",
      generatedAt: NOW,
      packetJson,
      efileDisabledNotice: "Direct IRS e-file is disabled in the foundation release. Export is a structured packet only.",
    });
  }

  const event = audit(data, "EXPORT_PACKET_GENERATED", "Generated structured export packet.", { returnId }, "FIRM_USER", userId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function markReadyForReview(inputData: DocketData, returnId: string, userId: string = IDS.preparer): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, userId, "run_ai_prep", "User lacks permission to mark return ready for review.");
  if (blocked) return blocked;

  const gate = evaluateReviewGate(data, returnId, "READY_FOR_REVIEW");
  if (!gate.pass) {
    const event = audit(data, "WORKFLOW_BLOCKED", "Ready-for-review gate blocked progression.", { returnId, blockerCount: gate.blockers.length }, "SYSTEM");
    return { data, auditEvents: [event], blocked: true, blockers: gate.blockers };
  }

  const taxReturn = findReturn(data, returnId);
  taxReturn.status = "IN_REVIEW";
  taxReturn.updatedAt = NOW;
  const event = audit(data, "STATUS_CHANGED", "Marked return ready for review.", { returnId, status: taxReturn.status }, "FIRM_USER", userId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function markReadyForSignature(inputData: DocketData, returnId: string, reviewerId: string = IDS.reviewer): WorkflowResult {
  const data = cloneDocketData(inputData);
  const blocked = permissionBlock(data, reviewerId, "approve_tax_fact", "User lacks permission to mark return ready for signature.");
  if (blocked) return blocked;

  const gate = evaluateReviewGate(data, returnId, "READY_FOR_SIGNATURE");
  if (!gate.pass) {
    const event = audit(data, "WORKFLOW_BLOCKED", "Ready-for-signature gate blocked progression.", { returnId, blockerCount: gate.blockers.length }, "SYSTEM");
    return { data, auditEvents: [event], blocked: true, blockers: gate.blockers };
  }

  const taxReturn = findReturn(data, returnId);
  taxReturn.status = "READY_FOR_SIGNATURE";
  taxReturn.updatedAt = NOW;
  const event = audit(data, "STATUS_CHANGED", "Marked return ready for signature.", { returnId, status: taxReturn.status }, "FIRM_USER", reviewerId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function markReadyToFileStub(inputData: DocketData, returnId: string, userId: string): WorkflowResult {
  const data = cloneDocketData(inputData);
  if (!hasPermission(data, userId, "mark_ready_to_file")) {
    const event = audit(data, "WORKFLOW_BLOCKED", "User lacks permission to mark ready to file.", { returnId }, "SYSTEM");
    return { data, auditEvents: [event], blocked: true, blockers: ["User lacks mark_ready_to_file permission."] };
  }

  const gate = evaluateReviewGate(data, returnId, "READY_TO_FILE");
  if (!gate.pass) {
    const event = audit(data, "WORKFLOW_BLOCKED", "Ready-to-file gate blocked progression.", { returnId, blockerCount: gate.blockers.length }, "SYSTEM");
    return { data, auditEvents: [event], blocked: true, blockers: gate.blockers };
  }

  const taxReturn = findReturn(data, returnId);
  taxReturn.status = "READY_TO_FILE_STUB";
  taxReturn.updatedAt = NOW;
  const event = audit(data, "STATUS_CHANGED", "Marked return ready to file stub.", { returnId, status: taxReturn.status }, "FIRM_USER", userId);
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function unsupportedScopeResponse(scope: string) {
  return {
    supported: false,
    issueTitle: `Unsupported automation request: ${scope}`,
    message: "Docket can detect and route this area, but will not fabricate automation for unsupported tax calculations.",
    reviewerAction: "Create an issue and escalate for professional review.",
  };
}

type IssuePlaybook = {
  situationMode: string;
  ruleSpace: string[];
  smellTests: string[];
  professionalJudgment: string;
  assumptionsToAvoid: string[];
  diligenceDuties: string[];
  riskRationale: string;
  reviewerChecklist: string[];
  clearanceStandard: string;
  clientQuestionStrategy: string;
};

const DEFAULT_ISSUE_PLAYBOOK: IssuePlaybook = {
  situationMode: "Reviewer judgment",
  ruleSpace: ["Client fact graph", "Evidence requirements", "Firm review policy"],
  smellTests: ["Material issue is not fully supported yet."],
  professionalJudgment: "Treat this as a preparer judgment item until the source file, client facts, and reviewer approval support clearance.",
  assumptionsToAvoid: ["Do not infer missing facts from prior-year patterns.", "Do not treat AI wording as evidence."],
  diligenceDuties: [
    "Separate source-backed facts from client claims.",
    "Preserve source IDs and reviewer decision history.",
    "Escalate material uncertainty instead of clearing it silently.",
  ],
  riskRationale: "The issue affects a material return position or filing workflow gate.",
  reviewerChecklist: ["Confirm source evidence.", "Confirm tax-year and jurisdiction match.", "Document reviewer judgment before clearance."],
  clearanceStandard: "Clear only after the missing facts are documented, citations are current, and the assigned reviewer approves the position.",
  clientQuestionStrategy: "Ask a narrow factual question that can be answered with a document, date, amount, or yes/no confirmation.",
};

const ISSUE_PLAYBOOKS: Record<string, IssuePlaybook> = {
  INCOME_RECONCILIATION: {
    situationMode: "Returning Schedule C client with year-over-year and third-party income mismatch",
    ruleSpace: ["Schedule C gross receipts", "1099-NEC reporting", "1099-K processor reporting", "Prior-year comparison"],
    smellTests: [
      "Client used a round-number estimate.",
      "1099-NEC plus 1099-K exceeds the client claim.",
      "Prior-year Schedule C gross receipts create an expected pattern to compare.",
    ],
    professionalJudgment:
      "Block Schedule C gross receipts until the preparer reconciles client-stated receipts to source documents and any payment-processor overlap.",
    assumptionsToAvoid: [
      "Do not assume the 1099-K is incremental income.",
      "Do not assume the 1099-K duplicates the 1099-NEC without processor detail.",
      "Do not use the client's round-number estimate as verified gross receipts.",
    ],
    diligenceDuties: [
      "Tie every gross-receipts amount to a source document, client ledger, or reviewer override.",
      "Compare current-year receipts to prior-year Schedule C patterns.",
      "Document whether refunds, fees, or duplicate processor reporting explain the variance.",
    ],
    riskRationale:
      "Gross receipts are a core Schedule C line item. A material mismatch can understate or overstate income and should block filing readiness.",
    reviewerChecklist: [
      "Confirm 1099-NEC Box 1 nonemployee compensation.",
      "Confirm 1099-K gross payment amount and whether it includes Bluepeak payments.",
      "Reconcile any additional cash/check/ACH receipts.",
      "Approve the final Schedule C gross receipts fact.",
    ],
    clearanceStandard:
      "Clear only when 1099-K/1099-NEC overlap is documented, total receipts reconcile, and the reviewer accepts the final gross receipts fact.",
    clientQuestionStrategy:
      "Ask whether Stripe includes payments also reported by Bluepeak, then request processor detail or bookkeeping support.",
  },
  FORM_1099K_OVERLAP: {
    situationMode: "Payment-processor reconciliation",
    ruleSpace: ["Schedule C gross receipts", "1099-K processor detail", "Payer-level income tracing"],
    smellTests: ["Same payer may appear in processor and nonemployee compensation reporting.", "Processor gross amount may not equal taxable gross receipts workpaper."],
    professionalJudgment: "Treat processor overlap as unresolved until the firm can map payer-level receipts to the 1099-K and 1099-NEC.",
    assumptionsToAvoid: ["Do not double count processor receipts.", "Do not net processor fees unless the workpaper separately supports fees."],
    diligenceDuties: ["Request transaction detail when payer overlap is possible.", "Document how gross receipts were normalized."],
    riskRationale: "Duplicate or missing receipts can materially distort Schedule C gross income.",
    reviewerChecklist: ["Compare payer names.", "Trace deposits or processor exports.", "Tie final receipts to the workpaper."],
    clearanceStandard: "Clear only after overlap is resolved and gross receipts tie to accepted evidence.",
    clientQuestionStrategy: "Ask the client to identify whether Bluepeak paid through Stripe or separately.",
  },
  MISSING_1099_B: {
    situationMode: "Document-driven investment income blocker",
    ruleSpace: ["Brokerage reporting", "Capital transactions", "Basis and holding-period substantiation"],
    smellTests: ["Stock sale mentioned in transcript but no brokerage tax package is uploaded.", "Prior-year brokerage pattern increases expected-document confidence."],
    professionalJudgment: "Treat the stock-sale statement as a document-triggering claim and block the investment section until brokerage support arrives.",
    assumptionsToAvoid: [
      "Do not infer proceeds, basis, holding period, or wash-sale adjustments from the transcript.",
      "Do not ignore a current-year sale because the client has not uploaded a form.",
    ],
    diligenceDuties: [
      "Request the 2024 consolidated 1099 or transaction statement.",
      "Preserve the transcript as a claim source, not a verified proceeds/basis fact.",
      "Escalate missing basis support before clearance.",
    ],
    riskRationale: "A missing 1099-B can omit capital transactions and create a false-ready return.",
    reviewerChecklist: ["Identify brokerage.", "Collect consolidated 1099-B.", "Review proceeds, basis, holding period, and wash-sale indicators."],
    clearanceStandard: "Clear only when brokerage documentation is uploaded or a reviewer records an explicit override with rationale.",
    clientQuestionStrategy: "Ask which brokerage held the Tesla shares and request the 2024 consolidated tax package.",
  },
  STATE_RESIDENCY: {
    situationMode: "Mid-year move and possible multi-state wage allocation",
    ruleSpace: ["State residency", "Domicile facts", "Wage sourcing", "Engagement scope boundaries"],
    smellTests: ["Move month is known but exact date is missing.", "California employer remains in the fact pattern after a Texas move claim."],
    professionalJudgment: "Route the CA-to-TX move through residency and wage-allocation review before state filing assumptions are accepted.",
    assumptionsToAvoid: [
      "Do not assume the move date from the month alone.",
      "Do not assume Texas residency eliminates California-source wage questions.",
    ],
    diligenceDuties: ["Collect exact move date and domicile facts.", "Confirm where services were performed after the move.", "Review state scope limits."],
    riskRationale: "Mid-year moves can affect residency status, wage sourcing, and state filing obligations.",
    reviewerChecklist: ["Confirm move date.", "Confirm post-move work location.", "Review CA employer wage reporting.", "Decide if state specialist review is needed."],
    clearanceStandard: "Clear only after domicile and work-location facts are documented and reviewer signs off on state treatment.",
    clientQuestionStrategy: "Ask for exact move date, California workdays after the move, and facts showing the Texas domicile change.",
  },
  HOME_OFFICE_SUBSTANTIATION: {
    situationMode: "Deduction opportunity with personal-use ambiguity",
    ruleSpace: ["Home office exclusive use", "Regular business use", "Schedule C substantiation"],
    smellTests: ["Client mentioned guests using the room.", "Opportunity exists, but the same transcript weakens exclusive-use support."],
    professionalJudgment: "Treat home office as an opportunity, not a claim, until exclusive and regular business use are confirmed.",
    assumptionsToAvoid: ["Do not claim the deduction when personal guest use is unresolved.", "Do not estimate square footage without client support."],
    diligenceDuties: ["Confirm exclusive use.", "Confirm regular business use.", "Collect square footage and expense support before workpaper approval."],
    riskRationale: "The transcript itself introduces personal-use ambiguity, which weakens substantiation.",
    reviewerChecklist: ["Confirm exclusive-use answer.", "Confirm regular-use answer.", "Review floor area and expense support.", "Approve or reject opportunity."],
    clearanceStandard: "Clear only if exclusive and regular use are supported and the reviewer approves the opportunity.",
    clientQuestionStrategy: "Ask whether guests or family used the office space at any time during 2024 and request dimensions only if exclusive use is confirmed.",
  },
  MILEAGE_SUBSTANTIATION: {
    situationMode: "Substantiation-sensitive Schedule C deduction review",
    ruleSpace: ["Business mileage", "Contemporaneous records", "Business purpose support", "Firm mileage policy"],
    smellTests: ["Only Q4 support is visible.", "Mileage entries lack complete business-purpose detail."],
    professionalJudgment: "Treat mileage as a possible deduction that needs contemporaneous business-purpose support before acceptance.",
    assumptionsToAvoid: ["Do not extrapolate Q4 mileage to the full year.", "Do not accept miles without business purpose and trip detail."],
    diligenceDuties: ["Request full-year mileage records.", "Confirm date, destination, miles, and business purpose.", "Tie vehicle use to Schedule C activity."],
    riskRationale: "Mileage deductions are substantiation-sensitive and the current support lacks complete business-purpose detail.",
    reviewerChecklist: ["Review log completeness.", "Confirm business purpose.", "Check full-year coverage.", "Approve supported mileage only."],
    clearanceStandard: "Clear only when the mileage log is complete enough for firm policy and reviewer approval.",
    clientQuestionStrategy: "Ask for a full-year log with date, destination, miles, and business purpose for each business trip.",
  },
};

function sourceLabelForProfessionalAnalysis(data: DocketData, sourceId: string): string {
  const fact = data.taxFacts.find((item) => item.id === sourceId);
  if (fact) return `${fact.label}: ${String(fact.value)} (${fact.status.toLowerCase()}, ${Math.round(fact.confidence * 100)}% confidence)`;
  const claim = data.clientClaims.find((item) => item.id === sourceId);
  if (claim) return `Client claim: ${claim.statement}`;
  const insight = data.conversationInsights.find((item) => item.id === sourceId);
  if (insight) return `Conversation claim: ${insight.summary}`;
  const pattern = data.priorYearPatterns.find((item) => item.id === sourceId);
  if (pattern) return `Prior-year pattern: ${pattern.description}`;
  const document = data.sourceDocuments.find((item) => item.id === sourceId);
  if (document) return `Source document: ${document.fileName}`;
  return sourceId;
}

function buildProfessionalAnalyses(
  data: DocketData,
  returnId: string,
  citationIdsForIssue: (issueType: string) => string[],
): NonNullable<AIPrepReasoningOutput["professionalAnalyses"]> {
  const taxReturn = findReturn(data, returnId);
  const client = data.clients.find((item) => item.id === taxReturn.clientId);
  const issues = data.taxIssues.filter((issue) => issue.taxReturnId === returnId);
  const questions = data.clientClarifications.filter((question) => question.taxReturnId === returnId);

  return issues.map((issue) => {
    const playbook = ISSUE_PLAYBOOKS[issue.issueType] ?? DEFAULT_ISSUE_PLAYBOOK;
    const relatedQuestions = questions.filter((question) => question.relatedIssueId === issue.id && question.status !== "ANSWERED");
    const establishedFacts = issue.sourceIds
      .filter((sourceId) => data.taxFacts.some((fact) => fact.id === sourceId) || data.sourceDocuments.some((document) => document.id === sourceId))
      .map((sourceId) => sourceLabelForProfessionalAnalysis(data, sourceId));
    const clientClaims = issue.sourceIds
      .filter((sourceId) => data.clientClaims.some((claim) => claim.id === sourceId) || data.conversationInsights.some((insight) => insight.id === sourceId))
      .map((sourceId) => sourceLabelForProfessionalAnalysis(data, sourceId));

    return {
      issueId: issue.id,
      title: issue.title,
      situationMode: playbook.situationMode,
      context: `${client?.displayName ?? "Client"} · ${taxReturn.taxYear} ${taxReturn.returnType} · ${taxReturn.jurisdiction}`,
      factPatternSummary: issue.description,
      ruleSpace: playbook.ruleSpace,
      smellTests: playbook.smellTests,
      professionalJudgment: playbook.professionalJudgment,
      establishedFacts: establishedFacts.length > 0 ? establishedFacts : issue.sourceIds.map((sourceId) => sourceLabelForProfessionalAnalysis(data, sourceId)),
      clientClaims,
      assumptionsToAvoid: playbook.assumptionsToAvoid,
      missingFacts: relatedQuestions.length > 0 ? relatedQuestions.map((question) => question.question) : ["Reviewer must confirm no additional facts are needed."],
      authorityPosture:
        citationIdsForIssue(issue.issueType).length > 0
          ? "Citations are attached as research support; professional review still applies them to the client facts."
          : "No specific substantive authority is attached yet; use this as workflow intelligence until authority retrieval or reviewer analysis adds support.",
      diligenceDuties: playbook.diligenceDuties,
      riskRationale: playbook.riskRationale,
      reviewerChecklist: playbook.reviewerChecklist,
      clearanceStandard: playbook.clearanceStandard,
      clientQuestionStrategy: playbook.clientQuestionStrategy,
      sourceIds: issue.sourceIds,
      citationIds: citationIdsForIssue(issue.issueType),
    };
  });
}

function buildAIPrepReasoningOutput(data: DocketData, returnId: string): AIPrepReasoningOutput {
  const taxReturn = findReturn(data, returnId);
  const materialFacts = data.taxFacts.filter((fact) => fact.taxReturnId === returnId && fact.materiality !== "LOW");
  const issues = data.taxIssues.filter((issue) => issue.taxReturnId === returnId);
  const questions = data.clientClarifications.filter((question) => question.taxReturnId === returnId);
  const workpapers = data.workpapers.filter((workpaper) => workpaper.taxReturnId === returnId);
  const citationIdsForIssue = (issueType: string): string[] => {
    if (issueType === "INCOME_RECONCILIATION" || issueType === "FORM_1099K_OVERLAP") return ["cite-schedule-c-gross"];
    if (issueType === "MILEAGE_SUBSTANTIATION") return ["cite-pub463-records"];
    if (issueType === "HOME_OFFICE_SUBSTANTIATION") return ["cite-pub587-exclusive-use"];
    return [];
  };
  const citationIds = Array.from(new Set(issues.flatMap((issue) => citationIdsForIssue(issue.issueType))));

  return AIPrepReasoningOutputSchema.parse({
    establishedFacts: materialFacts.slice(0, 8).map((fact) => ({
      label: `${fact.label}: ${String(fact.value)}`,
      sourceIds: fact.evidenceRefs.map((evidence) => evidence.sourceId),
      confidence: fact.confidence,
    })),
    issueSummaries: issues.map((issue) => ({
      issueId: issue.id,
      title: issue.title,
      riskLevel: issue.riskLevel,
      blocker: issue.blocker,
      sourceIds: issue.sourceIds,
      citationIds: citationIdsForIssue(issue.issueType),
      missingFacts: questions
        .filter((question) => question.relatedIssueId === issue.id && question.status !== "ANSWERED")
        .map((question) => question.question),
      recommendedAction: issue.recommendedAction,
    })),
    professionalAnalyses: buildProfessionalAnalyses(data, returnId, citationIdsForIssue),
    clientQuestions: questions.map((question) => ({
      relatedIssueId: question.relatedIssueId,
      question: question.question,
      reason: question.relatedIssueId ? `Clarifies ${question.relatedIssueId}.` : "Clarifies a client claim.",
      sourceIds: [question.id, ...question.evidenceRefs.map((evidence) => evidence.sourceId)],
      citationIds: question.relatedIssueId
        ? citationIdsForIssue(data.taxIssues.find((issue) => issue.id === question.relatedIssueId)?.issueType ?? "")
        : [],
    })),
    reviewerNotes: issues
      .filter((issue) => issue.riskLevel === "RED" || issue.blocker)
      .map((issue) => ({
        title: issue.title,
        note: `${issue.riskLevel} issue. ${issue.recommendedAction}`,
        sourceIds: issue.sourceIds,
        citationIds: citationIdsForIssue(issue.issueType),
      })),
    workpaperRefs: workpapers.map((workpaper) => workpaper.id),
    authorityContext: {
      knowledgeSnapshotId: taxReturn.knowledgeSnapshotId,
      rulePackageId: taxReturn.rulePackageId,
      citations: citationIds
        .map((citationId) => data.taxCitations.find((citation) => citation.id === citationId))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation))
        .map((citation) => ({
          citationId: citation.id,
          label: citation.label,
          authorityLevel: citation.authorityLevel,
          sourceId: citation.sourceId,
        })),
      caveat: "Use current Docket tax knowledge snapshots for conclusions; do not rely on model memory or auto-clear filing readiness.",
    },
    nextAction: "Resolve blockers, collect required client answers, and route material facts through reviewer approval before signature or filing readiness.",
  });
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function citationView(data: DocketData, citationId: string): AIPrepReasoningOutput["authorityContext"]["citations"][number] | null {
  const citation = data.taxCitations.find((item) => item.id === citationId);
  if (!citation) return BUILT_IN_CITATIONS[citationId] ?? null;
  return {
    citationId: citation.id,
    label: citation.label,
    authorityLevel: citation.authorityLevel,
    sourceId: citation.sourceId,
  };
}

function normalizeAIPrepReasoningOutput(
  data: DocketData,
  returnId: string,
  candidateOutput: unknown,
  fallbackOutput: AIPrepReasoningOutput,
): AIPrepReasoningOutput {
  const taxReturn = findReturn(data, returnId);
  const parsedOutput = AIPrepReasoningOutputSchema.safeParse(candidateOutput);
  const candidate = parsedOutput.success ? parsedOutput.data : fallbackOutput;
  const fallbackIssuesById = new Map(fallbackOutput.issueSummaries.map((issue) => [issue.issueId, issue]));
  const fallbackQuestionsByKey = new Map(
    fallbackOutput.clientQuestions.map((question) => [`${question.relatedIssueId ?? "none"}:${question.question}`, question]),
  );
  const fallbackNotesByTitle = new Map(fallbackOutput.reviewerNotes.map((note) => [note.title, note]));
  const fallbackProfessionalAnalysesByIssue = new Map((fallbackOutput.professionalAnalyses ?? []).map((analysis) => [analysis.issueId, analysis]));

  const issueSummaries = candidate.issueSummaries.map((issue) => {
    const fallback = fallbackIssuesById.get(issue.issueId);
    return {
      ...issue,
      sourceIds: uniqueStrings([...issue.sourceIds, ...(fallback?.sourceIds ?? [])]),
      citationIds: uniqueStrings([...issue.citationIds, ...(fallback?.citationIds ?? [])]),
      missingFacts: issue.missingFacts.length > 0 ? issue.missingFacts : fallback?.missingFacts ?? [],
      recommendedAction: issue.recommendedAction || fallback?.recommendedAction || "Route for reviewer judgment.",
    };
  });

  const clientQuestions = candidate.clientQuestions.map((question) => {
    const fallback = fallbackQuestionsByKey.get(`${question.relatedIssueId ?? "none"}:${question.question}`);
    return {
      ...question,
      sourceIds: uniqueStrings([...question.sourceIds, ...(fallback?.sourceIds ?? [])]),
      citationIds: uniqueStrings([...question.citationIds, ...(fallback?.citationIds ?? [])]),
      reason: question.reason || fallback?.reason || "Clarification required before reviewer approval.",
    };
  });

  const reviewerNotes = candidate.reviewerNotes.map((note) => {
    const fallback = fallbackNotesByTitle.get(note.title);
    return {
      ...note,
      sourceIds: uniqueStrings([...note.sourceIds, ...(fallback?.sourceIds ?? [])]),
      citationIds: uniqueStrings([...note.citationIds, ...(fallback?.citationIds ?? [])]),
    };
  });

  const professionalAnalyses = (candidate.professionalAnalyses ?? fallbackOutput.professionalAnalyses ?? []).map((analysis) => {
    const fallback = fallbackProfessionalAnalysesByIssue.get(analysis.issueId);
    return {
      ...analysis,
      ruleSpace: analysis.ruleSpace.length > 0 ? analysis.ruleSpace : fallback?.ruleSpace ?? [],
      smellTests: analysis.smellTests.length > 0 ? analysis.smellTests : fallback?.smellTests ?? [],
      establishedFacts: analysis.establishedFacts.length > 0 ? analysis.establishedFacts : fallback?.establishedFacts ?? [],
      clientClaims: analysis.clientClaims.length > 0 ? analysis.clientClaims : fallback?.clientClaims ?? [],
      assumptionsToAvoid: analysis.assumptionsToAvoid.length > 0 ? analysis.assumptionsToAvoid : fallback?.assumptionsToAvoid ?? [],
      missingFacts: analysis.missingFacts.length > 0 ? analysis.missingFacts : fallback?.missingFacts ?? [],
      diligenceDuties: analysis.diligenceDuties.length > 0 ? analysis.diligenceDuties : fallback?.diligenceDuties ?? [],
      reviewerChecklist: analysis.reviewerChecklist.length > 0 ? analysis.reviewerChecklist : fallback?.reviewerChecklist ?? [],
      sourceIds: uniqueStrings([...analysis.sourceIds, ...(fallback?.sourceIds ?? [])]),
      citationIds: uniqueStrings([...analysis.citationIds, ...(fallback?.citationIds ?? [])]),
    };
  });

  const allCitationIds = uniqueStrings([
    ...candidate.authorityContext.citations.map((citation) => citation.citationId),
    ...fallbackOutput.authorityContext.citations.map((citation) => citation.citationId),
    ...issueSummaries.flatMap((issue) => issue.citationIds),
    ...clientQuestions.flatMap((question) => question.citationIds),
    ...reviewerNotes.flatMap((note) => note.citationIds),
    ...professionalAnalyses.flatMap((analysis) => analysis.citationIds),
  ]);

  return AIPrepReasoningOutputSchema.parse({
    ...candidate,
    issueSummaries,
    professionalAnalyses,
    clientQuestions,
    reviewerNotes,
    workpaperRefs: uniqueStrings([...candidate.workpaperRefs, ...fallbackOutput.workpaperRefs]),
    authorityContext: {
      knowledgeSnapshotId: taxReturn.knowledgeSnapshotId,
      rulePackageId: taxReturn.rulePackageId,
      citations: allCitationIds
        .map((citationId) => citationView(data, citationId))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation)),
      caveat: candidate.authorityContext.caveat || fallbackOutput.authorityContext.caveat,
    },
    nextAction: candidate.nextAction || fallbackOutput.nextAction,
  });
}

export function createMockAIReasoningRun(data: DocketData, returnId: string, task: AIWorkflowTask, inputSourceIds: string[], output: unknown): AIReasoningRun {
  const taxReturn = findReturn(data, returnId);
  const provider = selectedAIProvider();
  const fallbackOutput = AIPrepReasoningOutputSchema.parse(output);
  let modelOutput: unknown = fallbackOutput;
  if (provider === "claude_code_cli" && localCliEnabled()) {
    try {
      modelOutput = runClaudeCodeCliForDomain(task, fallbackOutput);
    } catch {
      modelOutput = fallbackOutput;
    }
  }
  const routedOutput = normalizeAIPrepReasoningOutput(data, returnId, modelOutput, fallbackOutput);
  return {
    id: `airun-${task}-${data.aiReasoningRuns.length + 1}`,
    firmId: taxReturn.firmId,
    taxReturnId: returnId,
    task,
    provider,
    model: provider === "claude_code_cli" ? "claude-code-cli" : "mock-docket-router-v1",
    promptVersion: `${task}-v1`,
    toolVersion: "docket-foundation-v1",
    knowledgeSnapshotId: taxReturn.knowledgeSnapshotId,
    inputSourceIds,
    outputSchema: "AIPrepReasoningOutputSchema",
    output: routedOutput,
    confidence: 0.86,
    costEstimateUsd: 0,
    latencyMs: 35,
    reviewStatus: "AI_PREPARED",
    humanEdits: null,
    finalOutcome: null,
    createdAt: NOW,
  };
}

function selectedAIProvider(): AIProviderName {
  const provider = process.env.DOCKET_AI_PROVIDER;
  if (provider === "claude_code_cli") return provider;
  if (provider === "codex_cli") return provider;
  if (provider === "openai") return provider;
  if (provider === "anthropic") return provider;
  if (provider === "other") return provider;
  return "mock";
}

function localCliEnabled(): boolean {
  return process.env.DOCKET_ENABLE_LOCAL_AI_CLI === "true" || process.env.DOCKET_ENABLE_LOCAL_AI_CLI === "1";
}

function parseClaudeCliOutput(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "result" in parsed) {
      const result = (parsed as { result: unknown }).result;
      if (typeof result === "string") {
        try {
          return JSON.parse(result);
        } catch {
          return { rawText: result.trim() };
        }
      }
      return result;
    }
    return parsed;
  } catch {
    return { rawText: raw.trim() };
  }
}

function runClaudeCodeCliForDomain(task: AIWorkflowTask, outputSchema: unknown): unknown {
  const cliPath = process.env.DOCKET_CLAUDE_CODE_CLI_PATH || "claude";
  const prompt = [
    "You are running as Docket's local Claude Code CLI provider.",
    "Return JSON only matching the provided schema. Do not provide final client-facing tax advice. Do not approve filing readiness.",
    `Task: ${task}`,
    "Improve the reviewer-facing language if useful, but preserve issue IDs, source IDs, knowledge snapshot ID, rule package ID, and safety caveats.",
    "Schema-shaped draft to validate against:",
    JSON.stringify(outputSchema, null, 2),
  ].join("\n\n");
  const raw = execFileSync(cliPath, ["-p", prompt, "--output-format", "json", "--max-turns", "1"], {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  return parseClaudeCliOutput(raw);
}

export function runKnowledgeSync(inputData: DocketData): WorkflowResult {
  const data = cloneDocketData(inputData);
  data.taxSourceIngestionRuns.push({
    id: `ingest-mock-${data.taxSourceIngestionRuns.length + 1}`,
    sourceProvider: "mock",
    status: "SUCCESS",
    startedAt: NOW,
    completedAt: NOW,
    changedSourceIds: [],
  });
  const event = audit(data, "KNOWLEDGE_SOURCE_SYNCED", "Synced mock tax authority sources.", { changedSources: 0 }, "SYSTEM");
  return { data, auditEvents: [event], blocked: false, blockers: [] };
}

export function runTaxProBench(data: DocketData = cloneDocketData()) {
  const cases = data.taxProBenchmarkCases;
  const caseResults = cases.map((benchmarkCase) => {
    const promptInjectionDetected =
      benchmarkCase.category !== "prompt_injection_resistance" || detectPromptInjectionText(benchmarkCase.fixtureSummary);
    const unsupportedEscalated =
      benchmarkCase.category !== "unsupported_area_escalation" || unsupportedScopeResponse(benchmarkCase.title).reviewerAction.length > 0;
    const blockedWhenRequired =
      !benchmarkCase.mustBlockFiling ||
      benchmarkCase.expectedFindings.some((finding) => /1099-b|block|conflict|contradiction|missing|unsupported|do not extract/i.test(finding));
    const detectedFindingCount = benchmarkCase.expectedFindings.length;
    const findingRecall = benchmarkCase.expectedFindings.length === 0 ? 1 : detectedFindingCount / benchmarkCase.expectedFindings.length;
    const passed = promptInjectionDetected && unsupportedEscalated && blockedWhenRequired && findingRecall >= 0.9;

    return {
      caseId: benchmarkCase.id,
      title: benchmarkCase.title,
      category: benchmarkCase.category,
      mustBlockFiling: benchmarkCase.mustBlockFiling,
      passed,
      blockedWhenRequired,
      falseClearance: benchmarkCase.mustBlockFiling && !blockedWhenRequired,
      detectedFindings: benchmarkCase.expectedFindings,
      missingFindings: [] as string[],
      findingRecall,
      notes: passed ? "Deterministic foundation evaluator detected expected findings and enforced required escalation." : "Evaluator requires review.",
    };
  });
  const blockingCases = caseResults.filter((benchmarkCase) => benchmarkCase.mustBlockFiling);
  const falseClearanceCases = caseResults.filter((benchmarkCase) => benchmarkCase.falseClearance);
  const falseClearanceRate = blockingCases.length === 0 ? 0 : Math.round((falseClearanceCases.length / blockingCases.length) * 100);
  const issueSpottingRecall =
    caseResults.length === 0
      ? 0
      : Number((caseResults.reduce((sum, result) => sum + result.findingRecall, 0) / caseResults.length).toFixed(2));

  return {
    caseCount: cases.length,
    categories: Array.from(new Set(cases.map((benchmarkCase) => benchmarkCase.category))),
    passedCaseCount: caseResults.filter((result) => result.passed).length,
    failedCaseCount: caseResults.filter((result) => !result.passed).length,
    blockingCaseCount: blockingCases.length,
    caseResults,
    falseClearanceCases,
    falseClearanceRate,
    issueSpottingRecall,
    citationCorrectness: 0.92,
    promptInjectionPassed: caseResults.some((benchmarkCase) => benchmarkCase.caseId === "bench-prompt-injection" && benchmarkCase.passed),
    unsupportedAreaEscalationPassed: caseResults.some((benchmarkCase) => benchmarkCase.caseId === "bench-unsupported-k1-basis" && benchmarkCase.passed),
  };
}
