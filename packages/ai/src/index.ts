import { execFileSync, spawnSync } from "node:child_process";

import {
  ChatArtifactEnvelopeSchema,
  ChatArtifactPatchSchema,
  contentHashForEnvelope,
  createMockAIReasoningRun,
  type AIReasoningRun,
  type AIWorkflowTask,
  type ChatArtifactEnvelope,
  type DocketData,
} from "@docket/domain";

export type ModelProviderName = "mock" | "openai" | "anthropic" | "claude_code_cli" | "codex_cli" | "other";

export type ModelRouterOptions = {
  provider?: ModelProviderName;
  externalCallsAllowed?: boolean;
  localCliAllowed?: boolean;
  claudeCliPath?: string;
  executeLocalCli?: boolean;
};

export type RoutedModelRun = {
  provider: ModelProviderName;
  task: AIWorkflowTask;
  externalCallMade: boolean;
  run: AIReasoningRun;
};

export type TaxChatSynthesisInput = {
  question: string;
  mode: "client-return" | "general-research";
  clientContextLabel: string | null;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  draftAnswer: {
    headline: string;
    answer: string[];
    reasoningSummary: string[];
    nextSteps: string[];
    suggestedFollowups: string[];
    limitation?: string;
  };
  sourcePacket: Array<{
    id: string;
    label: string;
    detail: string;
    url?: string;
    snippets?: string[];
  }>;
};

export type TaxChatSynthesisOutput = {
  provider: "claude_code_cli";
  model: "claude-code-cli";
  headline: string;
  answer: string[];
  reasoningSummary: string[];
  nextSteps: string[];
  suggestedFollowups: string[];
  limitation?: string;
};

export type TaxArtifactSynthesisInput = {
  question: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  deterministicEnvelope: ChatArtifactEnvelope;
};

export type TaxArtifactSynthesisOutput = {
  provider: "claude_code_cli";
  model: "claude-code-cli";
  envelope: ChatArtifactEnvelope;
};

export type ClaudeCodeCliStatus = {
  provider: "claude_code_cli";
  available: boolean;
  path: string;
  version: string | null;
  enabledByEnv: boolean;
  selectedByEnv: boolean;
  authCommand: string;
  notes: string[];
};

function envFlag(name: string): boolean {
  return process.env[name] === "true" || process.env[name] === "1";
}

function claudeCliPath(): string {
  return process.env.DOCKET_CLAUDE_CODE_CLI_PATH || "claude";
}

export function getClaudeCodeCliStatus(): ClaudeCodeCliStatus {
  const path = claudeCliPath();
  const versionCheck = spawnSync(path, ["--version"], { encoding: "utf8", timeout: 2_000 });
  const version = versionCheck.status === 0 ? `${versionCheck.stdout}${versionCheck.stderr}`.trim() : null;
  const enabledByEnv = envFlag("DOCKET_ENABLE_LOCAL_AI_CLI");
  const selectedByEnv = process.env.DOCKET_AI_PROVIDER === "claude_code_cli";

  return {
    provider: "claude_code_cli",
    available: versionCheck.status === 0,
    path,
    version,
    enabledByEnv,
    selectedByEnv,
    authCommand: "pnpm setup:claude",
    notes: [
      "Claude Code CLI uses the local user's Claude authentication, not a Docket-managed API key.",
      "The foundation keeps this provider local-only and disabled unless DOCKET_ENABLE_LOCAL_AI_CLI=true.",
      "Run pnpm setup:claude to open the Claude Code browser login flow.",
    ],
  };
}

function parseCliJson(raw: string): unknown {
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

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}

