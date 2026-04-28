import { synthesizeTaxArtifactsWithClaude } from "@docket/ai";
import {
  ChatArtifactEnvelopeSchema,
  artifactConfidence,
  contentHashForEnvelope,
  docketTools,
  type ChatArtifactEnvelope,
  type CitationArtifact,
  type IssueAnalysisArtifact,
  type OrchestrationTraceEvent,
  type PreparerTaskArtifact,
  type ReconciliationTableArtifact,
  type SourcePacketItem,
  type WorkpaperArtifact,
} from "@docket/domain";

import type { ChatHistoryTurn } from "./tax-chat-shared";

type OrchestratorIntent = ChatArtifactEnvelope["intent"];

type OrchestratorInput = {
  question: string;
  returnId: string;
  history: ChatHistoryTurn[];
};
type ClientFile = NonNullable<ReturnType<typeof docketTools.getClientFile>>;
type OrchestratorWorkbench = ClientFile["workbench"];
type OrchestratorIssue = OrchestratorWorkbench["issues"][number];

function nowIso(): string {
  return new Date().toISOString();
}

function trace(stage: OrchestrationTraceEvent["stage"], summary: string, toolName: string | null, query: string | null, sourcePacketIds: string[] = []): OrchestrationTraceEvent {
  const startedAt = nowIso();
  return {
    id: `trace-${stage}-${Math.random().toString(36).slice(2, 8)}`,
    stage,
    summary,
    toolName,
    query,
    sourcePacketIds,
    startedAt,
    completedAt: nowIso(),
    latencyMs: 0,
    cacheStatus: "MISS",
  };
}

function classifyIntent(question: string): OrchestratorIntent {
  const q = question.toLowerCase();
  if (/^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|test)[\s!.?]*$/i.test(question.trim())) return "casual";
  if (/\bdeep dive\b|\bfull\b.*\bmemo\b|\breviewer memo\b|\bfull analysis\b|\bcomprehensive analysis\b|\bfull review\b|\brun\b.*\bmemo\b|\banalyze\b.*\breturn\b/.test(q)) return "deep_memo";
  if (/\breconcile|reconciliation|1099-k|1099k|1099-nec|income mismatch/.test(q)) return "reconciliation";
  if (/\bdraft|client question|ask client|message/.test(q)) return "client_draft";
  if (/\bworkpaper\b/.test(q)) return "workpaper";
  if (/\bstatus|overview|summary|need to know|tell me about/.test(q)) return "client_status";
  return "client_lookup";
}

function sourceIdsForIssue(issueSourceIds: string[], sourcePacket: SourcePacketItem[]): string[] {
  const bySourceId = new Map(sourcePacket.map((packet) => [packet.sourceId, packet.id]));
  return issueSourceIds.map((id) => bySourceId.get(id)).filter((id): id is string => Boolean(id));
}

