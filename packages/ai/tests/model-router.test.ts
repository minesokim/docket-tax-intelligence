import { describe, expect, it } from "vitest";

import { IDS, cloneDocketData } from "@docket/domain";

import { ModelRouter, getClaudeCodeCliStatus } from "../src/index";

const reasoningOutput = {
  establishedFacts: [],
  issueSummaries: [],
  clientQuestions: [],
  reviewerNotes: [],
  workpaperRefs: [],
  authorityContext: {
    knowledgeSnapshotId: "ks-fed-2024-2026-04-26",
    rulePackageId: "rules-1040-2024-v1",
    citations: [],
    caveat: "No tax conclusion without current Docket authority.",
  },
  nextAction: "Route through reviewer approval.",
};

describe("model router local CLI providers", () => {
  it("keeps mock as the default provider", () => {
    const router = new ModelRouter({ provider: "mock" });
    const result = router.run(cloneDocketData(), IDS.taxReturn, "summary_generation", [], reasoningOutput);

    expect(result.provider).toBe("mock");
    expect(result.externalCallMade).toBe(false);
    expect(result.run.provider).toBe("mock");
  });

  it("requires an explicit local CLI flag for Claude Code CLI", () => {
    const router = new ModelRouter({ provider: "claude_code_cli", localCliAllowed: false });

    expect(() => router.run(cloneDocketData(), IDS.taxReturn, "summary_generation", [], reasoningOutput)).toThrow(
      "Local AI CLI providers are disabled",
    );
  });

  it("can record Claude Code CLI metadata without executing the CLI in tests", () => {
    const router = new ModelRouter({ provider: "claude_code_cli", localCliAllowed: true, executeLocalCli: false });
    const result = router.run(cloneDocketData(), IDS.taxReturn, "summary_generation", [], reasoningOutput);

    expect(result.provider).toBe("claude_code_cli");
    expect(result.externalCallMade).toBe(true);
    expect(result.run.provider).toBe("claude_code_cli");
    expect(result.run.model).toBe("claude-code-cli");
  });

  it("reports local Claude Code CLI setup status", () => {
    const status = getClaudeCodeCliStatus();

    expect(status.provider).toBe("claude_code_cli");
    expect(status.authCommand).toBe("pnpm setup:claude");
    expect(status.notes.length).toBeGreaterThan(0);
  });
});
