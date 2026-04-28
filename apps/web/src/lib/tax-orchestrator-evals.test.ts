import { beforeEach, describe, expect, it } from "vitest";

import { resetDocketData } from "@docket/domain";

import { runTaxProBenchOrchestrator } from "./tax-orchestrator-evals";

describe("TaxPro Bench orchestrator scoring", () => {
  beforeEach(() => {
    resetDocketData();
  });

  it("scores the EA orchestration pipeline for false clearance, blockers, citations, and questions", () => {
    const bench = runTaxProBenchOrchestrator();

    expect(bench.caseCount).toBeGreaterThanOrEqual(3);
    expect(bench.falseClearanceRate).toBe(0);
    expect(bench.missedBlockerCount).toBe(0);
    expect(bench.citationAccuracy).toBeGreaterThanOrEqual(0.65);
    expect(bench.sourceFreshness).toBeGreaterThanOrEqual(0.65);
    expect(bench.clientQuestionUsefulness).toBeGreaterThanOrEqual(0.65);
    expect(bench.unsupportedScopeEscalation).toBeGreaterThanOrEqual(0.8);
    expect(bench.caseResults.map((result) => result.clientName)).toEqual(
      expect.arrayContaining(["Miguel Sandoval", "Priya Narayan"]),
    );
  });

  it("flags every failed orchestrator case with actionable notes", () => {
    const bench = runTaxProBenchOrchestrator();

    for (const result of bench.caseResults.filter((caseResult) => !caseResult.passed)) {
      expect(result.notes.join(" ")).toMatch(/Citation|Missed|Unsupported|fallback|clearance/i);
      expect(result.traceStageCount).toBeGreaterThan(0);
    }
  });
});