function localAuthorityPacketIds(sourcePacket: SourcePacketItem[], issueTitle: string, issueType: string): string[] {
  const query = `${issueTitle} ${issueType}`.toLowerCase();
  const candidates = sourcePacket.filter((packet) => packet.sourceType === "tax_citation" || packet.sourceType === "tax_authority");
  const scored = candidates
    .map((packet) => {
      const haystack = `${packet.label} ${packet.excerpt}`.toLowerCase();
      let score = 0;
      for (const term of query.split(/\W+/).filter((part) => part.length > 3)) {
        if (haystack.includes(term)) score += 1;
      }
      if (issueType.includes("MILEAGE") && haystack.includes("mileage")) score += 3;
      if (issueType.includes("HOME_OFFICE") && haystack.includes("home office")) score += 3;
      if ((issueType.includes("1095") || query.includes("marketplace")) && (haystack.includes("1095") || haystack.includes("marketplace") || haystack.includes("premium tax credit"))) score += 3;
      if (issueType.includes("INCOME") || issueType.includes("1099")) {
        if (haystack.includes("schedule c") || haystack.includes("gross receipts")) score += 3;
      }
      return { packet, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((item) => item.packet.id);
}

function buildCitations(sourcePacket: SourcePacketItem[]): CitationArtifact[] {
  return sourcePacket
    .filter((packet) => packet.sourceType === "tax_citation" || packet.sourceType === "tax_authority")
    .slice(0, 8)
    .map((packet) => ({
      id: `artifact-citation-${packet.sourceId}`,
      label: packet.label,
      sourcePacketId: packet.id,
      authorityLevel: packet.authorityLevel,
      quote: packet.excerpt,
      confidence: artifactConfidence(`Citation is backed by ${packet.authorityTier.toLowerCase().replaceAll("_", " ")} source metadata.`, {
        overall: Math.min(0.95, packet.sourceReliability),
        sourceSupport: packet.sourceReliability,
        retrievalConfidence: packet.retrievalConfidence,
        authorityFit: packet.authorityLevel ? 0.82 : 0.55,
        recencyConfidence: packet.recencyConfidence,
        reviewState: "UNREVIEWED",
      }),
    }));
}

function buildReconciliationTables(returnId: string, issueIds: string[]): ReconciliationTableArtifact[] {
  const table = docketTools.buildReconciliationTable(returnId, "gross receipts income 1099 nec 1099 k client claim", issueIds[0] ?? null);
  return table ? [table] : [];
}

function selectRelevantSourcePacket(
  fullSourcePacket: SourcePacketItem[],
  selectedIssues: OrchestratorIssue[],
  workbench: OrchestratorWorkbench,
  question: string,
  intent: OrchestratorIntent,
): SourcePacketItem[] {
  const allowedSourceIds = new Set<string>();
  const allowedPacketIds = new Set<string>();
  const activeMissingDocuments = workbench.missingDocuments.filter((document) => document.status !== "RECEIVED" && document.status !== "WAIVED");
  const selectedIssueText = selectedIssues.map((issue) => `${issue.title} ${issue.description} ${issue.issueType} ${issue.recommendedAction}`).join(" ").toLowerCase();

  for (const issue of selectedIssues) {
    allowedSourceIds.add(issue.id);
    for (const sourceId of issue.sourceIds) allowedSourceIds.add(sourceId);
    for (const packetId of localAuthorityPacketIds(fullSourcePacket, issue.title, issue.issueType)) allowedPacketIds.add(packetId);
    for (const questionItem of workbench.questions.filter((item) => item.relatedIssueId === issue.id)) allowedSourceIds.add(questionItem.id);
  }

  for (const missingDocument of activeMissingDocuments) {
    const docName = missingDocument.expectedDocumentClass.replaceAll("_", " ").toLowerCase();
    const isRelevant = intent !== "client_lookup" || selectedIssueText.includes(docName) || question.toLowerCase().includes(docName);
    if (isRelevant || selectedIssues.length > 0) {
      allowedSourceIds.add(missingDocument.id);
      for (const sourceId of missingDocument.sourceIds) allowedSourceIds.add(sourceId);
    }
  }

  const selected = fullSourcePacket.filter((packet) => {
    if (packet.sourceType === "client" || packet.sourceType === "review_gate") return true;
    if (packet.sourceType === "tax_authority" || packet.sourceType === "tax_citation") return allowedPacketIds.has(packet.id);
    if (allowedSourceIds.has(packet.sourceId)) return true;
    if (intent === "client_lookup") return false;
    return ["document", "tax_fact", "client_claim", "conversation", "prior_year_pattern", "workpaper"].includes(packet.sourceType);
  });

  return Array.from(new Map(selected.map((packet) => [packet.id, packet])).values());
}

export function runTaxChatOrchestrator(input: OrchestratorInput): ChatArtifactEnvelope {
  const clientFile = docketTools.getClientFile({ returnId: input.returnId });
  if (!clientFile) throw new Error(`No return found for orchestrator returnId ${input.returnId}`);

  const { workbench, sourcePacket: fullSourcePacket, factGraph } = clientFile;
  const intent = classifyIntent(input.question);
  const activeIssues = workbench.issues.filter((issue) => issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER");
  const selectedIssues = intent === "client_lookup" ? [] : activeIssues.slice(0, intent === "client_status" ? 2 : 6);
  const sourcePacket = selectRelevantSourcePacket(fullSourcePacket, selectedIssues, workbench, input.question, intent);
  const traces: OrchestrationTraceEvent[] = [
    trace("intent", `Classified prompt as ${intent}.`, null, input.question),
    trace("context", `Loaded ${workbench.client?.displayName ?? "client"} return context.`, "getClientFile", input.returnId, sourcePacket.slice(0, 6).map((packet) => packet.id)),
    trace("retrieval", `Retrieved ${sourcePacket.length} source packet item(s) and ${factGraph.length} fact node(s).`, "docketTools", input.question, sourcePacket.slice(0, 12).map((packet) => packet.id)),
  ];

  const preparerTasks: PreparerTaskArtifact[] = selectedIssues.map((issue, index) =>
    docketTools.createPreparerTask({
      id: `task-${issue.id}`,
      relatedIssueId: issue.id,
      task: issue.recommendedAction,
      sourcePacketIds: sourceIdsForIssue(issue.sourceIds, sourcePacket),
      priority: index + 1,
      blocker: issue.blocker,
    }),
  );

  const issueAnalyses: IssueAnalysisArtifact[] = selectedIssues.map((issue, index) => {
    const issuePacketIds = sourceIdsForIssue(issue.sourceIds, sourcePacket);
    const authorityPacketIds = localAuthorityPacketIds(sourcePacket, issue.title, issue.issueType);
    const relatedQuestions = workbench.questions.filter((question) => question.relatedIssueId === issue.id);
    const relatedWorkpapers = workbench.workpapers.filter((workpaper) => workpaper.body.toLowerCase().includes(issue.title.toLowerCase().split(" ")[0] ?? ""));
    return {
      id: `artifact-analysis-${issue.id}`,
      issueId: issue.id,
      title: issue.title,
      riskLevel: issue.riskLevel,
      blocker: issue.blocker,
      reviewerState: issue.status === "CLIENT_QUESTION_PENDING" || issue.blocker ? "NEEDS_EVIDENCE" : "UNREVIEWED",
      situationMode: issue.issueType.replaceAll("_", " ").toLowerCase(),
      factPatternSummary: issue.description,
      verifiedFactNodeIds: factGraph.filter((fact) => issue.sourceIds.includes(fact.id.replace(/^fact-node-/, ""))).map((fact) => fact.id),
      claimSourcePacketIds: issuePacketIds.filter((id) => sourcePacket.find((packet) => packet.id === id)?.authorityTier === "UNTRUSTED_INPUT"),
      missingFacts: relatedQuestions.length ? relatedQuestions.map((question) => question.question) : [issue.recommendedAction],
      authoritySourcePacketIds: authorityPacketIds,
      smellTests: [
        issue.blocker ? "This issue blocks filing or materially affects filing readiness." : "This issue requires review before the related position is accepted.",
        issue.sourceIds.length ? "Source packets are attached and should be reviewed before clearance." : "No direct source packet is attached yet; request evidence before clearance.",
        issue.riskLevel === "RED" ? "False clearance would make the return look safer than the current evidence supports." : "Clearance depends on resolving the listed missing facts.",
      ],
      riskRationale: issue.description,
      clientQuestionIds: relatedQuestions.map((question) => `question-${question.id}`),
      preparerTaskIds: [`task-${issue.id}`],
      workpaperIds: relatedWorkpapers.map((workpaper) => `workpaper-${workpaper.id}`),
      citationIds: authorityPacketIds.map((id) => `artifact-citation-${sourcePacket.find((packet) => packet.id === id)?.sourceId ?? id}`),
      confidence: artifactConfidence("Issue analysis is produced from issue state, retrieved source packet items, local authority matches, and review gate posture.", {
        overall: issue.blocker ? 0.82 : 0.72,
        sourceSupport: issuePacketIds.length ? 0.78 : 0.52,
        retrievalConfidence: 0.84,
        authorityFit: authorityPacketIds.length ? 0.76 : 0.45,
        reviewState: issue.blocker ? "NEEDS_EVIDENCE" : "UNREVIEWED",
      }),
    };
  });
  traces.push(trace("issue_reasoning", `Built ${issueAnalyses.length} issue artifact(s), one per selected active issue.`, "reasonPerIssue", input.question, issueAnalyses.flatMap((analysis) => analysis.authoritySourcePacketIds)));

  const clientQuestions = workbench.questions
    .filter((question) => selectedIssues.some((issue) => issue.id === question.relatedIssueId))
    .map((question) =>
      docketTools.createClientQuestion({
        id: `question-${question.id}`,
        relatedIssueId: question.relatedIssueId,
        question: question.question,
        reason: question.relatedIssueId ? "Question is tied to a selected issue artifact." : "Question supports return context completion.",
        sourcePacketIds: sourceIdsForIssue(question.evidenceRefs.map((evidence) => evidence.sourceId), sourcePacket),
        reviewerApproved: question.reviewerApproved,
      }),
    );

  const workpapers: WorkpaperArtifact[] = workbench.workpapers.map((workpaper) =>
    docketTools.createWorkpaper({
      id: `workpaper-${workpaper.id}`,
      title: workpaper.title,
      section: workpaper.section,
      body: workpaper.body,
      sourcePacketIds: sourceIdsForIssue(workpaper.evidenceRefIds, sourcePacket),
      approved: workpaper.status === "APPROVED",
    }),
  );

  const citations = buildCitations(sourcePacket);
  const reconciliationTables = intent === "reconciliation" || selectedIssues.some((issue) => /INCOME|1099/i.test(issue.issueType))
    ? buildReconciliationTables(input.returnId, selectedIssues.map((issue) => issue.id))
    : [];
  const readyToFileGate = docketTools.runReviewGateCheck(input.returnId);
  traces.push(trace("cross_issue_checks", `Review gate pass=${readyToFileGate.pass}; blocker count=${readyToFileGate.blockers.length}.`, "runReviewGateCheck", input.returnId, sourcePacket.filter((packet) => packet.sourceType === "review_gate").map((packet) => packet.id)));

  const memo = intent === "deep_memo"
    ? {
        id: `memo-${input.returnId}-${Date.now()}`,
        headline: readyToFileGate.pass ? `${workbench.client?.displayName ?? "Client"} is clear in current Docket state.` : `${workbench.client?.displayName ?? "Client"}'s return is not ready to file.`,
        paragraphs: [
          `${workbench.client?.displayName ?? "Client"} is in ${workbench.taxReturn.status.replaceAll("_", " ").toLowerCase()} status with ${workbench.readiness.readinessScore}% workflow readiness and ${workbench.extension.extensionRiskScore}% extension risk.`,
          `Active issues analyzed: ${selectedIssues.map((issue) => issue.title).join("; ") || "none"}.`,
          `Ready-to-file gate blockers: ${readyToFileGate.blockers.join("; ") || "none"}.`,
        ],
        verdict: {
          filingStatus: readyToFileGate.pass ? "Ready-to-file stub passed" : "Not ready to file",
          readinessScore: workbench.readiness.readinessScore,
          extensionRiskScore: workbench.extension.extensionRiskScore,
          blockerCount: readyToFileGate.blockers.length,
        },
        issueAnalysisIds: issueAnalyses.map((analysis) => analysis.id),
        citationIds: citations.slice(0, 5).map((citation) => citation.id),
        confidence: artifactConfidence("Memo verdict is a rollup of review gates, issue artifacts, and readiness/extension scoring.", {
          overall: readyToFileGate.pass ? 0.82 : 0.88,
          sourceSupport: sourcePacket.length > 0 ? 0.82 : 0.4,
          reviewState: readyToFileGate.pass ? "PREPARER_READY" : "NEEDS_EVIDENCE",
        }),
      }
    : null;
  traces.push(trace("synthesis", memo ? "Synthesized memo artifact from validated issue artifacts." : "No memo requested; returning scoped artifacts.", null, input.question));

  const envelopeWithoutHash = {
    id: `artifact-envelope-${input.returnId}-${Date.now()}`,
    intent,
    clientId: workbench.taxReturn.clientId,
    taxReturnId: workbench.taxReturn.id,
    generatedAt: nowIso(),
    sourcePacket,
    factGraph,
    memo,
    issueAnalyses,
    citations,
    reconciliationTables,
    clientQuestions,
    preparerTasks,
    workpapers,
    trace: traces,
    confidence: artifactConfidence("Envelope confidence is a rollup of source retrieval, issue analysis, and review gate determinism.", {
      overall: memo?.confidence.overall ?? (issueAnalyses.length ? 0.78 : 0.68),
      sourceSupport: sourcePacket.length > 0 ? 0.8 : 0.3,
      retrievalConfidence: 0.85,
      authorityFit: citations.length ? 0.72 : 0.45,
      reviewState: readyToFileGate.pass ? "PREPARER_READY" : "NEEDS_EVIDENCE",
    }),
  };
  const parsed = ChatArtifactEnvelopeSchema.parse({
    ...envelopeWithoutHash,
    immutableContentHash: contentHashForEnvelope(envelopeWithoutHash),
    trace: [...traces, trace("validation", "Validated artifact envelope with Zod and attached immutable content hash.", null, null)],
  });
  const synthesis = synthesizeTaxArtifactsWithClaude({
    question: input.question,
    conversationHistory: input.history,
    deterministicEnvelope: parsed,
  });
  return synthesis?.envelope ?? parsed;
}
