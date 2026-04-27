import { evaluateFirmPolicies, evaluateReviewGate, hasActiveConsent, scoreExtensionRisk, scoreReadiness, runTaxProBench } from "./engines";
import { readDocketData } from "./store";
import type { AuditEvent, DocketData, RiskLevel } from "./types";

export function getDocketSnapshot(data: DocketData = readDocketData()): DocketData {
  return data;
}

export function getCommandCenter(data: DocketData = readDocketData()) {
  const returns = data.taxReturns;
  const redIssues = data.taxIssues.filter((issue) => issue.riskLevel === "RED" && issue.status !== "RESOLVED");
  const yellowIssues = data.taxIssues.filter((issue) => issue.riskLevel === "YELLOW" && issue.status !== "RESOLVED");
  const blockedByDocs = data.missingDocuments.filter((document) => document.status !== "RECEIVED");
  const needsQuestions = data.clientClarifications.filter((question) => question.status === "AWAITING_CLIENT");
  const likelyExtensions = returns.filter((taxReturn) => taxReturn.extensionRiskScore >= 75);
  const aiPreparedAwaitingReview = data.aiPrepRuns.filter((run) => run.status === "COMPLETE").length;

  return {
    firm: data.firms[0],
    metrics: [
      { label: "AI findings today", value: redIssues.length + yellowIssues.length, tone: "yellow" },
      { label: "Red flags", value: redIssues.length, tone: "red" },
      { label: "Yellow flags", value: yellowIssues.length, tone: "yellow" },
      { label: "Green-ready returns", value: returns.filter((taxReturn) => taxReturn.riskLevel === "GREEN").length, tone: "green" },
      { label: "Blocked by missing docs", value: blockedByDocs.length, tone: "red" },
      { label: "Need client questions", value: needsQuestions.length, tone: "yellow" },
      { label: "Likely extensions", value: likelyExtensions.length, tone: "red" },
      { label: "AI-prepared awaiting review", value: aiPreparedAwaitingReview, tone: "blue" },
      { label: "Tax law updates affecting returns", value: data.taxImpactAssessments.length, tone: "blue" },
      { label: "Revenue blocked by signature/payment", value: data.signatureAuthorizations.filter((signature) => signature.status !== "SIGNED").length, tone: "yellow" },
      { label: "Reviewer workload", value: data.taxIssues.filter((issue) => issue.assignedToRole === "MANAGER_REVIEWER" && issue.status !== "RESOLVED").length, tone: "blue" },
    ],
    findings: [
      "5 income mismatches across active returns",
      "12 likely extensions",
      "18 missing prior-year recurring documents",
      "7 unsupported Schedule C deduction items",
      "4 stock-sale mentions with no 1099-B",
      "3 marketplace insurance mentions with no 1095-A",
    ],
    activeReturns: returns.map((taxReturn) => ({
      ...taxReturn,
      client: data.clients.find((client) => client.id === taxReturn.clientId),
      readiness: scoreReadiness(data, taxReturn.id),
      extension: scoreExtensionRisk(data, taxReturn.id),
      gate: evaluateReviewGate(data, taxReturn.id, "READY_TO_FILE"),
    })),
  };
}

export function getClient360(clientId: string, data: DocketData = readDocketData()) {
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return null;
  const returns = data.taxReturns.filter((taxReturn) => taxReturn.clientId === clientId);
  const returnIds = new Set(returns.map((taxReturn) => taxReturn.id));
  return {
    client,
    contacts: data.clientContacts.filter((contact) => contact.clientId === clientId),
    household: data.householdMembers.filter((member) => member.clientId === clientId),
    engagements: data.engagements.filter((engagement) => engagement.clientId === clientId),
    returns,
    documents: data.sourceDocuments.filter((document) => returnIds.has(document.taxReturnId)),
    contextFacts: data.clientContextFacts.filter((fact) => fact.clientId === clientId),
    claims: data.clientClaims.filter((claim) => claim.clientId === clientId),
    priorYearPatterns: data.priorYearPatterns.filter((pattern) => pattern.clientId === clientId),
    conversationInsights: data.conversationInsights.filter((insight) => returnIds.has(insight.taxReturnId)),
    missingDocuments: data.missingDocuments.filter((document) => document.clientId === clientId),
    deductionOpportunities: data.deductionOpportunities.filter((opportunity) => opportunity.clientId === clientId),
    riskFlags: data.taxFlags.filter((flag) => returnIds.has(flag.taxReturnId)),
    auditTimeline: data.auditEvents.filter((event) => event.clientId === clientId).slice(-12).reverse(),
    scores: returns.map((taxReturn) => ({
      returnId: taxReturn.id,
      readiness: scoreReadiness(data, taxReturn.id),
      extension: scoreExtensionRisk(data, taxReturn.id),
    })),
  };
}

