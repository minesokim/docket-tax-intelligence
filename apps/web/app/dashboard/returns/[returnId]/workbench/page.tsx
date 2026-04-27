import { notFound } from "next/navigation";
import Link from "next/link";

import { getReturnWorkbench } from "@docket/domain";

import {
  AuditTrail,
  AuthorityBadge,
  ClientQuestionCard,
  ExportPacketPanel,
  IssueCard,
  Meter,
  OpportunityCard,
  PageHeader,
  ReviewGatePanel,
  Section,
  SourceDocumentCard,
  StatusBadge,
  TaxFactRow,
  WorkpaperPanel,
} from "../../../../../src/components/docket-ui";
import { WorkbenchActions } from "./workbench-actions";

export const dynamic = "force-dynamic";

const tabs = [
  "Overview",
  "Context",
  "Documents",
  "Tax Facts",
  "Issues & Flags",
  "Opportunities",
  "Client Questions",
  "Workpapers",
  "Review",
  "Export",
  "Audit Trail",
];

type ReasoningOutputView = {
  establishedFacts: { label: string; sourceIds: string[]; confidence: number }[];
  issueSummaries: {
    issueId: string;
    title: string;
    riskLevel: "GREEN" | "YELLOW" | "RED";
    blocker: boolean;
    sourceIds: string[];
    citationIds: string[];
    missingFacts: string[];
    recommendedAction: string;
  }[];
  clientQuestions: { relatedIssueId: string | null; question: string; reason: string; sourceIds: string[]; citationIds: string[] }[];
  reviewerNotes: { title: string; note: string; sourceIds: string[]; citationIds: string[] }[];
  authorityContext: {
    knowledgeSnapshotId: string;
    rulePackageId: string;
    citations: { citationId: string; label: string; authorityLevel: string; sourceId: string }[];
    caveat: string;
  };
  nextAction: string;
};

function asReasoningOutputView(output: unknown): ReasoningOutputView | null {
  if (!output || typeof output !== "object") return null;
  const candidate = output as {
    establishedFacts?: unknown;
    issueSummaries?: unknown;
    clientQuestions?: unknown;
    reviewerNotes?: unknown;
    authorityContext?: unknown;
    nextAction?: unknown;
  };
  if (
    !Array.isArray(candidate.establishedFacts) ||
    !Array.isArray(candidate.issueSummaries) ||
    !Array.isArray(candidate.clientQuestions) ||
    !Array.isArray(candidate.reviewerNotes) ||
    !candidate.authorityContext ||
    typeof candidate.authorityContext !== "object" ||
    typeof candidate.nextAction !== "string"
  ) {
    return null;
  }
  const authorityContext = candidate.authorityContext as ReasoningOutputView["authorityContext"];
  const reviewerNotes = candidate.reviewerNotes.filter(
    (note): note is { title: string; note: string; sourceIds: string[]; citationIds: string[] } =>
      Boolean(note) &&
      typeof note === "object" &&
      typeof (note as { title?: unknown }).title === "string" &&
      typeof (note as { note?: unknown }).note === "string" &&
      Array.isArray((note as { sourceIds?: unknown }).sourceIds) &&
      Array.isArray((note as { citationIds?: unknown }).citationIds),
  );
  return {
    establishedFacts: candidate.establishedFacts as ReasoningOutputView["establishedFacts"],
    issueSummaries: candidate.issueSummaries as ReasoningOutputView["issueSummaries"],
    clientQuestions: candidate.clientQuestions as ReasoningOutputView["clientQuestions"],
    reviewerNotes,
    authorityContext,
    nextAction: candidate.nextAction,
  };
}

function SourcePills({
  ids,
  sourceIndex,
}: {
  ids: string[];
  sourceIndex: Record<string, { type: string; label: string; detail: string }>;
}) {
  return (
    <div className="pill-row">
      {ids.length > 0 ? (
        ids.slice(0, 5).map((id) => {
          const source = sourceIndex[id];
          return (
            <span className="mini-pill" key={id} title={source?.detail ?? id}>
              {source ? `${source.type}: ${source.label}` : id}
            </span>
          );
        })
      ) : (
        <span className="mini-pill">No linked source</span>
      )}
    </div>
  );
}

