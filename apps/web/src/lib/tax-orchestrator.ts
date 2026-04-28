import { synthesizeTaxArtifactsWithClaude } from "@docket/ai";
import {
  ChatArtifactEnvelopeSchema,
  artifactConfidence,
  contentHashForEnvelope,
  docketTools,
  type DocketData,
  type ChatArtifactEnvelope,
  type CitationArtifact,
  type FactNode,
  type IssueAnalysisArtifact,
  type IssueReasoningPacket,
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
  data?: DocketData;
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
  if (/\bwhat do we need to do\b|\bwhat should we do\b|\bwhat'?s next\b|\bwhat needs to happen\b|\bwhat are the next steps\b|\bcatch me up\b|\bwhere (do|should) we start\b/.test(q)) return "deep_memo";
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
      if (/K1|K_1|PARTNERSHIP/i.test(issueType) || query.includes("k-1")) {
        if (haystack.includes("schedule e") || haystack.includes("partnership") || haystack.includes("k-1")) score += 4;
      }
      if (/CAPITAL|1099.?B|BROKER|WASH/i.test(issueType) || query.includes("1099-b")) {
        if (haystack.includes("1099-b") || haystack.includes("form 8949") || haystack.includes("schedule d") || haystack.includes("broker")) score += 4;
      }
      if (/CRYPTO|DIGITAL|UNSUPPORTED/i.test(issueType) || query.includes("crypto") || query.includes("tax-lot")) {
        if (haystack.includes("digital asset") || haystack.includes("virtual currency") || haystack.includes("form 8949") || haystack.includes("unsupported")) score += 4;
      }
      if (/EDUCATION|1098.?T/i.test(issueType) || query.includes("education")) {
        if (haystack.includes("education") || haystack.includes("1098-t") || haystack.includes("tuition")) score += 4;
      }
      if (/DEPENDENT|CHILD.?CARE/i.test(issueType) || query.includes("dependent care") || query.includes("childcare")) {
        if (haystack.includes("dependent care") || haystack.includes("childcare") || haystack.includes("provider") || haystack.includes("503")) score += 4;
      }
      if (/1098|MORTGAGE|RENTAL/i.test(issueType) || query.includes("mortgage")) {
        if (haystack.includes("1098") || haystack.includes("mortgage") || haystack.includes("936") || haystack.includes("rental")) score += 4;
      }
      if (/1099.?R|RETIREMENT|PENSION|IRA/i.test(issueType) || query.includes("retirement")) {
        if (haystack.includes("1099-r") || haystack.includes("retirement") || haystack.includes("pension") || haystack.includes("ira")) score += 4;
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

function buildReconciliationTables(returnId: string, issueIds: string[], data?: DocketData): ReconciliationTableArtifact[] {
  const table = docketTools.buildReconciliationTable(returnId, "gross receipts income 1099 nec 1099 k client claim", issueIds[0] ?? null, data);
  return table ? [table] : [];
}

function sourcePacketsByType(sourcePacket: SourcePacketItem[], ids: string[], types: SourcePacketItem["sourceType"][]): string[] {
  const idSet = new Set(ids);
  return sourcePacket
    .filter((packet) => idSet.has(packet.sourceId) && types.includes(packet.sourceType))
    .map((packet) => packet.id);
}

function packetIdsForSourceIds(sourcePacket: SourcePacketItem[], sourceIds: string[]): string[] {
  const sourceIdSet = new Set(sourceIds);
  return sourcePacket.filter((packet) => sourceIdSet.has(packet.sourceId)).map((packet) => packet.id);
}

function packetExcerpt(sourcePacket: SourcePacketItem[], packetId: string): string {
  const packet = sourcePacket.find((item) => item.id === packetId);
  return packet ? `${packet.label}: ${packet.excerpt}` : packetId;
}

function dollarsFromText(text: string): number[] {
  return Array.from(text.matchAll(/\$?\b(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d{2})?\b/g))
    .map((match) => Number(match[1]?.replaceAll(",", "")))
    .filter((value) => Number.isFinite(value) && value >= 2000 && value !== 1099 && value !== 1095 && (value < 1900 || value > 2100));
}

function issueSpecificSmellTests(issue: OrchestratorIssue, sourcePacket: SourcePacketItem[], issuePacketIds: string[]): string[] {
  const issueText = `${issue.issueType} ${issue.title} ${issue.description}`.toLowerCase();
  const evidenceText = issuePacketIds.map((id) => packetExcerpt(sourcePacket, id)).join(" ");
  const dollars = dollarsFromText(evidenceText);
  const tests: string[] = [];

  if (/1099-b|broker|stock|capital/.test(issueText)) {
    tests.push("A stock-sale mention needs proceeds, basis, holding period, and wash-sale detail.");
    tests.push("Prior-year brokerage activity makes a missing consolidated 1099 more plausible.");
  } else if (/1095|marketplace|premium/.test(issueText)) {
    tests.push("Reconcile annual premiums, SLCSP, and APTC against coverage months before clearing ACA items.");
    tests.push("Part-year marketplace coverage can still be material even if employer coverage began later.");
  } else if (/1099|income|gross|receipts/.test(issueText)) {
    const uniqueDollars = Array.from(new Set(dollars)).slice(0, 4);
    if (uniqueDollars.length >= 2) tests.push(`Compare reported amounts side by side: ${uniqueDollars.map((amount) => amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })).join(" vs ")}.`);
    tests.push("Check whether processor totals include payer forms before adding both to Schedule C gross receipts.");
    tests.push("Do not accept a client estimate as final gross receipts without a payer/payment-channel bridge.");
  } else if (/home.office|exclusive/.test(issueText)) {
    tests.push("Any personal or guest use undercuts exclusive-use support.");
    tests.push("Treat home office as an opportunity until square footage and use facts are verified.");
  } else if (/mileage|vehicle|auto/.test(issueText)) {
    tests.push("Partial-year mileage support should not be extrapolated into a full-year deduction.");
    tests.push("Mileage needs date, destination, miles, and business purpose support.");
  } else if (/dependent|childcare|child care/.test(issueText)) {
    tests.push("Provider name, TIN/EIN, amount paid, and work-related care purpose need to agree before credit review.");
    tests.push("A statement alone is not enough if payment support or provider ID is incomplete.");
  } else if (/k-?1|partnership|schedule e/.test(issueText)) {
    tests.push("K-1 income should not be copied into Schedule E until basis, passive activity, and at-risk limitations are reviewed.");
    tests.push("Footnotes can change the return treatment even when the main K-1 boxes look complete.");
  } else if (/crypto|digital|tax.lot/.test(issueText)) {
    tests.push("Missing cost-basis lots can turn a seemingly complete exchange export into an unsupported capital gain position.");
    tests.push("Wallet transfers need source confirmation before treating them as nontaxable movements.");
  } else if (/resident|residency|state|move/.test(issueText)) {
    tests.push("A mid-year move needs exact move date, domicile facts, and workday allocation.");
    tests.push("A W-2 employer in the former state can create allocation review even after a move.");
  }

  tests.push(issue.blocker ? "False clearance would move a blocked return toward filing without the required evidence." : "Clearance depends on documenting the missing fact and reviewer judgment.");
  return Array.from(new Set(tests)).slice(0, 5);
}

function buildIssueReasoningPackets(input: {
  workbench: OrchestratorWorkbench;
  selectedIssues: OrchestratorIssue[];
  sourcePacket: SourcePacketItem[];
  factGraph: FactNode[];
  preparerTasks: PreparerTaskArtifact[];
  readyToFileGate: ReturnType<typeof docketTools.runReviewGateCheck>;
}): IssueReasoningPacket[] {
  return input.selectedIssues.map((issue) => {
    const issuePacketIds = packetIdsForSourceIds(input.sourcePacket, issue.sourceIds);
    const authoritySourcePacketIds = localAuthorityPacketIds(input.sourcePacket, issue.title, issue.issueType);
    const verifiedFacts = input.factGraph.filter((fact) => issue.sourceIds.includes(fact.id.replace(/^fact-node-/, "")) || fact.sourcePacketIds.some((packetId) => issuePacketIds.includes(packetId)));
    const relatedQuestions = input.workbench.questions.filter((question) => question.relatedIssueId === issue.id);
    const relatedTasks = input.preparerTasks.filter((task) => task.relatedIssueId === issue.id);
    const sourceIds = new Set(issue.sourceIds);
    const missingDocumentPackets = input.sourcePacket.filter((packet) => packet.sourceType === "missing_document" && (packet.excerpt.toLowerCase().includes(issue.title.toLowerCase().split(" ")[0] ?? "") || issue.description.toLowerCase().includes(packet.label.toLowerCase())));
    const documentEvidencePacketIds = sourcePacketsByType(input.sourcePacket, issue.sourceIds, ["document", "tax_fact"]);
    const clientClaimPacketIds = sourcePacketsByType(input.sourcePacket, issue.sourceIds, ["client_claim"]);
    const conversationClaimPacketIds = sourcePacketsByType(input.sourcePacket, issue.sourceIds, ["conversation"]);
    const priorYearPatternPacketIds = sourcePacketsByType(input.sourcePacket, issue.sourceIds, ["prior_year_pattern"]);
    const evidencePacketIds = Array.from(new Set([...issuePacketIds, ...documentEvidencePacketIds, ...clientClaimPacketIds, ...conversationClaimPacketIds, ...missingDocumentPackets.map((packet) => packet.id)]));
    const missingFacts = Array.from(
      new Set([
        ...relatedQuestions.map((question) => question.question),
        issue.recommendedAction,
        ...missingDocumentPackets.map((packet) => `Obtain or waive ${packet.label}.`),
      ]),
    ).filter(Boolean);

    return {
      id: `issue-packet-${issue.id}`,
      issueId: issue.id,
      title: issue.title,
      situationClassification: {
        mode: issue.issueType.replaceAll("_", " ").toLowerCase(),
        taxYear: input.workbench.taxReturn.taxYear,
        jurisdiction: input.workbench.taxReturn.jurisdiction,
        returnType: input.workbench.taxReturn.returnType,
        riskLevel: issue.riskLevel,
        blocker: issue.blocker,
      },
      reconstructedFacts: verifiedFacts.map((fact) => ({
        factNodeId: fact.id,
        label: fact.label,
        value: fact.value,
        reviewerState: fact.reviewerState,
        sourcePacketIds: fact.sourcePacketIds,
      })),
      verifiedFactNodeIds: verifiedFacts.map((fact) => fact.id),
      clientClaimPacketIds,
      conversationClaimPacketIds,
      documentEvidencePacketIds,
      authoritySourcePacketIds,
      priorYearPatternPacketIds,
      missingFacts,
      evidencePacketIds,
      smellTests: issueSpecificSmellTests(issue, input.sourcePacket, evidencePacketIds),
      reviewGateImpact: {
        blocksReadyToFile: issue.blocker || input.readyToFileGate.blockers.some((blocker) => blocker.toLowerCase().includes("red") || blocker.toLowerCase().includes("blocking")),
        readyToFileBlockers: input.readyToFileGate.blockers,
        materiality: issue.riskLevel === "RED" ? "HIGH" : issue.riskLevel === "YELLOW" ? "MEDIUM" : "LOW",
        falseClearanceRisk: issue.blocker
          ? "Would allow a filing workflow to proceed while a material source-backed issue remains unresolved."
          : "Would reduce reviewer visibility into a fact pattern that still needs documentation.",
      },
      recommendedClientQuestions: relatedQuestions.map((question) => ({
        id: `question-${question.id}`,
        question: question.question,
        sourcePacketIds: packetIdsForSourceIds(input.sourcePacket, question.evidenceRefs.map((evidence) => evidence.sourceId)),
      })),
      preparerTasks: relatedTasks.map((task) => ({
        id: task.id,
        task: task.task,
        sourcePacketIds: task.sourcePacketIds,
      })),
      clearanceStandard: issue.blocker
        ? "Clear only after missing evidence is attached, the issue is resolved or formally overridden, and reviewer approval is recorded."
        : "Clear only after missing facts are documented and the reviewer accepts the position or marks it nonblocking.",
      assumptionsToAvoid: [
        "Do not treat client statements as verified tax facts.",
        "Do not use model memory as authority.",
        "Do not mark ready to file from workflow readiness percentage alone.",
        ...(!sourceIds.size ? ["Do not clear an issue that has no direct source packet attached."] : []),
      ],
      confidence: artifactConfidence("Issue reasoning packet is built deterministically from source packets, fact graph nodes, authority retrieval, and review gates.", {
        overall: issue.blocker ? 0.86 : 0.76,
        sourceSupport: evidencePacketIds.length ? 0.8 : 0.45,
        retrievalConfidence: 0.86,
        authorityFit: authoritySourcePacketIds.length ? 0.78 : 0.42,
        reviewState: issue.blocker ? "NEEDS_EVIDENCE" : "UNREVIEWED",
      }),
    };
  });
}

function selectRelevantSourcePacket(
  fullSourcePacket: SourcePacketItem[],
  selectedIssues: OrchestratorIssue[],
  workbench: OrchestratorWorkbench,
  question: string,
  intent: OrchestratorIntent,
  data?: DocketData,
): SourcePacketItem[] {
  const allowedSourceIds = new Set<string>();
  const allowedPacketIds = new Set<string>();
  const activeMissingDocuments = workbench.missingDocuments.filter((document) => document.status !== "RECEIVED" && document.status !== "WAIVED");
  const selectedIssueText = selectedIssues.map((issue) => `${issue.title} ${issue.description} ${issue.issueType} ${issue.recommendedAction}`).join(" ").toLowerCase();

  for (const issue of selectedIssues) {
    allowedSourceIds.add(issue.id);
    for (const sourceId of issue.sourceIds) allowedSourceIds.add(sourceId);
    for (const packetId of localAuthorityPacketIds(fullSourcePacket, issue.title, issue.issueType)) allowedPacketIds.add(packetId);
    for (const packet of docketTools.retrieveAuthority(`${issue.title} ${issue.issueType}`, workbench.taxReturn.taxYear, workbench.taxReturn.jurisdiction, data)) {
      allowedPacketIds.add(packet.id);
    }
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
  const clientFile = docketTools.getClientFile({ returnId: input.returnId }, input.data);
  if (!clientFile) throw new Error(`No return found for orchestrator returnId ${input.returnId}`);

  const { workbench, sourcePacket: fullSourcePacket, factGraph } = clientFile;
  const intent = classifyIntent(input.question);
  const activeIssues = workbench.issues.filter((issue) => issue.status !== "RESOLVED" && issue.status !== "WAIVED_BY_REVIEWER");
  const selectedIssues = intent === "client_lookup" ? [] : activeIssues.slice(0, intent === "client_status" ? 2 : 6);
  const sourcePacket = selectRelevantSourcePacket(fullSourcePacket, selectedIssues, workbench, input.question, intent, input.data);
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
  const readyToFileGate = docketTools.runReviewGateCheck(input.returnId, "READY_TO_FILE", input.data);
  const issuePackets = buildIssueReasoningPackets({
    workbench,
    selectedIssues,
    sourcePacket,
    factGraph,
    preparerTasks,
    readyToFileGate,
  });
  const issuePacketByIssueId = new Map(issuePackets.map((packet) => [packet.issueId, packet]));

  const issueAnalyses: IssueAnalysisArtifact[] = selectedIssues.map((issue, index) => {
    const issuePacketIds = sourceIdsForIssue(issue.sourceIds, sourcePacket);
    const issuePacket = issuePacketByIssueId.get(issue.id);
    const authorityPacketIds = issuePacket?.authoritySourcePacketIds ?? localAuthorityPacketIds(sourcePacket, issue.title, issue.issueType);
    const relatedQuestions = workbench.questions.filter((question) => question.relatedIssueId === issue.id);
    const relatedWorkpapers = workbench.workpapers.filter((workpaper) => workpaper.body.toLowerCase().includes(issue.title.toLowerCase().split(" ")[0] ?? ""));
    return {
      id: `artifact-analysis-${issue.id}`,
      issueId: issue.id,
      title: issue.title,
      riskLevel: issue.riskLevel,
      blocker: issue.blocker,
      reviewerState: issue.status === "CLIENT_QUESTION_PENDING" || issue.blocker ? "NEEDS_EVIDENCE" : "UNREVIEWED",
      situationMode: issuePacket?.situationClassification.mode ?? issue.issueType.replaceAll("_", " ").toLowerCase(),
      factPatternSummary: issuePacket
        ? `${issue.description} Reconstructed ${issuePacket.reconstructedFacts.length} verified fact(s), ${issuePacket.clientClaimPacketIds.length + issuePacket.conversationClaimPacketIds.length} claim packet(s), and ${issuePacket.missingFacts.length} missing fact(s).`
        : issue.description,
      verifiedFactNodeIds: issuePacket?.verifiedFactNodeIds ?? factGraph.filter((fact) => issue.sourceIds.includes(fact.id.replace(/^fact-node-/, ""))).map((fact) => fact.id),
      claimSourcePacketIds: issuePacket ? [...issuePacket.clientClaimPacketIds, ...issuePacket.conversationClaimPacketIds] : issuePacketIds.filter((id) => sourcePacket.find((packet) => packet.id === id)?.authorityTier === "UNTRUSTED_INPUT"),
      missingFacts: issuePacket?.missingFacts ?? (relatedQuestions.length ? relatedQuestions.map((question) => question.question) : [issue.recommendedAction]),
      authoritySourcePacketIds: authorityPacketIds,
      smellTests: issuePacket?.smellTests ?? [
        issue.blocker ? "This issue blocks filing or materially affects filing readiness." : "This issue requires review before the related position is accepted.",
        issue.sourceIds.length ? "Source packets are attached and should be reviewed before clearance." : "No direct source packet is attached yet; request evidence before clearance.",
        issue.riskLevel === "RED" ? "False clearance would make the return look safer than the current evidence supports." : "Clearance depends on resolving the listed missing facts.",
      ],
      riskRationale: issuePacket?.reviewGateImpact.falseClearanceRisk ?? issue.description,
      clientQuestionIds: issuePacket?.recommendedClientQuestions.map((question) => question.id) ?? relatedQuestions.map((question) => `question-${question.id}`),
      preparerTaskIds: issuePacket?.preparerTasks.map((task) => task.id) ?? [`task-${issue.id}`],
      workpaperIds: relatedWorkpapers.map((workpaper) => `workpaper-${workpaper.id}`),
      citationIds: authorityPacketIds.map((id) => `artifact-citation-${sourcePacket.find((packet) => packet.id === id)?.sourceId ?? id}`),
      confidence: artifactConfidence("Issue analysis is produced from a deterministic EA issue packet: facts, claims, evidence, authority, missing facts, smell tests, and review gate impact.", {
        overall: issue.blocker ? 0.82 : 0.72,
        sourceSupport: issuePacket?.evidencePacketIds.length ? 0.8 : issuePacketIds.length ? 0.78 : 0.52,
        retrievalConfidence: 0.84,
        authorityFit: authorityPacketIds.length ? 0.76 : 0.45,
        reviewState: issue.blocker ? "NEEDS_EVIDENCE" : "UNREVIEWED",
      }),
    };
  });
  traces.push(trace("issue_reasoning", `Built ${issuePackets.length} EA issue packet(s) and ${issueAnalyses.length} issue artifact(s), one per selected active issue.`, "reasonPerIssue", input.question, issuePackets.flatMap((packet) => [...packet.evidencePacketIds, ...packet.authoritySourcePacketIds])));

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
    ? buildReconciliationTables(input.returnId, selectedIssues.map((issue) => issue.id), input.data)
    : [];
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
    issuePackets,
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