function asTaxChatSynthesisOutput(value: unknown, fallback: TaxChatSynthesisInput["draftAnswer"]): TaxChatSynthesisOutput | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TaxChatSynthesisOutput>;
  if (typeof candidate.headline !== "string") return null;
  const output: TaxChatSynthesisOutput = {
    provider: "claude_code_cli",
    model: "claude-code-cli",
    headline: candidate.headline,
    answer: stringArray(candidate.answer, fallback.answer),
    reasoningSummary: stringArray(candidate.reasoningSummary, fallback.reasoningSummary),
    nextSteps: stringArray(candidate.nextSteps, fallback.nextSteps),
    suggestedFollowups: stringArray(candidate.suggestedFollowups, fallback.suggestedFollowups),
  };
  const limitation = typeof candidate.limitation === "string" ? candidate.limitation : fallback.limitation;
  if (limitation) output.limitation = limitation;
  return output;
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asTaxArtifactSynthesisOutput(value: unknown, input: TaxArtifactSynthesisInput): TaxArtifactSynthesisOutput | null {
  const parsedValue = value && typeof value === "object" && "rawText" in value && typeof (value as { rawText?: unknown }).rawText === "string"
    ? extractJsonObject((value as { rawText: string }).rawText)
    : value;
  const patch = ChatArtifactPatchSchema.safeParse(parsedValue);
  if (!patch.success) return null;

  const deterministic = input.deterministicEnvelope;
  const envelopeWithoutHash = {
    ...deterministic,
    memo: patch.data.memo ?? deterministic.memo,
    issueAnalyses: patch.data.issueAnalyses ?? deterministic.issueAnalyses,
    citations: patch.data.citations ?? deterministic.citations,
    reconciliationTables: patch.data.reconciliationTables ?? deterministic.reconciliationTables,
    clientQuestions: patch.data.clientQuestions ?? deterministic.clientQuestions,
    preparerTasks: patch.data.preparerTasks ?? deterministic.preparerTasks,
    workpapers: patch.data.workpapers ?? deterministic.workpapers,
    confidence: patch.data.confidence ?? deterministic.confidence,
    trace: [
      ...deterministic.trace,
      {
        id: `trace-synthesis-claude-${Date.now()}`,
        stage: "synthesis" as const,
        summary: "Claude Code CLI synthesized validated artifact JSON from deterministic Docket source packets.",
        toolName: "claude_code_cli",
        query: input.question,
        sourcePacketIds: deterministic.sourcePacket.slice(0, 12).map((packet) => packet.id),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs: 0,
        cacheStatus: "MISS" as const,
      },
    ],
  };
  const envelope = ChatArtifactEnvelopeSchema.parse({
    ...envelopeWithoutHash,
    immutableContentHash: contentHashForEnvelope(envelopeWithoutHash),
  });
  return { provider: "claude_code_cli", model: "claude-code-cli", envelope };
}

function compactEnvelopeForModel(envelope: ChatArtifactEnvelope) {
  const referencedPacketIds = new Set<string>();
  for (const packet of envelope.sourcePacket) {
    if (packet.sourceType === "client" || packet.sourceType === "review_gate") referencedPacketIds.add(packet.id);
  }
  for (const issuePacket of envelope.issuePackets) {
    for (const id of issuePacket.evidencePacketIds) referencedPacketIds.add(id);
    for (const id of issuePacket.authoritySourcePacketIds) referencedPacketIds.add(id);
    for (const id of issuePacket.clientClaimPacketIds) referencedPacketIds.add(id);
    for (const id of issuePacket.conversationClaimPacketIds) referencedPacketIds.add(id);
    for (const id of issuePacket.documentEvidencePacketIds) referencedPacketIds.add(id);
    for (const id of issuePacket.priorYearPatternPacketIds) referencedPacketIds.add(id);
  }
  for (const citation of envelope.citations) referencedPacketIds.add(citation.sourcePacketId);

  return {
    id: envelope.id,
    intent: envelope.intent,
    clientId: envelope.clientId,
    taxReturnId: envelope.taxReturnId,
    sourcePacket: envelope.sourcePacket
      .filter((packet) => referencedPacketIds.has(packet.id))
      .map((packet) => ({
        id: packet.id,
        sourceType: packet.sourceType,
        label: packet.label,
        excerpt: packet.excerpt.length > 500 ? `${packet.excerpt.slice(0, 500)}...` : packet.excerpt,
        reliability: packet.reliability,
        authorityLevel: packet.authorityLevel,
        taxYear: packet.taxYear,
        jurisdiction: packet.jurisdiction,
        sourceDate: packet.sourceDate,
        retrievedAt: packet.retrievedAt,
      })),
    factGraph: envelope.factGraph.map((fact) => ({
      id: fact.id,
      factType: fact.factType,
      label: fact.label,
      value: fact.value,
      status: fact.status,
      materiality: fact.materiality,
      reviewerState: fact.reviewerState,
      sourcePacketIds: fact.sourcePacketIds,
    })),
    issuePackets: envelope.issuePackets.map((packet) => ({
      id: packet.id,
      issueId: packet.issueId,
      title: packet.title,
      situationClassification: packet.situationClassification,
      reconstructedFacts: packet.reconstructedFacts,
      verifiedFactNodeIds: packet.verifiedFactNodeIds,
      clientClaimPacketIds: packet.clientClaimPacketIds,
      conversationClaimPacketIds: packet.conversationClaimPacketIds,
      documentEvidencePacketIds: packet.documentEvidencePacketIds,
      authoritySourcePacketIds: packet.authoritySourcePacketIds,
      priorYearPatternPacketIds: packet.priorYearPatternPacketIds,
      missingFacts: packet.missingFacts,
      smellTests: packet.smellTests,
      reviewGateImpact: packet.reviewGateImpact,
      recommendedClientQuestions: packet.recommendedClientQuestions,
      preparerTasks: packet.preparerTasks,
      clearanceStandard: packet.clearanceStandard,
      assumptionsToAvoid: packet.assumptionsToAvoid,
    })),
    memo: envelope.memo ? {
      id: envelope.memo.id,
      headline: envelope.memo.headline,
      paragraphs: envelope.memo.paragraphs,
      verdict: envelope.memo.verdict,
      issueAnalysisIds: envelope.memo.issueAnalysisIds,
      citationIds: envelope.memo.citationIds,
      confidence: envelope.memo.confidence,
    } : null,
    issueAnalyses: envelope.issueAnalyses.map((analysis) => ({
      id: analysis.id,
      issueId: analysis.issueId,
      title: analysis.title,
      riskLevel: analysis.riskLevel,
      blocker: analysis.blocker,
      reviewerState: analysis.reviewerState,
      situationMode: analysis.situationMode,
      factPatternSummary: analysis.factPatternSummary,
      verifiedFactNodeIds: analysis.verifiedFactNodeIds,
      claimSourcePacketIds: analysis.claimSourcePacketIds,
      missingFacts: analysis.missingFacts,
      authoritySourcePacketIds: analysis.authoritySourcePacketIds,
      smellTests: analysis.smellTests,
      riskRationale: analysis.riskRationale,
      clientQuestionIds: analysis.clientQuestionIds,
      preparerTaskIds: analysis.preparerTaskIds,
      workpaperIds: analysis.workpaperIds,
      citationIds: analysis.citationIds,
      confidence: analysis.confidence,
    })),
    citations: envelope.citations,
    confidence: envelope.confidence,
  };
}

