import {
  docketTools,
  readDocketData,
  runTaxProBench,
  type ChatArtifactEnvelope,
  type DocketData,
  type IssueReasoningPacket,
  type SourcePacketItem,
} from "@docket/domain";

import { runTaxChatOrchestrator } from "./tax-orchestrator";

type OrchestratorEvalCaseResult = {
  id: string;
  title: string;
  clientName: string;
  returnId: string;
  passed: boolean;
  expectedBlocked: boolean;
  artifactBlocked: boolean;
  falseClearance: boolean;
  missedBlockerIds: string[];
  citationAccuracy: number;
  sourceFreshness: number;
  clientQuestionUsefulness: number;
  unsupportedScopeEscalated: boolean | null;
  fallbackUsed: boolean;
  traceStageCount: number;
  notes: string[];
};

export type OrchestratorBenchMetrics = {
  caseCount: number;
  passedCaseCount: number;
  failedCaseCount: number;
  falseClearanceRate: number;
  missedBlockerCount: number;
  citationAccuracy: number;
  sourceFreshness: number;
  clientQuestionUsefulness: number;
  unsupportedScopeEscalation: number;
  fallbackFreeRate: number;
  caseResults: OrchestratorEvalCaseResult[];
};

const TOKEN_STOP_WORDS = new Set([
  "after",
  "before",
  "client",
  "current",
  "document",
  "filing",
  "issue",
  "missing",
  "return",
  "review",
  "source",
  "status",
  "support",
  "tax",
  "year",
]);

function withMockProvider<T>(run: () => T): T {
  const previousProvider = process.env.DOCKET_AI_PROVIDER;
  const previousLocalCli = process.env.DOCKET_ENABLE_LOCAL_AI_CLI;
  process.env.DOCKET_AI_PROVIDER = "mock";
  process.env.DOCKET_ENABLE_LOCAL_AI_CLI = "false";
  try {
    return run();
  } finally {
    if (previousProvider === undefined) {
      delete process.env.DOCKET_AI_PROVIDER;
    } else {
      process.env.DOCKET_AI_PROVIDER = previousProvider;
    }
    if (previousLocalCli === undefined) {
      delete process.env.DOCKET_ENABLE_LOCAL_AI_CLI;
    } else {
      process.env.DOCKET_ENABLE_LOCAL_AI_CLI = previousLocalCli;
    }
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 1;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function scoreRatio(passing: number, total: number): number {
  if (total === 0) return 1;
  return Number((passing / total).toFixed(2));
}

function importantTokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length > 3 && !TOKEN_STOP_WORDS.has(token)),
    ),
  );
}

function scoreCitationFit(packet: SourcePacketItem, issuePacket: IssueReasoningPacket): number {
  const sourceText = `${packet.label} ${packet.excerpt} ${packet.authorityLevel ?? ""}`.toLowerCase();
  const issueText = `${issuePacket.title} ${issuePacket.situationClassification.mode} ${issuePacket.missingFacts.join(" ")}`;
  const tokens = importantTokens(issueText);
  const overlap = tokens.filter((token) => sourceText.includes(token)).length;
  const keywordFit =
    (/k-?1|partnership|pass.through|schedule e/.test(issueText.toLowerCase()) && /k-?1|partnership|pass.through|schedule e/.test(sourceText)) ||
    (/1095|marketplace|premium/.test(issueText.toLowerCase()) && /1095|marketplace|premium/.test(sourceText)) ||
    (/home|office|exclusive/.test(issueText.toLowerCase()) && /home|office|exclusive/.test(sourceText)) ||
    (/mileage|vehicle/.test(issueText.toLowerCase()) && /mileage|vehicle|274/.test(sourceText)) ||
    (/income|gross|receipts|1099|nec|stripe/.test(issueText.toLowerCase()) && /schedule c|gross|receipt|1099|6041/.test(sourceText)) ||
    (/stock|broker|1099-b|capital/.test(issueText.toLowerCase()) && /broker|1099-b|6045|capital/.test(sourceText)) ||
    (/crypto|digital.asset|virtual.currency|tax.lot|unsupported/.test(issueText.toLowerCase()) && /crypto|digital.asset|digital assets|virtual.currency|form 8949|schedule d|unsupported|tax.lot/.test(sourceText)) ||
    (/education|student|1098-t|tuition/.test(issueText.toLowerCase()) && /education|student|1098-t|tuition/.test(sourceText)) ||
    (/dependent|childcare|child care|provider/.test(issueText.toLowerCase()) && /dependent care|childcare|provider|503/.test(sourceText)) ||
    (/1098|mortgage|rental/.test(issueText.toLowerCase()) && /1098|mortgage|936|rental/.test(sourceText)) ||
    (/retirement|1099-r|pension|ira/.test(issueText.toLowerCase()) && /retirement|1099-r|pension|ira/.test(sourceText)) ||
    (/residen|state|california|texas/.test(issueText.toLowerCase()) && /residen|state|california|domicile/.test(sourceText));
  if (keywordFit) return 1;
  if (tokens.length === 0) return packet.authorityLevel ? 0.7 : 0.4;
  return Math.min(1, overlap / Math.min(tokens.length, 4));
}

