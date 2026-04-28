import { getEvalsDashboard } from "@docket/domain";

import { MetricCard, PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";
import { runTaxProBenchOrchestrator } from "../../../src/lib/tax-orchestrator-evals";

export default function EvalsPage() {
  const evals = getEvalsDashboard();
  const orchestratorBench = runTaxProBenchOrchestrator();
  return (
    <>
      <PageHeader eyebrow="TaxPro Bench" title="Evaluation harness for AI tax-professional behavior" description="Primary metric: false-clearance rate." />
      <Section title="Orchestrator bench">
        <div className="metric-grid">
          <MetricCard label="Orchestrated cases" value={orchestratorBench.caseCount} tone="blue" />
          <MetricCard label="False-clearance rate" value={`${orchestratorBench.falseClearanceRate}%`} tone={orchestratorBench.falseClearanceRate === 0 ? "green" : "red"} />
          <MetricCard label="Missed blockers" value={orchestratorBench.missedBlockerCount} tone={orchestratorBench.missedBlockerCount === 0 ? "green" : "red"} />
          <MetricCard label="Citation accuracy" value={`${Math.round(orchestratorBench.citationAccuracy * 100)}%`} tone="green" />
          <MetricCard label="Source freshness" value={`${Math.round(orchestratorBench.sourceFreshness * 100)}%`} tone={orchestratorBench.sourceFreshness >= 0.75 ? "green" : "yellow"} />
          <MetricCard label="Question usefulness" value={`${Math.round(orchestratorBench.clientQuestionUsefulness * 100)}%`} tone="green" />
          <MetricCard label="Unsupported escalation" value={`${Math.round(orchestratorBench.unsupportedScopeEscalation * 100)}%`} tone={orchestratorBench.unsupportedScopeEscalation >= 0.8 ? "green" : "yellow"} />
          <MetricCard label="Fallback-free runs" value={`${Math.round(orchestratorBench.fallbackFreeRate * 100)}%`} tone={orchestratorBench.fallbackFreeRate === 1 ? "green" : "yellow"} />
        </div>
        <div className="grid-3">
          {orchestratorBench.caseResults.map((result) => (
            <div className="item-card" key={result.id}>
              <div className="item-card-title">
                <h3>{result.clientName}</h3>
                <StatusBadge label={result.passed ? "Pass" : "Needs review"} tone={result.passed ? "green" : "yellow"} />
              </div>
              <p>{result.title}</p>
              <small>
                Citation {Math.round(result.citationAccuracy * 100)}% · Freshness {Math.round(result.sourceFreshness * 100)}% · Questions{" "}
                {Math.round(result.clientQuestionUsefulness * 100)}%
              </small>
              <p>{result.notes[0]}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Latest metrics">
        <div className="metric-grid">
          <MetricCard label="Cases" value={evals.metrics.caseCount} tone="blue" />
          <MetricCard label="Passed cases" value={evals.metrics.passedCaseCount} tone="green" />
          <MetricCard label="False-clearance rate" value={`${evals.metrics.falseClearanceRate}%`} tone="green" />
          <MetricCard label="Blocking cases" value={evals.metrics.blockingCaseCount} tone="red" />
          <MetricCard label="Issue spotting recall" value={`${Math.round(evals.metrics.issueSpottingRecall * 100)}%`} tone="green" />
          <MetricCard label="Citation correctness" value={`${Math.round(evals.metrics.citationCorrectness * 100)}%`} tone="green" />
        </div>
      </Section>
      <Section title="Case results">
        <div className="grid-3">
          {evals.metrics.caseResults.map((result) => (
            <div className="item-card" key={result.caseId}>
              <div className="item-card-title">
                <h3>{result.title}</h3>
                <StatusBadge label={result.passed ? "Pass" : "Needs review"} tone={result.passed ? "green" : "red"} />
              </div>
              <p>{result.notes}</p>
              <small>
                Recall {Math.round(result.findingRecall * 100)}% · {result.blockedWhenRequired ? "Required blocks enforced" : "Block missing"}
              </small>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Model risk">
        <div className="metric-grid">
          <MetricCard label="AI runs" value={evals.modelRisk.aiRunCount} tone="blue" />
          <MetricCard label="Cost per seed file" value={`$${evals.modelRisk.totalCostUsd.toFixed(4)}`} tone="green" />
          <MetricCard label="Average latency" value={`${evals.modelRisk.averageLatencyMs}ms`} tone="blue" />
          <MetricCard label="Reviewer override rate" value={`${Math.round(evals.modelRisk.reviewerOverrideRate * 100)}%`} tone="yellow" />
        </div>
        <div className="grid-3">
          {evals.modelRisk.providers.map((provider) => (
            <div className="item-card" key={provider.id}>
              <div className="item-card-title">
                <h3>{provider.name}</h3>
                <StatusBadge label={provider.externalCallsAllowed ? "External enabled" : "Mock/local only"} tone={provider.externalCallsAllowed ? "red" : "green"} />
              </div>
              <p>{provider.enabled ? "Enabled" : "Disabled"}</p>
            </div>
          ))}
          {evals.modelRisk.promptVersions.map((prompt) => (
            <div className="item-card" key={prompt.id}>
              <div className="item-card-title">
                <h3>{prompt.task.replaceAll("_", " ")}</h3>
                <StatusBadge label={prompt.status} tone={prompt.status === "ACTIVE" ? "green" : "yellow"} />
              </div>
              <p>{prompt.version}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Benchmark cases">
        <div className="grid-3">
          {evals.cases.map((benchmarkCase) => (
            <div className="item-card" key={benchmarkCase.id}>
              <div className="item-card-title">
                <h3>{benchmarkCase.title}</h3>
                <StatusBadge label={benchmarkCase.mustBlockFiling ? "Blocks filing" : "Review"} tone={benchmarkCase.mustBlockFiling ? "red" : "yellow"} />
              </div>
              <p>{benchmarkCase.fixtureSummary}</p>
              <p>{benchmarkCase.expectedFindings.join(" · ")}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