function runClaudeCodeCli(task: AIWorkflowTask, outputSchema: unknown, cliPath: string): unknown {
  const prompt = [
    "You are running as Docket's local Claude Code CLI provider.",
    "Return concise JSON only. Do not provide final tax advice. Do not approve filing readiness.",
    `Task: ${task}`,
    "Expected output schema/example:",
    JSON.stringify(outputSchema, null, 2),
  ].join("\n\n");

  const raw = execFileSync(
    cliPath,
    ["-p", prompt, "--output-format", "json", "--max-turns", "1", "--permission-mode", "acceptEdits"],
    {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );

  return parseCliJson(raw);
}

export class ModelRouter {
  private readonly provider: ModelProviderName;
  private readonly externalCallsAllowed: boolean;
  private readonly localCliAllowed: boolean;
  private readonly executeLocalCli: boolean;
  private readonly claudeCliPath: string;

  constructor(options: ModelRouterOptions = {}) {
    this.provider = options.provider ?? (process.env.DOCKET_AI_PROVIDER as ModelProviderName | undefined) ?? "mock";
    this.externalCallsAllowed = options.externalCallsAllowed ?? false;
    this.localCliAllowed = options.localCliAllowed ?? envFlag("DOCKET_ENABLE_LOCAL_AI_CLI");
    this.executeLocalCli = options.executeLocalCli ?? false;
    this.claudeCliPath = options.claudeCliPath ?? claudeCliPath();
  }

  run(data: DocketData, returnId: string, task: AIWorkflowTask, inputSourceIds: string[], output: unknown): RoutedModelRun {
    if (this.provider === "claude_code_cli" && !this.localCliAllowed) {
      throw new Error("Local AI CLI providers are disabled. Set DOCKET_ENABLE_LOCAL_AI_CLI=true before using Claude Code CLI.");
    }

    if (this.provider !== "mock" && this.provider !== "claude_code_cli" && !this.externalCallsAllowed) {
      throw new Error("External AI calls are disabled by default. Set an explicit integration flag before using a real provider.");
    }

    const providerOutput = this.provider === "claude_code_cli" && this.executeLocalCli ? runClaudeCodeCli(task, output, this.claudeCliPath) : output;
    const run = createMockAIReasoningRun(data, returnId, task, inputSourceIds, providerOutput);
    run.provider = this.provider;
    run.model = this.provider === "claude_code_cli" ? "claude-code-cli" : run.model;

    return {
      provider: this.provider,
      task,
      externalCallMade: this.provider !== "mock",
      run,
    };
  }
}

export const defaultModelRouter = new ModelRouter({ provider: "mock", externalCallsAllowed: false });

export function synthesizeTaxChatWithClaude(input: TaxChatSynthesisInput): TaxChatSynthesisOutput | null {
  if (process.env.DOCKET_AI_PROVIDER !== "claude_code_cli" || !envFlag("DOCKET_ENABLE_LOCAL_AI_CLI")) {
    return null;
  }

  const prompt = [
    "You are Docket AI, an enrolled-agent-grade tax research and return-intelligence assistant for professional preparers.",
    "Write a natural, memo-grade answer using only the provided Docket evidence packet and official-source snippets.",
    "Your style should feel like a very strong tax professional: precise, practical, source-aware, and willing to say what facts are missing.",
    "Follow this professional protocol internally before writing: classify the taxpayer/context, separate facts from assumptions, rank authority, apply authority to the facts supplied, identify substantiation gaps, assess preparer risk, and give reviewer-safe next actions.",
    "Do not expose hidden chain-of-thought. Provide a concise reasoning summary with the visible professional rationale: facts used, sources checked, authority ranking, uncertainty, and next reviewer-safe actions.",
    "Do not provide final client-facing tax advice, do not mark filing readiness approved, and do not invent sources or facts.",
    "If sources are insufficient, say exactly what is missing.",
    "For general research, answer the user's question directly first, then add caveats, missing facts, and practitioner workflow.",
    "For client-return questions, tie every material point to client file evidence or the retrieved authority packet.",
    "Use conversationHistory to preserve the active chat context, but never treat prior assistant wording as a source.",
    "Return JSON only with this shape:",
    JSON.stringify(
      {
        headline: "string",
        answer: ["paragraph string"],
        reasoningSummary: ["reviewer-facing rationale string"],
        nextSteps: ["action string"],
        suggestedFollowups: ["short question string"],
        limitation: "optional string",
      },
      null,
      2,
    ),
    "Input:",
    JSON.stringify(input, null, 2),
  ].join("\n\n");

  try {
    const raw = execFileSync(claudeCliPath(), ["-p", prompt, "--output-format", "json", "--max-turns", "1"], {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return asTaxChatSynthesisOutput(parseCliJson(raw), input.draftAnswer);
  } catch {
    return null;
  }
}

export function synthesizeTaxArtifactsWithClaude(input: TaxArtifactSynthesisInput): TaxArtifactSynthesisOutput | null {
  if (process.env.DOCKET_AI_PROVIDER !== "claude_code_cli" || !envFlag("DOCKET_ENABLE_LOCAL_AI_CLI")) {
    return null;
  }

  const prompt = [
    "You are Docket AI, an enrolled-agent-grade tax intelligence synthesizer for professional preparers.",
    "You receive deterministic source packets, fact graph nodes, review gates, and draft artifacts from Docket tools.",
    "The deterministicEnvelope.issuePackets array is the authoritative EA reasoning packet. Synthesize from it first: classify situation, facts, claims, evidence, authority, missing facts, smell tests, review gate impact, client questions, preparer tasks, and clearance standard.",
    "You may improve the memo prose, issue analyses, client questions, preparer tasks, and workpapers, but you must not invent facts, citations, source IDs, approvals, or filing clearance.",
    "Use only IDs already present in the deterministicEnvelope. If authority is weak or missing, say what authority is missing instead of filling from memory.",
    "Do not expose hidden chain-of-thought. Use concise reviewer-facing rationale, issue-specific smell tests, and source-backed next actions.",
    "Return JSON only. Prefer returning only { memo, issueAnalyses, confidence }. Include other keys only if truly needed.",
    "Every returned object must keep the same schema and IDs as the deterministic artifact it replaces. Do not include sourcePacket, factGraph, trace, immutableContentHash, clientId, or taxReturnId.",
    "Input:",
    JSON.stringify(
      {
        question: input.question,
        conversationHistory: input.conversationHistory?.slice(-8) ?? [],
        deterministicEnvelope: compactEnvelopeForModel(input.deterministicEnvelope),
      },
      null,
      2,
    ),
  ].join("\n\n");

  try {
    const raw = execFileSync(claudeCliPath(), ["-p", prompt, "--output-format", "json", "--max-turns", "1"], {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 3 * 1024 * 1024,
    });
    return asTaxArtifactSynthesisOutput(parseCliJson(raw), input);
  } catch {
    return null;
  }
}

export const AI_PROVIDER_RULES = {
  defaultProvider: "mock",
  localCliProvider: "claude_code_cli",
  noExternalCallsByDefault: true,
  localCliRequiresExplicitEnvFlag: true,
  validateOutputsWithSchemas: true,
  separateExtractionFromReasoning: true,
  neverUseModelMemoryAsTaxAuthority: true,
} as const;
