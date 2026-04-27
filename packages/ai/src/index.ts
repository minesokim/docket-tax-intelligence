import { execFileSync, spawnSync } from "node:child_process";

import { createMockAIReasoningRun, type AIReasoningRun, type AIWorkflowTask, type DocketData } from "@docket/domain";

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
    "You are Docket AI, a tax intelligence chat for professional preparers.",
    "Write a natural, Claude-like answer using only the provided Docket evidence packet and official-source snippets.",
    "Do not expose hidden chain-of-thought. Provide a concise reasoning summary: facts used, source checks, uncertainty, and next reviewer-safe actions.",
    "Do not provide final client-facing tax advice, do not mark filing readiness approved, and do not invent sources or facts.",
    "If sources are insufficient, say exactly what is missing.",
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

export const AI_PROVIDER_RULES = {
  defaultProvider: "mock",
  localCliProvider: "claude_code_cli",
  noExternalCallsByDefault: true,
  localCliRequiresExplicitEnvFlag: true,
  validateOutputsWithSchemas: true,
  separateExtractionFromReasoning: true,
  neverUseModelMemoryAsTaxAuthority: true,
} as const;