type TrustChecklistStatus = "PASS" | "WARN" | "BLOCK";

type TrustChecklistItem = {
  id: string;
  label: string;
  status: TrustChecklistStatus;
  detail: string;
  sourceIds: string[];
};

type SourceIndexEntry = {
  id: string;
  type: string;
  label: string;
  detail: string;
};

const BUILT_IN_SOURCE_INDEX_ENTRIES: SourceIndexEntry[] = [
  {
    id: "cite-pub587-exclusive-use",
    type: "tax authority citation",
    label: "Home office exclusive use",
    detail: "IRS PUBLICATION · Publication 587 - Business Use of Your Home",
  },
];

function trustStatusTone(status: TrustChecklistStatus): "green" | "yellow" | "red" {
  if (status === "PASS") return "green";
  if (status === "WARN") return "yellow";
  return "red";
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  return items.reduce<Record<T, number>>((counts, item) => {
    counts[item] = (counts[item] ?? 0) + 1;
    return counts;
  }, {} as Record<T, number>);
}

function summarizeAuditEvents(events: AuditEvent[]) {
  return {
    totalEvents: events.length,
    blockedWorkflowCount: events.filter((event) => event.eventType === "WORKFLOW_BLOCKED").length,
    aiEventCount: events.filter((event) => event.actorType === "AI").length,
    clientEventCount: events.filter((event) => event.actorType === "CLIENT").length,
    firmUserEventCount: events.filter((event) => event.actorType === "FIRM_USER").length,
    byActorType: countBy(events.map((event) => event.actorType)),
    byEventType: countBy(events.map((event) => event.eventType)),
    latestEvents: events.slice(-6).reverse(),
  };
}