function scoreIssueCitationAccuracy(envelope: ChatArtifactEnvelope): number {
  const packetById = new Map(envelope.sourcePacket.map((packet) => [packet.id, packet]));
  const materialIssuePackets = envelope.issuePackets.filter((packet) => packet.situationClassification.blocker || packet.situationClassification.riskLevel === "RED");
  if (materialIssuePackets.length === 0) return 1;

  const scores = materialIssuePackets.map((issuePacket) => {
    const authorityPackets = issuePacket.authoritySourcePacketIds.map((id) => packetById.get(id)).filter((packet): packet is SourcePacketItem => Boolean(packet));
    if (authorityPackets.length === 0) return 0;
    return Math.max(...authorityPackets.map((packet) => scoreCitationFit(packet, issuePacket)));
  });
  return average(scores);
}

function scoreSourceFreshness(envelope: ChatArtifactEnvelope): number {
  const materialIssuePackets = envelope.issuePackets.filter((packet) => packet.situationClassification.blocker || packet.situationClassification.riskLevel === "RED");
  if (materialIssuePackets.length === 0 && !envelope.memo?.verdict.filingStatus.toLowerCase().includes("not ready")) return 1;
  const authorityPackets = envelope.sourcePacket.filter((packet) => packet.sourceType === "tax_citation" || packet.sourceType === "tax_authority");
  if (authorityPackets.length === 0) return materialIssuePackets.length === 0 ? 1 : 0;
  const freshCount = authorityPackets.filter((packet) => packet.retrievedAt && packet.recencyConfidence >= 0.65 && packet.sourceDate !== null).length;
  return scoreRatio(freshCount, authorityPackets.length);
}

function scoreClientQuestionUsefulness(envelope: ChatArtifactEnvelope): number {
  const materialIssuePackets = envelope.issuePackets.filter((packet) => packet.situationClassification.blocker || packet.missingFacts.length > 0);
  if (materialIssuePackets.length === 0) return 1;
  const usefulCount = materialIssuePackets.filter((packet) => {
    const questionText = packet.recommendedClientQuestions.map((question) => question.question).join(" ").toLowerCase();
    const missingFactTokens = importantTokens(packet.missingFacts.join(" "));
    return packet.recommendedClientQuestions.length > 0 && missingFactTokens.some((token) => questionText.includes(token));
  }).length;
  return scoreRatio(usefulCount, materialIssuePackets.length);
}