export default async function ReturnWorkbenchPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const workbench = getReturnWorkbench(returnId);
  if (!workbench) notFound();
  const latestReasoningOutput = asReasoningOutputView(workbench.latestAIReasoningRun?.output);

  return (
    <>
      <PageHeader
        eyebrow="Return Workbench"
        title={`${workbench.client?.displayName} · ${workbench.taxReturn.taxYear} ${workbench.taxReturn.returnType}`}
        description="The main review surface for documents, claims, source-backed facts, issues, workpapers, review gates, and export readiness."
        actions={<StatusBadge label={workbench.taxReturn.status.replaceAll("_", " ")} tone="yellow" />}
      />

      <div className="grid-3">
        <Meter label="Readiness" value={workbench.readiness.readinessScore} tone="blue" />
        <Meter label="Extension risk" value={workbench.extension.extensionRiskScore} tone="red" />
        <div className="item-card">
          <div className="item-card-title">
            <h3>Assignments</h3>
            <StatusBadge label={workbench.taxReturn.riskLevel} tone="red" />
          </div>
          <p>Preparer {workbench.preparer?.name} · Reviewer {workbench.reviewer?.name}</p>
          <p>Rule package {workbench.rulePackage?.version}</p>
        </div>
      </div>

      <WorkbenchActions returnId={workbench.taxReturn.id} />

      {workbench.latestAIReasoningRun ? (
        <Section
          title="Tax Intelligence"
          description={`${workbench.latestAIReasoningRun.provider.replaceAll("_", " ")} · ${workbench.latestAIReasoningRun.model} · ${workbench.latestAIReasoningRun.task.replaceAll("_", " ")}`}
          action={<Link className="button-link" href={`/dashboard/ai?returnId=${workbench.taxReturn.id}`}>Open AI page</Link>}
        >
          <div className="grid-3">
            <div className="item-card">
              <div className="item-card-title">
                <h3>Run status</h3>
                <StatusBadge label={workbench.latestAIReasoningRun.reviewStatus.replaceAll("_", " ")} tone="blue" />
              </div>
              <p>Prompt {workbench.latestAIReasoningRun.promptVersion} · Schema {workbench.latestAIReasoningRun.outputSchema}</p>
              <small>{workbench.aiPrepRuns.length} prep run(s) · {workbench.aiRuns.length} reasoning run(s)</small>
            </div>
            {latestReasoningOutput ? (
              <>
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>Authority context</h3>
                    <StatusBadge label="Citation backed" tone="green" />
                  </div>
                  <p>{latestReasoningOutput.authorityContext.caveat}</p>
                  <SourcePills
                    ids={[
                      latestReasoningOutput.authorityContext.knowledgeSnapshotId,
                      latestReasoningOutput.authorityContext.rulePackageId,
                      ...latestReasoningOutput.authorityContext.citations.map((citation) => citation.citationId),
                    ]}
                    sourceIndex={workbench.reasoningSourceIndex}
                  />
                </div>
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>Reviewer notes</h3>
                    <StatusBadge label={`${latestReasoningOutput.reviewerNotes.length}`} tone="yellow" />
                  </div>
                  {latestReasoningOutput.reviewerNotes.slice(0, 3).map((note) => (
                    <div key={note.title}>
                      <p>
                        <strong>{note.title}</strong>: {note.note}
                      </p>
                      <SourcePills ids={[...note.sourceIds, ...note.citationIds]} sourceIndex={workbench.reasoningSourceIndex} />
                    </div>
                  ))}
                </div>
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>Next action</h3>
                    <StatusBadge label="AI prepared" tone="yellow" />
                  </div>
                  <p>{latestReasoningOutput.nextAction}</p>
                </div>
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>Established facts</h3>
                    <StatusBadge label={`${latestReasoningOutput.establishedFacts.length}`} tone="green" />
                  </div>
                  {latestReasoningOutput.establishedFacts.slice(0, 4).map((fact) => (
                    <div key={fact.label}>
                      <p>
                        <strong>{fact.label}</strong> · {Math.round(fact.confidence * 100)}%
                      </p>
                      <SourcePills ids={fact.sourceIds} sourceIndex={workbench.reasoningSourceIndex} />
                    </div>
                  ))}
                </div>
                {latestReasoningOutput.issueSummaries.map((issue) => (
                  <div className="item-card" key={issue.issueId}>
                    <div className="item-card-title">
                      <h3>{issue.title}</h3>
                      <StatusBadge label={issue.blocker ? "Blocker" : issue.riskLevel} tone={issue.riskLevel === "RED" ? "red" : "yellow"} />
                    </div>
                    <p>{issue.recommendedAction}</p>
                    {issue.missingFacts.length > 0 ? <small>Missing: {issue.missingFacts.join(" · ")}</small> : null}
                    <SourcePills ids={[...issue.sourceIds, ...issue.citationIds]} sourceIndex={workbench.reasoningSourceIndex} />
                  </div>
                ))}
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>Client question rationale</h3>
                    <StatusBadge label={`${latestReasoningOutput.clientQuestions.length}`} tone="blue" />
                  </div>
                  {latestReasoningOutput.clientQuestions.slice(0, 4).map((question) => (
                    <div key={question.question}>
                      <p>
                        <strong>{question.question}</strong>
                      </p>
                      <small>{question.reason}</small>
                      <SourcePills ids={[...question.sourceIds, ...question.citationIds]} sourceIndex={workbench.reasoningSourceIndex} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="item-card">
                <div className="item-card-title">
                  <h3>Output</h3>
                  <StatusBadge label="Raw" tone="yellow" />
                </div>
                <pre>{JSON.stringify(workbench.latestAIReasoningRun.output, null, 2)}</pre>
              </div>
            )}
          </div>
        </Section>
      ) : null}

      <nav className="tabs" aria-label="Workbench sections">
        {tabs.map((tab) => (
          <a href={`#${tab.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`} key={tab}>
            {tab}
          </a>
        ))}
      </nav>

      <div className="workbench-grid">
        <div>
          <Section title="Overview" description={workbench.recommendedNextAction}>
            <div className="grid-2">
              {workbench.flags.map((flag) => (
                <div className="item-card" key={flag.id}>
                  <div className="item-card-title">
                    <h3>{flag.label}</h3>
                    <StatusBadge label={flag.riskLevel} tone={flag.riskLevel === "RED" ? "red" : "yellow"} />
                  </div>
                  <p>{flag.reason}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Documents">
            <div className="grid-2">
              {workbench.documents.map((document) => (
                <SourceDocumentCard document={document} key={document.id} />
              ))}
            </div>
          </Section>

          <Section title="Tax Facts" description="Material facts carry source evidence and review state. Client statements remain claims until reconciled.">
            <div className="grid-2">
              {workbench.taxFacts.map((fact) => (
                <TaxFactRow fact={fact} key={fact.id} />
              ))}
            </div>
          </Section>

          <Section title="Issues & Flags">
            <div className="grid-2">
              {workbench.issues.map((issue) => (
                <IssueCard issue={issue} key={issue.id} />
              ))}
            </div>
          </Section>

          <Section title="Opportunities">
            <div className="grid-2">
              {workbench.opportunities.map((opportunity) => (
                <OpportunityCard opportunity={opportunity} key={opportunity.id} />
              ))}
            </div>
          </Section>

          <Section title="Client Questions">
            <div className="grid-2">
              {workbench.questions.map((question) => (
                <ClientQuestionCard question={question} key={question.id} />
              ))}
            </div>
          </Section>

          <Section title="Workpapers">
            <div className="grid-2">
              {workbench.workpapers.map((workpaper) => (
                <WorkpaperPanel workpaper={workpaper} key={workpaper.id} />
              ))}
            </div>
          </Section>
        </div>

        <aside>
          <Section title="Knowledge snapshot">
            {workbench.knowledgeSnapshot ? (
              <AuthorityBadge
                label={workbench.knowledgeSnapshot.label}
                level={workbench.knowledgeSnapshot.lastSyncStatus}
                current={workbench.knowledgeSnapshot.lastSyncStatus === "CURRENT"}
              />
            ) : null}
          </Section>

          {workbench.trustChecklist ? (
            <Section title="Trust checklist" description={`${workbench.trustChecklist.blockers.length} blockers · ${workbench.trustChecklist.warnings.length} warnings`}>
              <div className="grid-2">
                <Meter label="Trust score" value={workbench.trustChecklist.score} tone={workbench.trustChecklist.score >= 80 ? "green" : "yellow"} />
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>Audit coverage</h3>
                    <StatusBadge label={`${workbench.trustChecklist.auditSummary.totalEvents} events`} tone="blue" />
                  </div>
                  <p>
                    {workbench.trustChecklist.auditSummary.aiEventCount} AI · {workbench.trustChecklist.auditSummary.clientEventCount} client ·{" "}
                    {workbench.trustChecklist.auditSummary.firmUserEventCount} firm user
                  </p>
                  <small>{workbench.trustChecklist.auditSummary.blockedWorkflowCount} blocked workflow event(s)</small>
                </div>
                {workbench.trustChecklist.items.map((item) => (
                  <div className="item-card" key={item.id}>
                    <div className="item-card-title">
                      <h3>{item.label}</h3>
                      <StatusBadge label={item.status} tone={item.tone} />
                    </div>
                    <p>{item.detail}</p>
                    {item.sourceIds.length > 0 ? <small>Sources {item.sourceIds.slice(0, 3).join(", ")}</small> : null}
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Readiness breakdown">
            <div className="grid-2">
              <Meter label="Documents" value={workbench.readiness.documentCompleteness} />
              <Meter label="Client answers" value={workbench.readiness.clientAnswerCompleteness} />
              <Meter label="Fact confidence" value={workbench.readiness.factConfidence} />
              <Meter label="Review" value={workbench.readiness.reviewProgress} />
              <Meter label="Signature" value={workbench.readiness.signatureReadiness} />
              <Meter label="Knowledge" value={workbench.readiness.knowledgeFreshness} />
            </div>
          </Section>

          <Section title="Extension recommendation">
            <div className="item-card">
              <div className="item-card-title">
                <h3>{workbench.extension.recommendation}</h3>
                <StatusBadge label={`${workbench.extension.extensionRiskScore}%`} tone="red" />
              </div>
              <div className="split-list">
                <div>
                  {workbench.extension.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Review gates">
            <div className="grid-2">
              <ReviewGatePanel title="Ready for review" pass={workbench.readyForReviewGate.pass} blockers={workbench.readyForReviewGate.blockers} />
              <ReviewGatePanel title="Ready for signature" pass={workbench.readyForSignatureGate.pass} blockers={workbench.readyForSignatureGate.blockers} />
              <ReviewGatePanel title="Ready to file" pass={workbench.readyToFileGate.pass} blockers={workbench.readyToFileGate.blockers} />
            </div>
          </Section>

          <Section title="Firm policy checks">
            <div className="grid-2">
              {workbench.firmPolicyEvaluations.length > 0 ? (
                workbench.firmPolicyEvaluations.map((evaluation) => (
                  <div className="item-card" key={`${evaluation.policyId}-${evaluation.sourceIds.join("-")}`}>
                    <div className="item-card-title">
                      <h3>{evaluation.policyName}</h3>
                      <StatusBadge label={evaluation.blocking ? "Blocker" : evaluation.action} tone={evaluation.blocking ? "red" : "yellow"} />
                    </div>
                    <p>{evaluation.message}</p>
                    <small>Required role {evaluation.requiredRole}</small>
                  </div>
                ))
              ) : (
                <div className="item-card">
                  <div className="item-card-title">
                    <h3>No active policy exceptions</h3>
                    <StatusBadge label="Clear" tone="green" />
                  </div>
                  <p>Enabled firm policies do not currently block this return.</p>
                </div>
              )}
            </div>
          </Section>

          <Section title="Export">
            {workbench.exportPackage ? (
              <ExportPacketPanel
                state={workbench.exportPackage.state}
                notice={workbench.exportPackage.efileDisabledNotice}
                packetJson={workbench.exportPackage.packetJson}
              />
            ) : null}
          </Section>

          <Section title="Audit Trail">
            <AuditTrail events={workbench.auditEvents} />
          </Section>
        </aside>
      </div>
    </>
  );
}
