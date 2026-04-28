import {
  docketTools,
  readDocketData,
  type DocketData,
  type SourcePacketItem,
} from "@docket/domain";

import type {
  ChatAnswer,
  ReasoningTraceStep,
  SourceIndexEntry,
  TaxChatResponse,
} from "./tax-chat-shared";
import type {
  ClientFileRetrieverRequest,
  ClientFileRetrieverResult,
  EvidenceItem,
  RetrieverContext,
  TaxRetrieverResult,
  TaxRetrieverReliability,
} from "./tax-agent-retrievers";

const MIGUEL_CLIENT_ID = "client-miguel-sandoval";
const MIGUEL_RETURN_ID = "return-miguel-2024";
const DEFAULT_CONTEXT: RetrieverContext = {
  firmId: "firm-riverbend-tax",
  userId: "user-smoke-test",
  conversationId: "conversation-smoke-test",
  requestId: "request-smoke-test",
  loadedClientId: MIGUEL_CLIENT_ID,
  taxYear: 2024,
};

type SmokeRefusalType =
  | "section_7216_disclosure"
  | "section_6103_pii"
  | "section_7216_use"
  | "tax_court_scope";

export type SmokePreclassification = {
  refusalRequired: boolean;
  refusalType: SmokeRefusalType | null;
  reason: string | null;
};

export type SmokeValidation = {
  passed: boolean;
  errors: string[];
  citedSourceIds: string[];
};

export type TaxAgentSmokeResponse = TaxChatResponse & {
  preclassification: SmokePreclassification;
  retrieverResults: TaxRetrieverResult[];
  validation: SmokeValidation;
};

type TraceEmitter = (step: ReasoningTraceStep) => void;

function compactText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeTraceStep(id: string, label: string, status: ReasoningTraceStep["status"], summary?: string): ReasoningTraceStep {
  return {
    id,
    label,
    status,
    ...(summary ? { summary } : {}),
    timestamp: nowIso(),
  };
}

function recordTrace(
  trace: ReasoningTraceStep[],
  emit: TraceEmitter | undefined,
  id: string,
  label: string,
  status: ReasoningTraceStep["status"],
  summary?: string,
) {
  const step = makeTraceStep(id, label, status, summary);
  const existingIndex = trace.findIndex((item) => item.id === id);
  if (existingIndex >= 0) trace[existingIndex] = step;
  else trace.push(step);
  emit?.(step);
}