function buildSourceIndex(data: DocketData, returnId: string): Record<string, SourceIndexEntry> {
  const taxReturn = data.taxReturns.find((item) => item.id === returnId);
  const entries: SourceIndexEntry[] = [
    ...data.sourceDocuments
      .filter((document) => document.taxReturnId === returnId)
      .map((document) => ({
        id: document.id,
        type: "document",
        label: document.fileName,
        detail: `${document.documentClass.replaceAll("_", " ")} · tax year ${document.taxYear ?? "unknown"}`,
      })),
    ...data.taxFacts
      .filter((fact) => fact.taxReturnId === returnId)
      .map((fact) => ({
        id: fact.id,
        type: "tax fact",
        label: fact.label,
        detail: `${fact.status.replaceAll("_", " ")} · confidence ${Math.round(fact.confidence * 100)}%`,
      })),
    ...data.clientClaims
      .filter((claim) => claim.taxReturnId === returnId)
      .map((claim) => ({
        id: claim.id,
        type: "client claim",
        label: claim.claimType.replaceAll("_", " "),
        detail: claim.statement,
      })),
    ...data.conversationInsights
      .filter((insight) => insight.taxReturnId === returnId)
      .map((insight) => ({
        id: insight.id,
        type: "conversation insight",
        label: insight.insightType.replaceAll("_", " "),
        detail: insight.summary,
      })),
    ...data.priorYearPatterns
      .filter((pattern) => pattern.taxReturnId === returnId)
      .map((pattern) => ({
        id: pattern.id,
        type: "prior-year pattern",
        label: pattern.patternType.replaceAll("_", " "),
        detail: pattern.description,
      })),
    ...data.clientClarifications
      .filter((question) => question.taxReturnId === returnId)
      .map((question) => ({
        id: question.id,
        type: "client question",
        label: question.question,
        detail: question.status.replaceAll("_", " "),
      })),
    ...data.workpapers
      .filter((workpaper) => workpaper.taxReturnId === returnId)
      .map((workpaper) => ({
        id: workpaper.id,
        type: "workpaper",
        label: workpaper.title,
        detail: `${workpaper.status.replaceAll("_", " ")} · ${workpaper.section}`,
      })),
    ...data.taxCitations.map((citation) => {
      const source = data.taxAuthoritySources.find((authoritySource) => authoritySource.id === citation.sourceId);
      return {
        id: citation.id,
        type: "tax authority citation",
        label: citation.label,
        detail: `${citation.authorityLevel.replaceAll("_", " ")} · ${source?.title ?? citation.sourceId}`,
      };
    }),
    ...BUILT_IN_SOURCE_INDEX_ENTRIES.filter((entry) => !data.taxCitations.some((citation) => citation.id === entry.id)),
    ...data.taxAuthoritySources.map((source) => ({
      id: source.id,
      type: "tax authority source",
      label: source.title,
      detail: `${source.authorityLevel.replaceAll("_", " ")} · retrieved ${source.retrievedAt.slice(0, 10)}`,
    })),
  ];

  if (taxReturn) {
    entries.push({
      id: taxReturn.knowledgeSnapshotId,
      type: "knowledge snapshot",
      label: data.taxKnowledgeSnapshots.find((snapshot) => snapshot.id === taxReturn.knowledgeSnapshotId)?.label ?? taxReturn.knowledgeSnapshotId,
      detail: `Tax year ${taxReturn.taxYear} · jurisdiction ${taxReturn.jurisdiction}`,
    });
    entries.push({
      id: taxReturn.rulePackageId,
      type: "rule package",
      label: data.taxRulePackages.find((rulePackage) => rulePackage.id === taxReturn.rulePackageId)?.version ?? taxReturn.rulePackageId,
      detail: "Approved deterministic rule package",
    });
  }

  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

export function getReturnTrustChecklist(returnId: string, data: DocketData = readDocketData()) {
  const taxReturn = data.taxReturns.find((item) => item.id === returnId);
  if (!taxReturn) return null;
  const materialFacts = data.taxFacts.filter((fact) => fact.taxReturnId === returnId && fact.materiality !== "LOW");
  const factsMissingEvidence = materialFacts.filter((fact) => fact.evidenceRefs.length === 0);
  const unapprovedFacts = materialFacts.filter((fact) => fact.reviewStatus !== "REVIEWER_APPROVED" && fact.reviewStatus !== "PARTNER_OVERRIDE");
  const redFlags = data.taxIssues.filter((issue) => issue.taxReturnId === returnId && issue.riskLevel === "RED" && issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER");
  const requiredQuestions = data.clientClarifications.filter((question) => question.taxReturnId === returnId && question.relatedIssueId !== null);
  const unansweredQuestions = requiredQuestions.filter((question) => question.status !== "ANSWERED");
  const policyBlockers = evaluateFirmPolicies(data, returnId).filter((policy) => policy.blocking);
  const signature = data.signatureAuthorizations.find((item) => item.taxReturnId === returnId && item.authorizationType === "FORM_8879");
  const snapshot = data.taxKnowledgeSnapshots.find((item) => item.id === taxReturn.knowledgeSnapshotId);
  const exportPackage = data.exportPackages.find((packet) => packet.taxReturnId === returnId);
  const openPromptInjectionFlags = data.documentFlags.filter((flag) => flag.taxReturnId === returnId && flag.flagType === "PROMPT_INJECTION" && flag.status !== "RESOLVED");

  const items: TrustChecklistItem[] = [
    {
      id: "consent-ai-prep",
      label: "Required AI consent",
      status: hasActiveConsent(data, taxReturn.clientId, "AI_ASSISTED_TAX_PREP", returnId) ? "PASS" : "BLOCK",
      detail: "AI-assisted tax preparation consent must be active before extraction, reconciliation, questions, or workpapers run.",
      sourceIds: data.consentRecords.filter((record) => record.clientId === taxReturn.clientId).map((record) => record.id),
    },
    {
      id: "evidence-coverage",
      label: "Material fact evidence",
      status: factsMissingEvidence.length === 0 ? "PASS" : "BLOCK",
      detail: factsMissingEvidence.length === 0 ? "All material facts have evidence references." : `${factsMissingEvidence.length} material fact(s) are missing evidence.`,
      sourceIds: factsMissingEvidence.map((fact) => fact.id),
    },
    {
      id: "review-approval",
      label: "Reviewer approval",
      status: unapprovedFacts.length === 0 ? "PASS" : "BLOCK",
      detail: unapprovedFacts.length === 0 ? "All material facts are reviewer approved or partner overridden." : `${unapprovedFacts.length} material fact(s) still need reviewer approval.`,
      sourceIds: unapprovedFacts.map((fact) => fact.id),
    },
    {
      id: "red-flags",
      label: "Red flag resolution",
      status: redFlags.length === 0 ? "PASS" : "BLOCK",
      detail: redFlags.length === 0 ? "No unresolved red flags remain." : `${redFlags.length} unresolved red flag(s) remain.`,
      sourceIds: redFlags.map((issue) => issue.id),
    },
    {
      id: "client-answers",
      label: "Required client answers",
      status: unansweredQuestions.length === 0 ? "PASS" : "BLOCK",
      detail: unansweredQuestions.length === 0 ? "Required clarifications are answered." : `${unansweredQuestions.length} required clarification(s) are unanswered.`,
      sourceIds: unansweredQuestions.map((question) => question.id),
    },
    {
      id: "firm-policy",
      label: "Firm policy blockers",
      status: policyBlockers.length === 0 ? "PASS" : "BLOCK",
      detail: policyBlockers.length === 0 ? "No enabled firm policies block filing." : `${policyBlockers.length} enabled firm policy blocker(s) remain.`,
      sourceIds: policyBlockers.flatMap((policy) => policy.sourceIds),
    },
    {
      id: "knowledge-freshness",
      label: "Knowledge freshness",
      status: snapshot?.lastSyncStatus === "CURRENT" ? "PASS" : "BLOCK",
      detail: snapshot ? `${snapshot.label} is ${snapshot.lastSyncStatus.replaceAll("_", " ").toLowerCase()}.` : "No knowledge snapshot is attached.",
      sourceIds: snapshot ? [snapshot.id] : [],
    },
    {
      id: "signature-authorization",
      label: "Form 8879 signature",
      status: signature?.status === "SIGNED" ? "PASS" : "BLOCK",
      detail: signature?.status === "SIGNED" ? "Form 8879 authorization placeholder is signed." : "Form 8879 authorization placeholder is not signed.",
      sourceIds: signature ? [signature.id] : [],
    },
    {
      id: "export-freshness",
      label: "Export packet freshness",
      status: !exportPackage ? "WARN" : exportPackage.state === "STALE_DUE_TO_CHANGE" ? "BLOCK" : "PASS",
      detail: !exportPackage ? "No export packet has been generated." : `Export packet state is ${exportPackage.state.replaceAll("_", " ").toLowerCase()}.`,
      sourceIds: exportPackage ? [exportPackage.id] : [],
    },
    {
      id: "prompt-injection",
      label: "Prompt injection defense",
      status: openPromptInjectionFlags.length === 0 ? "PASS" : "BLOCK",
      detail: openPromptInjectionFlags.length === 0 ? "No open prompt-injection document flags." : `${openPromptInjectionFlags.length} open prompt-injection flag(s) need review.`,
      sourceIds: openPromptInjectionFlags.map((flag) => flag.id),
    },
    {
      id: "efile-stub",
      label: "E-file boundary",
      status: "WARN",
      detail: "Direct IRS e-file remains intentionally stubbed in the foundation release.",
      sourceIds: [],
    },
  ];

  const passScore = items.reduce((score, item) => score + (item.status === "PASS" ? 1 : item.status === "WARN" ? 0.5 : 0), 0);
  return {
    score: Math.round((passScore / items.length) * 100),
    items: items.map((item) => ({ ...item, tone: trustStatusTone(item.status) })),
    blockers: items.filter((item) => item.status === "BLOCK"),
    warnings: items.filter((item) => item.status === "WARN"),
    auditSummary: summarizeAuditEvents(data.auditEvents.filter((event) => event.taxReturnId === returnId)),
  };
}

export function getReturnWorkbench(returnId: string, data: DocketData = readDocketData()) {
  const taxReturn = data.taxReturns.find((item) => item.id === returnId);
  if (!taxReturn) return null;
  const client = data.clients.find((item) => item.id === taxReturn.clientId);
  const preparer = data.firmUsers.find((user) => user.id === taxReturn.assignedPreparerId);
  const reviewer = data.firmUsers.find((user) => user.id === taxReturn.assignedReviewerId);
  const knowledgeSnapshot = data.taxKnowledgeSnapshots.find((snapshot) => snapshot.id === taxReturn.knowledgeSnapshotId);
  const rulePackage = data.taxRulePackages.find((rulePackageItem) => rulePackageItem.id === taxReturn.rulePackageId);
  const trustChecklist = getReturnTrustChecklist(returnId, data);
  const aiRuns = data.aiReasoningRuns.filter((run) => run.taxReturnId === returnId);
  const sourceIndex = buildSourceIndex(data, returnId);

  return {
    taxReturn,
    client,
    preparer,
    reviewer,
    knowledgeSnapshot,
    rulePackage,
    documents: data.sourceDocuments.filter((document) => document.taxReturnId === returnId),
    extractedFields: data.extractedFields.filter((field) => data.sourceDocuments.some((document) => document.taxReturnId === returnId && document.id === field.sourceDocumentId)),
    taxFacts: data.taxFacts.filter((fact) => fact.taxReturnId === returnId),
    issues: data.taxIssues.filter((issue) => issue.taxReturnId === returnId),
    flags: data.taxFlags.filter((flag) => flag.taxReturnId === returnId),
    missingDocuments: data.missingDocuments.filter((document) => document.taxReturnId === returnId),
    contradictions: data.contradictions.filter((contradiction) => contradiction.taxReturnId === returnId),
    opportunities: data.deductionOpportunities.filter((opportunity) => opportunity.taxReturnId === returnId),
    questions: data.clientClarifications.filter((question) => question.taxReturnId === returnId),
    workpapers: data.workpapers.filter((workpaper) => workpaper.taxReturnId === returnId),
    auditEvents: data.auditEvents.filter((event) => event.taxReturnId === returnId).slice().reverse(),
    aiRuns,
    latestAIReasoningRun: aiRuns.at(-1) ?? null,
    reasoningSourceIndex: sourceIndex,
    aiPrepRuns: data.aiPrepRuns.filter((run) => run.taxReturnId === returnId),
    exportPackage: data.exportPackages.find((packet) => packet.taxReturnId === returnId),
    firmPolicyEvaluations: evaluateFirmPolicies(data, returnId),
    signatures: data.signatureAuthorizations.filter((signature) => signature.taxReturnId === returnId),
    readiness: scoreReadiness(data, returnId),
    extension: scoreExtensionRisk(data, returnId),
    readyForReviewGate: evaluateReviewGate(data, returnId, "READY_FOR_REVIEW"),
    readyForSignatureGate: evaluateReviewGate(data, returnId, "READY_FOR_SIGNATURE"),
    readyToFileGate: evaluateReviewGate(data, returnId, "READY_TO_FILE"),
    trustChecklist,
    recommendedNextAction: "Resolve income mismatch and request 1099-B before reviewer can clear filing readiness.",
  };
}

export function getPortalReturn(returnId: string, data: DocketData = readDocketData()) {
  const workbench = getReturnWorkbench(returnId, data);
  if (!workbench) return null;
  return {
    client: workbench.client,
    taxReturn: workbench.taxReturn,
    checklist: [
      {
        id: "check-1099b",
        label: "Upload brokerage consolidated 1099",
        status: workbench.missingDocuments.some((document) => document.expectedDocumentClass === "FORM_1099_B") ? "missing" : "complete",
      },
      {
        id: "check-income-overlap",
        label: "Answer freelance income overlap question",
        status: workbench.questions.some((question) => question.id === "clar-1099k-overlap" && question.status !== "ANSWERED") ? "missing" : "complete",
      },
      {
        id: "check-home-office",
        label: "Confirm home office details",
        status: workbench.questions.some((question) => question.id === "clar-home-office" && question.status !== "ANSWERED") ? "missing" : "complete",
      },
      {
        id: "check-consent",
        label: "AI-assisted preparation consent",
        status: data.consentRecords.some((record) => record.clientId === workbench.taxReturn.clientId && record.consentType === "AI_ASSISTED_TAX_PREP" && record.granted)
          ? "complete"
          : "missing",
      },
    ],
    questions: workbench.questions,
    documents: workbench.documents,
    consents: data.consentRecords.filter((record) => record.clientId === workbench.taxReturn.clientId),
    signatures: workbench.signatures,
    progress: workbench.readiness.readinessScore,
  };
}

export function getKnowledgeAdmin(data: DocketData = readDocketData()) {
  return {
    snapshots: data.taxKnowledgeSnapshots,
    sources: data.taxAuthoritySources,
    ingestionRuns: data.taxSourceIngestionRuns,
    sourceChanges: data.taxSourceChanges,
    impactAssessments: data.taxImpactAssessments,
    rulePackages: data.taxRulePackages,
  };
}

export function getEvalsDashboard(data: DocketData = readDocketData()) {
  const aiCost = data.aiReasoningRuns.reduce((sum, run) => sum + run.costEstimateUsd, 0) + data.aiPrepRuns.reduce((sum, run) => sum + run.costEstimateUsd, 0);
  const avgLatency =
    data.aiReasoningRuns.length === 0
      ? 0
      : Math.round(data.aiReasoningRuns.reduce((sum, run) => sum + run.latencyMs, 0) / data.aiReasoningRuns.length);
  const reviewerTouchedRuns = data.aiReasoningRuns.filter((run) => run.reviewStatus !== "AI_PREPARED").length;
  const unsupportedFactCount = data.taxFacts.filter((fact) => fact.materiality !== "LOW" && fact.evidenceRefs.length === 0).length;
  const latestRun = data.modelEvalRuns[0];

  return {
    latestRun,
    cases: data.taxProBenchmarkCases,
    metrics: runTaxProBench(data),
    modelRisk: {
      providers: data.modelProviders,
      promptVersions: data.promptVersions,
      aiRunCount: data.aiReasoningRuns.length,
      aiPrepRunCount: data.aiPrepRuns.length,
      totalCostUsd: Number(aiCost.toFixed(4)),
      averageLatencyMs: avgLatency,
      failedRuns: data.aiPrepRuns.filter((run) => run.status === "FAILED").length,
      reviewerOverrideRate:
        data.aiReasoningRuns.length === 0 ? 0 : Number((reviewerTouchedRuns / data.aiReasoningRuns.length).toFixed(2)),
      unsupportedFactRate:
        data.taxFacts.length === 0 ? 0 : Number((unsupportedFactCount / data.taxFacts.length).toFixed(2)),
      latestFalseClearanceRate: latestRun?.falseClearanceRate ?? 0,
      latestCitationCorrectness: latestRun?.citationCorrectness ?? 0,
      externalCallsAllowed: data.modelProviders.some((provider) => provider.enabled && provider.externalCallsAllowed),
    },
  };
}

export function riskSortValue(riskLevel: RiskLevel): number {
  if (riskLevel === "RED") return 0;
  if (riskLevel === "YELLOW") return 1;
  return 2;
}

export function searchDocket(query: string, data: DocketData = readDocketData()) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return [
    ...data.clients
      .filter((client) => client.displayName.toLowerCase().includes(normalized))
      .map((client) => ({ entityType: "client", id: client.id, title: client.displayName, href: `/dashboard/clients/${client.id}` })),
    ...data.taxIssues
      .filter((issue) => `${issue.title} ${issue.description}`.toLowerCase().includes(normalized))
      .map((issue) => ({ entityType: "issue", id: issue.id, title: issue.title, href: `/dashboard/returns/${issue.taxReturnId}/workbench` })),
    ...data.sourceDocuments
      .filter((document) => document.fileName.toLowerCase().includes(normalized))
      .map((document) => ({ entityType: "document", id: document.id, title: document.fileName, href: `/dashboard/returns/${document.taxReturnId}/workbench` })),
  ];
}