function expectedOpenBlockerIds(returnId: string, data: DocketData): string[] {
  return data.taxIssues
    .filter((issue) => issue.taxReturnId === returnId && issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER" && (issue.blocker || issue.riskLevel === "RED"))
    .map((issue) => issue.id);
}

function unsupportedScopeEscalated(envelope: ChatArtifactEnvelope): boolean | null {
  const text = [
    envelope.memo?.headline,
    ...(envelope.memo?.paragraphs ?? []),
    ...envelope.issuePackets.map((packet) => `${packet.title} ${packet.missingFacts.join(" ")} ${packet.preparerTasks.map((task) => task.task).join(" ")}`),
    ...envelope.issueAnalyses.map((analysis) => `${analysis.title} ${analysis.riskRationale} ${analysis.missingFacts.join(" ")}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!/unsupported|crypto|basis|tax-lot|k-1/.test(text)) return null;
  return /unsupported|escalat|reviewer|do not|not automated|change-order|request|obtain|missing/.test(text) && !/ready-to-file stub passed/.test(text);
}

function evaluateReturn(returnId: string, data: DocketData): OrchestratorEvalCaseResult | null {
  const clientFile = docketTools.getClientFile({ returnId }, data);
  if (!clientFile) return null;
  const clientName = clientFile.workbench.client?.displayName ?? "Unknown client";
  const envelope = withMockProvider(() =>
    runTaxChatOrchestrator({
      returnId,
      question: `Run the full reviewer memo for ${clientName}. Include blockers, citations, client questions, and review gate impact.`,
      history: [],
      data,
    }),
  );
  const gate = docketTools.runReviewGateCheck(returnId, "READY_TO_FILE", data);
  const expectedBlocked = !gate.pass;
  const artifactBlocked =
    envelope.memo?.verdict.filingStatus.toLowerCase().includes("not ready") === true ||
    (envelope.memo?.verdict.blockerCount ?? 0) > 0 ||
    envelope.issuePackets.some((packet) => packet.reviewGateImpact.blocksReadyToFile);
  const falseClearance = expectedBlocked && !artifactBlocked;
  const expectedBlockerIds = expectedOpenBlockerIds(returnId, data);
  const packetIssueIds = new Set(envelope.issuePackets.map((packet) => packet.issueId));
  const missedBlockerIds = expectedBlockerIds.filter((issueId) => !packetIssueIds.has(issueId));
  const citationAccuracy = scoreIssueCitationAccuracy(envelope);
  const sourceFreshness = scoreSourceFreshness(envelope);
  const clientQuestionUsefulness = scoreClientQuestionUsefulness(envelope);
  const unsupportedEscalation = unsupportedScopeEscalated(envelope);
  const fallbackUsed = envelope.trace.some((event) => /fallback/i.test(event.summary));
  const passed =
    !falseClearance &&
    missedBlockerIds.length === 0 &&
    citationAccuracy >= 0.65 &&
    sourceFreshness >= 0.65 &&
    clientQuestionUsefulness >= 0.65 &&
    unsupportedEscalation !== false &&
    !fallbackUsed;

  return {
    id: `orchestrator-${returnId}`,
    title: `${clientName} reviewer memo orchestration`,
    clientName,
    returnId,
    passed,
    expectedBlocked,
    artifactBlocked,
    falseClearance,
    missedBlockerIds,
    citationAccuracy,
    sourceFreshness,
    clientQuestionUsefulness,
    unsupportedScopeEscalated: unsupportedEscalation,
    fallbackUsed,
    traceStageCount: envelope.trace.length,
    notes: [
      falseClearance ? "False clearance: expected READY_TO_FILE gate block, but artifact did not block." : "No false clearance.",
      missedBlockerIds.length ? `Missed blocker issue(s): ${missedBlockerIds.join(", ")}.` : "All active blocker issues were represented as EA issue packets.",
      `Citation accuracy ${Math.round(citationAccuracy * 100)}%; source freshness ${Math.round(sourceFreshness * 100)}%; client question usefulness ${Math.round(clientQuestionUsefulness * 100)}%.`,
      unsupportedEscalation === null ? "No unsupported-scope issue in this case." : unsupportedEscalation ? "Unsupported scope escalated." : "Unsupported scope was not escalated.",
      fallbackUsed ? "Model/router fallback was used; deterministic envelope still validated." : "No model/router fallback was needed.",
    ],
  };
}

export function runTaxProBenchOrchestrator(data: DocketData = readDocketData()): OrchestratorBenchMetrics {
  const staticBench = runTaxProBench(data);
  const selectedReturns = data.taxReturns
    .filter((taxReturn) => {
      const client = data.clients.find((item) => item.id === taxReturn.clientId);
      const clientText = `${client?.displayName ?? ""} ${client?.tags?.join(" ") ?? ""}`.toLowerCase();
      const issueText = data.taxIssues
        .filter((issue) => issue.taxReturnId === taxReturn.id)
        .map((issue) => `${issue.title} ${issue.issueType}`)
        .join(" ")
        .toLowerCase();
      return /miguel|priya|crypto|unsupported|1095|1099|k-1|dependent|marketplace|stock|income|mileage|home office/.test(`${clientText} ${issueText}`);
    })
    .slice(0, 8);
  const caseResults = selectedReturns
    .map((taxReturn) => evaluateReturn(taxReturn.id, data))
    .filter((result): result is OrchestratorEvalCaseResult => Boolean(result));

  const blockingCases = caseResults.filter((result) => result.expectedBlocked);
  const falseClearanceCases = caseResults.filter((result) => result.falseClearance);
  const missedBlockerCount = caseResults.reduce((sum, result) => sum + result.missedBlockerIds.length, 0);
  const unsupportedResults = caseResults.filter((result) => result.unsupportedScopeEscalated !== null);
  const fallbackFreeCount = caseResults.filter((result) => !result.fallbackUsed).length;

  return {
    caseCount: caseResults.length,
    passedCaseCount: caseResults.filter((result) => result.passed).length,
    failedCaseCount: caseResults.filter((result) => !result.passed).length,
    falseClearanceRate: blockingCases.length === 0 ? 0 : Math.round((falseClearanceCases.length / blockingCases.length) * 100),
    missedBlockerCount,
    citationAccuracy: caseResults.length ? average(caseResults.map((result) => result.citationAccuracy)) : staticBench.citationCorrectness,
    sourceFreshness: caseResults.length ? average(caseResults.map((result) => result.sourceFreshness)) : 0,
    clientQuestionUsefulness: caseResults.length ? average(caseResults.map((result) => result.clientQuestionUsefulness)) : 0,
    unsupportedScopeEscalation:
      unsupportedResults.length === 0
        ? Number(staticBench.unsupportedAreaEscalationPassed)
        : scoreRatio(unsupportedResults.filter((result) => result.unsupportedScopeEscalated).length, unsupportedResults.length),
    fallbackFreeRate: caseResults.length === 0 ? 0 : scoreRatio(fallbackFreeCount, caseResults.length),
    caseResults,
  };
}