export function preclassifyTaxAgentSmoke(question: string): SmokePreclassification {
  const q = compactText(question);
  const hasClientTaxInfo = /\b(tax info|tax information|return|documents?|client file|workpapers?|ssn|social security|miguel)\b/.test(q);
  const hasSendVerb = /\b(email|e-mail|send|forward|export|upload|share|copy)\b/.test(q);
  const hasPersonalDestination = /\b(gmail|personal email|personal e-mail|personal account|home email|home e-mail|private email|private e-mail|work from home)\b/.test(q);

  if (hasClientTaxInfo && hasSendVerb && hasPersonalDestination) {
    return {
      refusalRequired: true,
      refusalType: "section_7216_disclosure",
      reason: "Prompt asks to move client tax return information to a personal email or off-system destination.",
    };
  }

  if (/\b(show|display|tell me|give me|what(?:'s| is))\b.*\b(ssn|social security number)\b/.test(q) || /\bssn\b.*\b(client|miguel)\b/.test(q)) {
    return {
      refusalRequired: true,
      refusalType: "section_6103_pii",
      reason: "Prompt asks to display a full taxpayer identifying number in chat.",
    };
  }

  if (/\b(upsell|up-sell|solicit|marketing|sell (?:more|additional)|cross-sell|cross sell)\b/.test(q) && /\b(income|highest income|refund|balance due|wealth|fee|fees|deductions?)\b/.test(q)) {
    return {
      refusalRequired: true,
      refusalType: "section_7216_use",
      reason: "Prompt asks to use tax return information for solicitation or marketing targeting.",
    };
  }

  if (/\b(tax court|petition|pleading|legal brief|docketed case)\b/.test(q) && /\b(draft|write|file|submit|defend|represent)\b/.test(q)) {
    return {
      refusalRequired: true,
      refusalType: "tax_court_scope",
      reason: "Prompt asks for legal representation work product that requires professional scope controls.",
    };
  }

  return { refusalRequired: false, refusalType: null, reason: null };
}

function sourceReliability(reliability: SourcePacketItem["reliability"]): TaxRetrieverReliability {
  return reliability;
}

function evidenceFromPacket(packet: SourcePacketItem): EvidenceItem {
  return {
    id: `evidence-${packet.id}`,
    source: {
      type: packet.sourceType,
      id: packet.sourceId,
      label: packet.label,
    },
    content: packet.excerpt,
    citation: {
      label: packet.label,
      sourceId: packet.id,
      sourceUrl: packet.sourceUrl,
      locator: packet.sourceType,
    },
    provenance: {
      sourceSystem: "docket-source-packet",
      capturedAt: packet.retrievedAt,
      capturedBy: null,
      reviewStatus: packet.reliability,
    },
    confidence: {
      sourceReliability: sourceReliability(packet.reliability),
      retrievalConfidence: packet.retrievalConfidence,
    },
    sourcePacket: packet,
  };
}

function packetMatchesTopic(packet: SourcePacketItem, topic: string): boolean {
  const terms = compactText(topic)
    .split(/\W+/)
    .filter((term) => term.length > 2 && !["what", "need", "miguel", "client", "return"].includes(term));
  if (terms.length === 0) return true;
  const haystack = compactText(`${packet.label} ${packet.excerpt}`);
  return terms.some((term) => haystack.includes(term));
}

export function retrieveClientFileSmoke(
  request: ClientFileRetrieverRequest,
  data: DocketData = readDocketData(),
): ClientFileRetrieverResult {
  const started = Date.now();
  const clientFile = docketTools.getClientFile({ clientId: request.clientId }, data);

  if (!clientFile) {
    return {
      retrieverId: "client_file",
      status: "miss",
      evidence: [],
      metadata: {
        queryActuallyRun: `getClientFile(clientId=${request.clientId})`,
        resultCount: 0,
        truncated: false,
        latencyMs: Date.now() - started,
        errors: [
          {
            code: "RETRIEVAL_ERROR",
            message: `No client file found for ${request.clientId}.`,
            retriable: false,
          },
        ],
      },
      gaps: [],
      reliability: "low",
      client: null,
    };
  }

  const sourceTypes = new Set<SourcePacketItem["sourceType"]>(["tax_fact", "document", "issue", "missing_document"]);
  const topic = request.topic ?? "";
  const allEvidence = clientFile.sourcePacket
    .filter((packet) => sourceTypes.has(packet.sourceType))
    .filter((packet) => request.scope === "topic_focused" && topic ? packetMatchesTopic(packet, topic) : true)
    .map(evidenceFromPacket);
  const evidence = allEvidence.slice(0, request.scope === "full" ? 40 : 24);
  const workbench = clientFile.workbench;
  const blockerCount = workbench.issues.filter((issue) => issue.blocker && !issue.resolvedAt).length;

  return {
    retrieverId: "client_file",
    status: evidence.length > 0 ? "hit" : "miss",
    evidence,
    metadata: {
      queryActuallyRun: `getClientFile(clientId=${request.clientId}); evidenceTypes=tax_fact,document,issue,missing_document`,
      resultCount: evidence.length,
      truncated: evidence.length < allEvidence.length,
      latencyMs: Date.now() - started,
      errors: evidence.length > 0
        ? []
        : [
            {
              code: "EMPTY_RESULT",
              message: "Client file loaded, but no smoke-supported evidence types matched the request.",
              retriable: false,
            },
          ],
    },
    gaps: ["intake answers, conversations, prior-year rollforwards, portfolio filters, and authority retrieval are outside this smoke loop"],
    reliability: evidence.some((item) => item.confidence.sourceReliability === "high") ? "high" : "medium",
    client: {
      id: workbench.client?.id ?? request.clientId,
      displayName: workbench.client?.displayName ?? "Unknown client",
      returnType: workbench.taxReturn.returnType,
      taxYear: workbench.taxReturn.taxYear,
      profileSummary: `${workbench.client?.displayName ?? "Client"} is a ${workbench.taxReturn.returnType} file with tags ${workbench.client?.tags.join(", ") || "none"}; readiness ${workbench.readiness.readinessScore}% and extension risk ${workbench.extension.extensionRiskScore}%.`,
    },
    workflowState: {
      readinessScore: workbench.readiness.readinessScore,
      extensionRisk: workbench.extension.extensionRiskScore,
      blockersCount: blockerCount,
      reviewGateStatus: workbench.readyToFileGate.pass ? "pass" : "blocked",
    },
  };
}

function firstEvidence(result: ClientFileRetrieverResult, pattern: RegExp): EvidenceItem | null {
  return result.evidence.find((item) => pattern.test(`${item.source.label} ${String(item.content ?? "")}`)) ?? null;
}

function cite(item: EvidenceItem | null): string {
  return item?.sourcePacket ? `[${item.sourcePacket.id}]` : "";
}

function citedItems(items: Array<EvidenceItem | null>): EvidenceItem[] {
  const seen = new Set<string>();
  return items.filter((item): item is EvidenceItem => {
    if (!item?.sourcePacket || seen.has(item.sourcePacket.id)) return false;
    seen.add(item.sourcePacket.id);
    return true;
  });
}

function answerBase(mode: ChatAnswer["mode"], headline: string): ChatAnswer {
  return {
    mode,
    headline,
    answer: [],
    reasoningSummary: [],
    nextSteps: [],
    sourceIds: [],
    citationIds: [],
    suggestedFollowups: [],
  };
}

function synthesizeMiguelSmokeMemo(question: string, result: ClientFileRetrieverResult): ChatAnswer {
  const incomeIssue = firstEvidence(result, /freelance income does not reconcile/i);
  const overlapIssue = firstEvidence(result, /1099-k and 1099-nec overlap/i);
  const missing1099B = firstEvidence(result, /missing 1099-b/i);
  const residencyIssue = firstEvidence(result, /ca to tx move/i);
  const necDoc = firstEvidence(result, /bluepeak_1099_nec|bluepeak.*1099-nec|nonemployee compensation.*42000/i);
  const stripeDoc = firstEvidence(result, /stripe_1099_k|stripe.*1099-k|gross amount.*63000/i);
  const cited = citedItems([incomeIssue, overlapIssue, missing1099B, residencyIssue, necDoc, stripeDoc]);
  const sourceIds = cited.map((item) => item.sourcePacket?.id).filter((id): id is string => Boolean(id));
  const answer: ChatAnswer = {
    ...answerBase("client-return", "Miguel smoke memo: not ready to file"),
    answer: [
      `Miguel is not ready to file. The smoke client-file retriever found open blocker issues for "Freelance income does not reconcile" and the missing brokerage 1099-B ${cite(incomeIssue)} ${cite(missing1099B)}.`,
      `First action: reconcile Schedule C gross receipts before anyone clears the return. The file shows Bluepeak 1099-NEC support at $42,000 and Stripe 1099-K support at $63,000, while the open issue says Miguel reported about $85,000 and needs overlap analysis ${cite(necDoc)} ${cite(stripeDoc)} ${cite(incomeIssue)} ${cite(overlapIssue)}.`,
      `Second action: request the consolidated brokerage 1099 or transaction statement for the Tesla sale mention. The file should stay blocked until proceeds, basis, holding period, and wash-sale detail are in the record ${cite(missing1099B)}.`,
      `Also keep the CA-to-TX move in reviewer review before accepting state treatment. The issue on file says the move happened mid-year while the W-2 employer was in California ${cite(residencyIssue)}.`,
    ],
    reasoningSummary: [
      "Ran the smoke client-file retriever only for Miguel, limited to structured facts, uploaded documents, open issues, and missing-document signals.",
      "Synthesis used only source-packet evidence returned by the retriever; this path intentionally does not call portfolio, conversation, document-content, or authority retrieval yet.",
    ],
    nextSteps: [
      "Build the payer/payment-channel bridge for Bluepeak and Stripe.",
      "Ask Miguel for the 2024 consolidated brokerage 1099 or transaction statement.",
      "Route CA-to-TX residency facts to reviewer before final state allocation.",
    ],
    sourceIds,
    citationIds: sourceIds,
    suggestedFollowups: [
      "Run the same smoke loop with conversation retrieval enabled.",
      "Add document-content retrieval for exact box-level citations.",
    ],
  };
  if (!question.toLowerCase().includes("miguel")) {
    answer.limitation = "Smoke loop defaults to Miguel only until multi-client orchestration is wired.";
  }
  return answer;
}

function synthesizeRefusal(preclassification: SmokePreclassification): ChatAnswer {
  if (preclassification.refusalType === "section_6103_pii") {
    return {
      ...answerBase("client-return", "I won't display taxpayer identifying information in chat"),
      answer: [
        "I won't show a full SSN or taxpayer identifying number in this chat. That belongs in the firm's secure tax software or document vault, not a transcript that can be logged, cached, copied, or shared.",
        "Use a masked identifier for workflow confirmation, such as the last four digits, and keep the full value in the secure client record.",
      ],
      reasoningSummary: ["Pre-classifier caught a taxpayer-identifying-information disclosure request before retrieval."],
      nextSteps: ["Open the secure client record for the full value, or continue here with a masked identifier."],
      sourceIds: [],
      citationIds: [],
    };
  }

  if (preclassification.refusalType === "section_7216_use") {
    return {
      ...answerBase("firm-portfolio", "I can't rank clients for upsell targeting from return data"),
      answer: [
        "I can't use client tax return information to rank or target clients for upselling. That is a Section 7216 use issue unless the firm has a valid taxpayer consent covering that specific use.",
        "For practice management, use non-return-information signals such as engagement scope, service requests, or firm-approved client relationship fields.",
      ],
      reasoningSummary: ["Pre-classifier caught a solicitation or marketing use of tax return information before portfolio retrieval."],
      nextSteps: ["Route any marketing segmentation through the firm's Section 7216 consent and WISP process before using return facts."],
      sourceIds: [],
      citationIds: [],
    };
  }

  if (preclassification.refusalType === "tax_court_scope") {
    return {
      ...answerBase("client-return", "I can't draft Tax Court pleadings from this smoke path"),
      answer: [
        "I can't draft or file Tax Court pleadings as if I were admitted counsel. The safe support task is to prepare a factual issue memo, source packet, and question list for a qualified representative.",
      ],
      reasoningSummary: ["Pre-classifier caught legal-representation work product before retrieval."],
      nextSteps: ["Confirm representation scope and prepare a non-filing research memo instead."],
      sourceIds: [],
      citationIds: [],
    };
  }

  return {
    ...answerBase("client-return", "I can't send client tax information to personal email"),
    answer: [
      "I won't email Miguel's tax information to a personal Gmail or other off-system account. Moving client return information outside the firm's controlled environment is a Section 7216 disclosure problem and a safeguards problem.",
      "Use firm-sanctioned remote access, the encrypted document vault, VPN, or the approved client portal. If that path is broken, escalate it as an IT and WISP issue instead of copying the file to personal email.",
    ],
    reasoningSummary: ["Pre-classifier caught a personal-email disclosure trigger before any retrieval ran."],
    nextSteps: ["Document that the personal-email request was declined and use the sanctioned remote-work channel."],
    sourceIds: [],
    citationIds: [],
  };
}

function isPortfolioQuestion(question: string): boolean {
  const q = compactText(question);
  return /\b(which|who|everyone|clients?|files?|book|portfolio|rank|list|across)\b/.test(q) && !/\bmiguel\b/.test(q);
}

function synthesizeUnsupportedPortfolioSmoke(question: string): ChatAnswer {
  return {
    ...answerBase("firm-portfolio", "Portfolio smoke path is not wired yet"),
    answer: [
      "The Miguel smoke loop currently has only the client-file retriever wired. It cannot run a source-backed cross-client portfolio filter yet, and it will not substitute the old generic urgency queue.",
      `For this prompt, the next required retriever is portfolio.retrieve. Until that exists in the smoke path, the honest answer is: no source-backed portfolio result was generated for "${question}".`,
    ],
    reasoningSummary: [
      "Detected a portfolio-shaped prompt after compliance preflight.",
      "Stopped before the legacy default queue could answer a filter question it did not actually evaluate.",
    ],
    nextSteps: ["Wire portfolio.retrieve next, then rerun this prompt as the FBAR and foreign-account failure-mode test."],
    sourceIds: [],
    citationIds: [],
  };
}

function buildSourceIndex(results: TaxRetrieverResult[]): Record<string, SourceIndexEntry> {
  const entries: Record<string, SourceIndexEntry> = {};
  for (const result of results) {
    for (const item of result.evidence) {
      if (!item.sourcePacket) continue;
      entries[item.sourcePacket.id] = {
        id: item.sourcePacket.id,
        type: item.sourcePacket.sourceType,
        label: item.sourcePacket.label,
        detail: item.sourcePacket.excerpt,
      };
    }
  }
  return entries;
}

function citedSourceIds(answer: ChatAnswer): string[] {
  const text = [...answer.answer, ...answer.reasoningSummary, ...answer.nextSteps].join("\n");
  return [...text.matchAll(/\[(packet-[^\]\s]+)\]/g)].map((match) => match[1]!).filter(Boolean);
}

export function validateTaxAgentSmokeOutput(
  answer: ChatAnswer,
  retrieverResults: TaxRetrieverResult[],
  preclassification: SmokePreclassification,
): SmokeValidation {
  const errors: string[] = [];
  const cited = citedSourceIds(answer);
  const availableIds = new Set(
    retrieverResults.flatMap((result) => result.evidence.map((item) => item.sourcePacket?.id).filter((id): id is string => Boolean(id))),
  );

  for (const sourceId of cited) {
    if (!availableIds.has(sourceId)) errors.push(`Citation ${sourceId} was not returned by a retriever.`);
  }

  const text = [answer.headline, ...answer.answer].join(" ").toLowerCase();
  if (preclassification.refusalRequired) {
    if (retrieverResults.length > 0) errors.push("Refusal preflight should stop before retrieval.");
    if (!/\b(can't|cannot|won't|will not)\b/.test(text)) errors.push("Refusal answer does not use refusal-shaped language.");
    if (answer.sourceIds.length > 0 || answer.citationIds.length > 0) errors.push("Refusal answer should not cite client-file retrieval output.");
  } else if (answer.mode === "client-return") {
    if (cited.length === 0) errors.push("Client-return smoke answer should cite at least one retrieved source packet.");
  }

  if (answer.mode === "firm-portfolio" && /highest-priority files|high: miguel|generic urgency queue returned/i.test(text)) {
    errors.push("Portfolio failure mode fell back to the generic urgency queue.");
  }

  return { passed: errors.length === 0, errors, citedSourceIds: cited };
}

export function runTaxAgentSmokeLoop(
  question: string,
  options: {
    data?: DocketData;
    context?: Partial<RetrieverContext>;
    emitTrace?: TraceEmitter;
  } = {},
): TaxAgentSmokeResponse {
  const reasoningTrace: ReasoningTraceStep[] = [];
  const trace = (
    id: string,
    label: string,
    status: ReasoningTraceStep["status"],
    summary?: string,
  ) => recordTrace(reasoningTrace, options.emitTrace, id, label, status, summary);
  const context: RetrieverContext = {
    ...DEFAULT_CONTEXT,
    ...options.context,
    originalPrompt: question,
  };
  trace("compliance-check", "Reviewing compliance requirements", "in_progress");
  const preclassification = preclassifyTaxAgentSmoke(question);
  trace(
    "compliance-check",
    "Reviewing compliance requirements",
    "complete",
    preclassification.refusalRequired
      ? preclassification.reason ?? "Compliance preflight requires a refusal."
      : "No smoke preflight refusal trigger found.",
  );

  if (preclassification.refusalRequired) {
    trace("draft-refusal", "Drafting refusal with safe alternatives", "in_progress");
    const answer = synthesizeRefusal(preclassification);
    trace("draft-refusal", "Drafting refusal with safe alternatives", "complete", "Refusal rendered before any client-file retrieval.");
    return {
      answer,
      sourceIndex: {},
      contextLabel: preclassification.refusalType === "section_7216_use" ? null : "Miguel Sandoval",
      contextReturnId: preclassification.refusalType === "section_7216_use" ? null : MIGUEL_RETURN_ID,
      reasoningTrace,
      preclassification,
      retrieverResults: [],
      validation: validateTaxAgentSmokeOutput(answer, [], preclassification),
    };
  }

  if (isPortfolioQuestion(question)) {
    trace("check-portfolio-coverage", "Checking portfolio coverage", "in_progress");
    trace("check-portfolio-coverage", "Checking portfolio coverage", "skipped", "portfolio.retrieve is not wired into the smoke path yet.");
    trace("draft-response", "Drafting response with the retrieval gap", "in_progress");
    const answer = synthesizeUnsupportedPortfolioSmoke(question);
    trace("draft-response", "Drafting response with the retrieval gap", "complete", "Returned an honest no-result explanation instead of the legacy urgency queue.");
    return {
      answer,
      sourceIndex: {},
      contextLabel: null,
      contextReturnId: null,
      reasoningTrace,
      preclassification,
      retrieverResults: [],
      validation: validateTaxAgentSmokeOutput(answer, [], preclassification),
    };
  }

  trace("read-client-file", "Reading Miguel's client file", "in_progress");
  const result = retrieveClientFileSmoke(
    {
      context,
      clientId: context.loadedClientId ?? MIGUEL_CLIENT_ID,
      topic: question,
      taxYear: context.taxYear ?? 2024,
      scope: "full",
      evidenceTypes: ["tax_fact", "document", "issue"],
      includeHistorical: false,
    },
    options.data,
  );
  trace(
    "read-client-file",
    "Reading Miguel's client file",
    result.status === "hit" ? "complete" : "error",
    result.client && result.workflowState
      ? `${result.evidence.length} source-packet items; ${result.workflowState.blockersCount} blocker(s); readiness ${result.workflowState.readinessScore}%; extension risk ${result.workflowState.extensionRisk}%.`
      : result.metadata.errors[0]?.message ?? "Client file retrieval did not return usable evidence.",
  );
  const retrieverResults: TaxRetrieverResult[] = [result];
  trace("draft-response", "Drafting reviewer memo", "in_progress");
  const answer = synthesizeMiguelSmokeMemo(question, result);
  trace("draft-response", "Drafting reviewer memo", "complete", "Memo drafted from returned source-packet citations.");
  trace("validate-output", "Checking citations and refusal shape", "in_progress");
  const validation = validateTaxAgentSmokeOutput(answer, retrieverResults, preclassification);
  trace(
    "validate-output",
    "Checking citations and refusal shape",
    validation.passed ? "complete" : "error",
    validation.passed ? `${validation.citedSourceIds.length} cited source packet(s) validated.` : validation.errors.join(" "),
  );

  return {
    answer,
    sourceIndex: buildSourceIndex(retrieverResults),
    contextLabel: result.client?.displayName ?? "Miguel Sandoval",
    contextReturnId: MIGUEL_RETURN_ID,
    reasoningTrace,
    preclassification,
    retrieverResults,
    validation,
  };
}
