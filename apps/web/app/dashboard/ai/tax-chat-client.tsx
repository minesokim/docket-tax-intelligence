"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "../../../src/components/docket-ui";
import { suggestedQuestions, type ChatAnswer, type ChatHistoryTurn, type SourceIndexEntry, type TaxChatResponse } from "../../../src/lib/tax-chat-shared";
import type { IssueAnalysisArtifact, IssueReasoningPacket, ReconciliationTableArtifact, SourcePacketItem } from "@docket/domain";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: TaxChatResponse;
};

function sourceLabel(id: string, sourceIndex: Record<string, SourceIndexEntry>) {
  const source = sourceIndex[id];
  return source ? `${source.type}: ${source.label}` : id;
}

type MemoIssue = {
  issueId: string;
  title: string;
  statusLabel: string;
  factPatternSummary: string;
  ruleSpace: string[];
  smellTests: string[];
  dollarExposure: string;
  professionalJudgment: string;
  riskRationale: string;
  clearanceStandard: string;
  clientQuestionStrategy: string;
  clientCommunicationDraft: string;
  preparerWorkPlan: string[];
  sourceIds: string[];
  citationIds: string[];
  situationMode: string;
  verifiedFactCount: number;
  claimCount: number;
  authorityCount: number;
  assumptionsToAvoid: string[];
};

function packetLabel(packetById: Map<string, SourcePacketItem>, id: string): string {
  return packetById.get(id)?.label ?? id;
}

function artifactIssueToMemoIssue(issue: IssueAnalysisArtifact, packetById: Map<string, SourcePacketItem>, issuePacket?: IssueReasoningPacket): MemoIssue {
  const authorityLabels = issue.authoritySourcePacketIds.map((id) => packetLabel(packetById, id));
  const sourceLabels = [...issue.claimSourcePacketIds, ...issue.authoritySourcePacketIds].map((id) => packetLabel(packetById, id));
  return {
    issueId: issue.issueId,
    title: issue.title,
    statusLabel: issue.blocker ? "Blocks filing until reviewed" : issue.reviewerState === "REVIEWER_APPROVED" ? "Resolved in current state" : "Needs reviewer attention",
    factPatternSummary: issue.factPatternSummary,
    ruleSpace: authorityLabels.length ? authorityLabels : ["Evidence requirements", "Firm review policy"],
    smellTests: issue.smellTests,
    dollarExposure: issuePacket?.reviewGateImpact.falseClearanceRisk ?? "Not estimated yet.",
    professionalJudgment: issue.blocker ? "Treat this as blocking until the missing evidence and reviewer state are cleared." : "Treat this as review-needed before accepting the related position.",
    riskRationale: issue.riskRationale,
    clearanceStandard: issuePacket?.clearanceStandard ?? (issue.reviewerState === "REVIEWER_APPROVED" ? "Retain evidence and approval in the file." : "Clear only when source evidence, authority, and reviewer approval support the position."),
    clientQuestionStrategy: issuePacket?.recommendedClientQuestions[0]?.question ?? issue.missingFacts[0] ?? "Ask the client for the missing fact needed to clear this issue.",
    clientCommunicationDraft: issuePacket?.recommendedClientQuestions[0]?.question ?? issue.missingFacts[0] ?? "Please send the missing support so we can finish review.",
    preparerWorkPlan: issuePacket?.preparerTasks.map((task) => task.task) ?? (issue.preparerTaskIds.length ? issue.preparerTaskIds.map((id) => `Complete ${id.replace(/^task-/, "").replaceAll("-", " ")}.`) : ["Gather source support.", "Document conclusion.", "Route to reviewer."]),
    sourceIds: sourceLabels,
    citationIds: authorityLabels,
    situationMode: issue.situationMode,
    verifiedFactCount: issuePacket?.reconstructedFacts.length ?? issue.verifiedFactNodeIds.length,
    claimCount: issuePacket ? issuePacket.clientClaimPacketIds.length + issuePacket.conversationClaimPacketIds.length : issue.claimSourcePacketIds.length,
    authorityCount: issuePacket?.authoritySourcePacketIds.length ?? issue.authoritySourcePacketIds.length,
    assumptionsToAvoid: issuePacket?.assumptionsToAvoid ?? ["Do not treat unsupported claims as verified facts.", "Do not clear from model wording alone."],
  };
}

function legacyAnalysisToMemoIssue(analysis: NonNullable<ChatAnswer["professionalAnalyses"]>[number]): MemoIssue {
  return {
    issueId: analysis.issueId,
    title: analysis.title,
    statusLabel: analysis.statusLabel,
    factPatternSummary: analysis.factPatternSummary,
    ruleSpace: analysis.ruleSpace,
    smellTests: analysis.smellTests,
    dollarExposure: analysis.dollarExposure,
    professionalJudgment: analysis.professionalJudgment,
    riskRationale: analysis.riskRationale,
    clearanceStandard: analysis.clearanceStandard,
    clientQuestionStrategy: analysis.clientQuestionStrategy,
    clientCommunicationDraft: analysis.clientCommunicationDraft,
    preparerWorkPlan: analysis.preparerWorkPlan,
    sourceIds: analysis.sourceIds,
    citationIds: analysis.citationIds,
    situationMode: analysis.situationMode,
    verifiedFactCount: analysis.establishedFacts.length,
    claimCount: analysis.clientClaims.length,
    authorityCount: analysis.citationIds.length,
    assumptionsToAvoid: analysis.assumptionsToAvoid,
  };
}

function SourcePills({ ids, sourceIndex }: { ids: string[]; sourceIndex: Record<string, SourceIndexEntry> }) {
  return (
    <div className="pill-row">
      {Array.from(new Set(ids)).map((id) => (
        <span className="mini-pill" key={id} title={sourceIndex[id]?.detail ?? id}>
          {sourceLabel(id, sourceIndex)}
        </span>
      ))}
    </div>
  );
}

function CitationChip({ id, sourceIndex }: { id: string; sourceIndex: Record<string, SourceIndexEntry> }) {
  const source = sourceIndex[id];
  return (
    <a className="inline-citation" href={`#source-${id}`} title={source?.detail ?? id}>
      {source?.label ?? id}
    </a>
  );
}

function sourceBuckets(response: TaxChatResponse) {
  const { answer, sourceIndex } = response;
  if (answer.artifacts?.sourcePacket.length) {
    const bucketed = {
      authority: [] as string[],
      clientFile: [] as string[],
      conversation: [] as string[],
      knowledgeGraph: [] as string[],
    };
    for (const packet of answer.artifacts.sourcePacket) {
      if (packet.sourceType === "tax_authority" || packet.sourceType === "tax_citation") bucketed.authority.push(packet.id);
      else if (packet.sourceType === "conversation" || packet.sourceType === "client_claim") bucketed.conversation.push(packet.id);
      else if (["document", "tax_fact", "client_question", "workpaper", "missing_document", "issue"].includes(packet.sourceType)) bucketed.clientFile.push(packet.id);
      else bucketed.knowledgeGraph.push(packet.id);
    }
    return bucketed;
  }
  const ids = Array.from(
    new Set([
      ...answer.sourceIds,
      ...answer.citationIds,
      ...(answer.retrievedAuthority?.sources.map((source) => source.id) ?? []),
      ...(answer.professionalAnalyses?.flatMap((analysis) => [...analysis.sourceIds, ...analysis.citationIds]) ?? []),
    ]),
  );
  const bucketed = {
    authority: [] as string[],
    clientFile: [] as string[],
    conversation: [] as string[],
    knowledgeGraph: [] as string[],
  };

  for (const id of ids) {
    const type = sourceIndex[id]?.type.toLowerCase() ?? "";
    if (type.includes("authority") || type.includes("irs") || type.includes("congress") || type.includes("govinfo") || type.includes("federal") || type.includes("ecfr") || id.startsWith("cite-")) bucketed.authority.push(id);
    else if (type.includes("conversation") || type.includes("client claim")) bucketed.conversation.push(id);
    else if (type.includes("document") || type.includes("tax fact") || type.includes("client question") || type.includes("workpaper")) bucketed.clientFile.push(id);
    else bucketed.knowledgeGraph.push(id);
  }

  return bucketed;
}

function SourceRail({ response }: { response: TaxChatResponse }) {
  const buckets = sourceBuckets(response);
  const { sourceIndex } = response;
  const packetById = new Map((response.answer.artifacts?.sourcePacket ?? []).map((packet) => [packet.id, packet]));
  const retrievedAuthorityById = new Map((response.answer.retrievedAuthority?.sources ?? []).map((source) => [source.id, source]));
  const renderBucket = (title: string, ids: string[]) => (
    <div className="memo-source-bucket" key={title}>
      <div>{title}</div>
      {ids.length > 0 ? (
        ids.slice(0, 12).map((id) => {
          const source = sourceIndex[id];
          const packet = packetById.get(id);
          const retrievedAuthority = retrievedAuthorityById.get(id);
          return (
            <a href={retrievedAuthority?.sourceUrl ?? `#source-${id}`} id={`source-${id}`} key={`${title}-${id}`} title={source?.detail ?? packet?.excerpt ?? retrievedAuthority?.snippets[0] ?? id}>
              {source?.label ?? packet?.label ?? retrievedAuthority?.title ?? id}
            </a>
          );
        })
      ) : (
        <span>No source used</span>
      )}
    </div>
  );

  return (
    <aside className="memo-sources-rail">
      <strong>Sources consulted</strong>
      {renderBucket("Authority", buckets.authority)}
      {renderBucket("Client file", buckets.clientFile)}
      {renderBucket("Conversation", buckets.conversation)}
      {renderBucket("Knowledge graph", buckets.knowledgeGraph)}
    </aside>
  );
}

function ReconciliationTable({ table }: { table: ReconciliationTableArtifact }) {
  return (
    <div className="memo-review-table">
      <div className="memo-table-title">{table.title}</div>
      <table>
        <thead>
          <tr>
            {table.columns.map((column) => <th key={column}>{column}</th>)}
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => (
                <td key={`${row.id}-${table.columns[index] ?? index}`}>{cell}</td>
              ))}
              <td>
                {row.status.replaceAll("_", " ").toLowerCase()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReasoningTrace({ analysis }: { analysis: MemoIssue }) {
  const steps = [
    ["Classify", analysis.situationMode],
    ["Reconstruct facts", `${analysis.factPatternSummary} Verified facts: ${analysis.verifiedFactCount}; claim packets: ${analysis.claimCount}; authority sources: ${analysis.authorityCount}.`],
    ["Identify rules", analysis.ruleSpace.join("; ")],
    ["Stress test", analysis.smellTests.join("; ")],
    ["Avoid assumptions", analysis.assumptionsToAvoid.join("; ")],
    ["Defensive check", analysis.clearanceStandard],
    ["Communicate", analysis.clientQuestionStrategy],
  ];

  return (
    <details className="reasoning-trace">
      <summary>Show reasoning trace</summary>
      <ol>
        {steps.map(([label, body]) => (
          <li key={label}>
            <strong>{label}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function MemoAnswer({ response, animate }: { response: TaxChatResponse; animate: boolean }) {
  const { answer, sourceIndex } = response;
  const isResearch = answer.mode === "general-research";
  const artifactMemo = answer.artifacts?.memo;
  const packetById = new Map((answer.artifacts?.sourcePacket ?? []).map((packet) => [packet.id, packet]));
  const issuePacketByIssueId = new Map((answer.artifacts?.issuePackets ?? []).map((packet) => [packet.issueId, packet]));
  const artifactAnalyses = (answer.artifacts?.issueAnalyses ?? []).map((analysis) => artifactIssueToMemoIssue(analysis, packetById, issuePacketByIssueId.get(analysis.issueId)));
  const legacyAnalyses = (answer.professionalAnalyses ?? []).map(legacyAnalysisToMemoIssue);
  const analyses: MemoIssue[] = artifactAnalyses.length ? artifactAnalyses : legacyAnalyses;
  const reconciliationByIssue = new Map(
    (answer.artifacts?.reconciliationTables ?? []).map((table) => [table.relatedIssueId ?? "return", table]),
  );
  const animatedLead = useTypewriter((artifactMemo?.paragraphs ?? answer.answer).join("\n\n"), animate);
  const leadParagraphs = animatedLead.split("\n\n").filter(Boolean);
  const issueCount = analyses.length;
  const clientQueue = answer.actionQueues?.clientFacing ?? analyses.map((analysis) => analysis.clientCommunicationDraft);
  const preparerQueue = answer.actionQueues?.preparerFacing ?? analyses.flatMap((analysis) => analysis.preparerWorkPlan);
  const verdict = artifactMemo?.verdict ?? answer.verdict;
  const title = artifactMemo?.headline ?? answer.headline;
  const documentKind = isResearch ? "Research memo" : "Client memo";
  const metadataLine = issueCount > 0
    ? `${documentKind} · Generated just now · Reasoning: ${issueCount} issue${issueCount === 1 ? "" : "s"} analyzed · Sources linked inline`
    : `${documentKind} · Generated just now · Authority packet: ${answer.retrievedAuthority?.sources.length ?? 0} source${(answer.retrievedAuthority?.sources.length ?? 0) === 1 ? "" : "s"} · Sources linked inline`;

  return (
    <article className="chat-message assistant-message memo-message">
      <div className="chat-avatar">AI</div>
      <div className="memo-workspace">
        <div className="memo-document">
          <div className="memo-breadcrumb">{isResearch ? "Research / General tax authority" : `Clients / ${response.contextLabel ?? "Selected return"}`}</div>
          <header className="memo-header">
            <h2>{title}</h2>
            <p>{metadataLine}</p>
          </header>

          {verdict ? (
            <div className="memo-badges">
              <span className={verdict.filingStatus.includes("Not") ? "danger" : "success"}>{verdict.filingStatus}</span>
              <span>{verdict.blockerCount} ready-to-file blocker(s)</span>
              <span>Readiness: {verdict.readinessScore}%</span>
              <span>Extension risk: {verdict.extensionRiskScore}%</span>
            </div>
          ) : (
            <div className="memo-badges">
              <span className={isResearch ? "warning" : "success"}>{isResearch ? "Research mode" : "Client-file mode"}</span>
              <span>{answer.synthesizedBy ?? "deterministic retrieval"}</span>
              {answer.retrievedAuthority ? <span>{answer.retrievedAuthority.sources.filter((source) => source.fetchStatus === "LIVE").length} live source(s)</span> : null}
            </div>
          )}

          <section className="memo-lede">
            {leadParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>

          {analyses.length > 0 ? (
            <>
              <h3 className="memo-section-label">Issues, ranked by filing impact</h3>
              {analyses.map((analysis, index) => (
                <section className="memo-issue" key={analysis.issueId}>
              <div className="memo-issue-header">
                <div>
                  <h4>{index + 1}. {analysis.title}</h4>
                  <p>{analysis.statusLabel} · Dollar impact: {analysis.dollarExposure}</p>
                </div>
                <span className={analysis.statusLabel.startsWith("Blocks") ? "danger" : analysis.statusLabel.startsWith("Resolved") ? "success" : "warning"}>
                  {analysis.statusLabel.startsWith("Resolved") ? "Resolved" : analysis.statusLabel.startsWith("Blocks") ? "Blocker" : "Review needed"}
                </span>
              </div>

              <p className="memo-prose">
                {analysis.professionalJudgment} {analysis.riskRationale} {analysis.ruleSpace.slice(0, 2).map((rule) => (
                  <span key={rule}> <span className="inline-citation">{rule}</span></span>
                ))}
              </p>

              {reconciliationByIssue.get(analysis.issueId) ? <ReconciliationTable table={reconciliationByIssue.get(analysis.issueId)!} /> : null}

              <div className="memo-smell-tests">
                <strong>EA smell tests</strong>
                <ul>{analysis.smellTests.map((test) => <li key={test}>{test}</li>)}</ul>
              </div>

              <div className="memo-source-chips">
                {[...analysis.citationIds, ...analysis.sourceIds].slice(0, 8).map((id) => (
                  sourceIndex[id] ? <CitationChip id={id} sourceIndex={sourceIndex} key={id} /> : <span className="inline-citation" key={id}>{id}</span>
                ))}
              </div>

              <div className="memo-actions">
                <button type="button">Draft client request</button>
                <button type="button">{analysis.issueId.includes("income") || analysis.issueId.includes("1099k") ? "Open reconciliation table" : "Open source packet"}</button>
              </div>
              <ReasoningTrace analysis={analysis} />
                </section>
              ))}
            </>
          ) : (
            <section className="memo-research-grid">
              {answer.retrievedAuthority ? (
                <div className="memo-retrieval-trace">
                  <h3>Retrieval trace</h3>
                  <p><strong>Query fired:</strong> {answer.retrievedAuthority.query}</p>
                  <p><strong>Retrieved:</strong> {answer.retrievedAuthority.sources.length} official-source candidate(s), ranked by topic match and authority level.</p>
                </div>
              ) : null}
              <div>
                <h3>Reasoning summary</h3>
                <ul>{answer.reasoningSummary.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div>
                <h3>Next steps</h3>
                <ul>{answer.nextSteps.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              {answer.retrievedAuthority ? (
                <div className="memo-authority-list">
                  <h3>Retrieved authority</h3>
                  {answer.retrievedAuthority.sources.map((source) => (
                    <article className="memo-authority-card" key={source.id}>
                      <div className="memo-issue-header">
                        <div>
                          <h4><a href={source.sourceUrl}>{source.title}</a></h4>
                          <p>{source.publisher} · {source.authorityLevel.replaceAll("_", " ")} · retrieved {source.retrievedAt.slice(0, 10)}</p>
                        </div>
                        <span className={source.fetchStatus === "LIVE" ? "success" : "danger"}>{source.fetchStatus.toLowerCase()}</span>
                      </div>
                      {source.error ? <p className="answer-warning">{source.error}</p> : null}
                      {source.snippets.slice(0, 2).map((snippet) => <blockquote key={snippet}>{snippet}</blockquote>)}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          )}

          {analyses.length > 0 ? (
            <section className="memo-action-queues">
              <div>
                <h3>Send to client</h3>
                <ol>{clientQueue.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ol>
              </div>
              <div>
                <h3>Preparer queue</h3>
                <ol>{Array.from(new Set(preparerQueue)).slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ol>
              </div>
            </section>
          ) : null}

          <footer className="memo-footer-actions">
            <button type="button">Export memo PDF</button>
            <button type="button">Send all client requests</button>
            <button type="button">Open review table</button>
          </footer>
        </div>
        <SourceRail response={response} />
      </div>
    </article>
  );
}

function ThinkingBubble() {
  return (
    <article className="chat-message assistant-message">
      <div className="chat-avatar">AI</div>
      <div className="chat-bubble thinking-bubble">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function useTypewriter(text: string, active: boolean) {
  const [visible, setVisible] = useState(active ? "" : text);

  useEffect(() => {
    if (!active) {
      setVisible(text);
      return;
    }
    setVisible("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += Math.max(2, Math.ceil(text.length / 160));
      setVisible(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 16);
    return () => window.clearInterval(timer);
  }, [active, text]);

  return visible;
}

function AssistantAnswer({ response, animate }: { response: TaxChatResponse; animate: boolean }) {
  const { answer, sourceIndex } = response;
  const sourceIds = Array.from(new Set([...answer.sourceIds, ...answer.citationIds]));
  const animatedBody = useTypewriter(answer.answer.join("\n\n"), animate);
  const bodyParagraphs = animatedBody.split("\n\n").filter(Boolean);

  if (answer.mode === "client-return" || answer.mode === "general-research") {
    return <MemoAnswer response={response} animate={animate} />;
  }

  return (
    <article className="chat-message assistant-message">
      <div className="chat-avatar">AI</div>
      <div className="chat-bubble">
        <div className="item-card-title">
          <h2>{answer.headline}</h2>
          <StatusBadge label={answer.mode === "client-return" ? "Client-file mode" : "Research mode"} tone={answer.mode === "client-return" ? "green" : "yellow"} />
        </div>
        {bodyParagraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {answer.limitation ? <p className="answer-warning">{answer.limitation}</p> : null}

        {answer.verdict ? (
          <div className="verdict-strip">
            <div>
              <strong>{answer.verdict.filingStatus}</strong>
              <span>{answer.verdict.readinessMeaning}</span>
            </div>
            <div>
              <strong>{answer.verdict.blockerCount}</strong>
              <span>active blocker(s)</span>
            </div>
            <div>
              <strong>{answer.verdict.readinessScore}%</strong>
              <span>workflow readiness</span>
            </div>
            <div>
              <strong>{answer.verdict.extensionRiskScore}%</strong>
              <span>extension risk</span>
            </div>
          </div>
        ) : null}

        <div className="chat-answer-grid">
          <div>
            <h3>Reasoning summary</h3>
            <ul>{answer.reasoningSummary.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>Next steps</h3>
            <ul>{answer.nextSteps.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>

        {answer.actionQueues ? (
          <div className="chat-answer-grid">
            <div>
              <h3>Client-facing queue</h3>
              <ul>{answer.actionQueues.clientFacing.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h3>Preparer-facing queue</h3>
              <ul>{answer.actionQueues.preparerFacing.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        ) : null}

        {answer.professionalAnalyses?.length ? (
          <div className="professional-analysis-list">
            <h3>EA-grade review frame</h3>
            {answer.professionalAnalyses.map((analysis) => (
              <article className="professional-analysis-card" key={analysis.issueId}>
                <div className="item-card-title">
                  <h4>{analysis.title}</h4>
                  <StatusBadge label={analysis.statusLabel} tone={analysis.statusLabel.startsWith("Resolved") ? "green" : analysis.statusLabel.startsWith("Blocks") ? "red" : "yellow"} />
                </div>
                <small>{analysis.situationMode}</small>
                <p>{analysis.professionalJudgment}</p>
                <p><strong>Dollar exposure:</strong> {analysis.dollarExposure}</p>
                <div className="chat-answer-grid">
                  <div>
                    <strong>Rule space</strong>
                    <ul>{analysis.ruleSpace.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div>
                    <strong>Smell tests</strong>
                    <ul>{analysis.smellTests.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
                <div>
                  <strong>Assumptions to avoid</strong>
                  <ul>{analysis.assumptionsToAvoid.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <strong>Clearance standard</strong>
                  <p>{analysis.clearanceStandard}</p>
                </div>
                <div>
                  <strong>Reviewer checklist</strong>
                  <ul>{analysis.reviewerChecklist.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <strong>Client draft</strong>
                  <p>{analysis.clientCommunicationDraft}</p>
                </div>
                <div>
                  <strong>Preparer work plan</strong>
                  <ul>{analysis.preparerWorkPlan.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <SourcePills ids={[...analysis.sourceIds, ...analysis.citationIds]} sourceIndex={sourceIndex} />
              </article>
            ))}
          </div>
        ) : null}

        <div className="chat-citations">
          <h3>{answer.professionalAnalyses?.length ? "Conversation-level sources" : "Sources cited"}</h3>
          {answer.professionalAnalyses?.length ? <p>Issue-specific sources are attached inside each EA review card above.</p> : null}
          {sourceIds.length > 0 ? <SourcePills ids={sourceIds} sourceIndex={sourceIndex} /> : <p>No source citation needed for this message.</p>}
        </div>

        {answer.retrievedAuthority ? (
          <div className="chat-citations">
            <h3>Retrieved authority</h3>
            <div className="authority-source-list">
              {answer.retrievedAuthority.sources.map((source) => (
                <article className="authority-source-card" key={source.id}>
                  <div className="item-card-title">
                    <h4><a href={source.sourceUrl}>{source.title}</a></h4>
                    <StatusBadge label={source.fetchStatus} tone={source.fetchStatus === "LIVE" ? "green" : "red"} />
                  </div>
                  <p>
                    {source.publisher} · {source.authorityLevel.replaceAll("_", " ")} · retrieved {source.retrievedAt.slice(0, 10)}
                    {source.pageLastUpdated ? ` · page updated ${source.pageLastUpdated}` : ""}
                  </p>
                  {source.error ? <p className="answer-warning">{source.error}</p> : null}
                  {source.snippets.map((snippet) => <blockquote key={snippet}>{snippet}</blockquote>)}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function TaxChatClient({ initialQuestion, initialReturnId }: { initialQuestion: string; initialReturnId?: string | undefined }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQuestion);
  const [returnId, setReturnId] = useState(initialReturnId);
  const [pending, setPending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastAssistantId, setLastAssistantId] = useState<string | null>(null);
  const sentInitial = useRef(false);

  const latestAnswer = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.response?.answer as ChatAnswer | undefined,
    [messages],
  );

  function buildHistorySnapshot(currentMessages: Message[]): ChatHistoryTurn[] {
    return currentMessages
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.role === "assistant" ? message.response?.answer.answer.join("\n\n") ?? message.content : message.content,
      }))
      .filter((turn) => turn.content.trim().length > 0);
  }

  async function sendQuestion(question: string, attachedReturnId = returnId) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    const history = buildHistorySnapshot(messages);
    setInput("");
    setPending(true);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: trimmed }]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, returnId: attachedReturnId, history }),
      });
      const response = (await res.json()) as TaxChatResponse;
      const assistantId = `assistant-${Date.now()}`;
      setLastAssistantId(assistantId);
      setReturnId(response.contextReturnId ?? attachedReturnId);
      setMessages((current) => [...current, { id: assistantId, role: "assistant", content: response.answer.headline, response }]);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (sentInitial.current || !initialQuestion.trim()) return;
    sentInitial.current = true;
    void sendQuestion(initialQuestion, initialReturnId);
  }, [initialQuestion, initialReturnId]);

  return (
    <div className={`taxgpt-shell ${sidebarOpen ? "" : "taxgpt-shell-collapsed"}`}>
      <aside className="taxgpt-history">
        <div className="taxgpt-history-header">
          <strong>{sidebarOpen ? "Docket AI" : "D"}</strong>
          {sidebarOpen ? <StatusBadge label="Research" tone="blue" /> : null}
          <button
            aria-label={sidebarOpen ? "Collapse conversation rail" : "Expand conversation rail"}
            className="taxgpt-rail-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            type="button"
          >
            {sidebarOpen ? "<" : ">"}
          </button>
        </div>
        {sidebarOpen ? (
          <>
            <div className="taxgpt-search">
              <input placeholder="Search this thread..." />
            </div>
            <div className="taxgpt-history-list">
              {messages.filter((message) => message.role === "user").length === 0 ? (
                <div className="empty-history">
                  <strong>No chat history yet</strong>
                  <span>Start a new research thread or attach a client return.</span>
                </div>
              ) : (
                <div className="thread-history">
                  <strong>Current thread</strong>
                  {messages
                    .filter((message) => message.role === "user")
                    .slice(-8)
                    .map((message) => (
                      <button key={message.id} type="button" title={message.content}>
                        {message.content}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="taxgpt-rail-icons" aria-label="Collapsed conversation shortcuts">
            <button type="button" title="Current thread">Q</button>
            <button type="button" title="Client return context">C</button>
            <button type="button" title="Sources">S</button>
          </div>
        )}
      </aside>

      <section className="taxgpt-chat">
        <div className="taxgpt-topbar">
          <div>
            <p className="eyebrow">AI Tax Intelligence</p>
            <h1>Ask Docket</h1>
          </div>
          <div className="pill-row">
            <StatusBadge label={latestAnswer?.synthesizedBy ?? "ready"} tone={latestAnswer?.synthesizedBy ? "green" : "blue"} />
            <StatusBadge label={returnId ? "Client context on" : "No client selected"} tone={returnId ? "green" : "neutral"} />
          </div>
        </div>

        <div className="chat-thread">
          {messages.length === 0 ? (
            <article className="chat-message assistant-message">
              <div className="chat-avatar">AI</div>
              <div className="chat-bubble">
                <div className="item-card-title">
                  <h2>Ask a tax question or attach a client return context.</h2>
                  <StatusBadge label="Ready" tone="blue" />
                </div>
                <p>I can research tax authority, answer from a client file, or help review risks and missing facts. Casual messages do not need citations; tax conclusions do.</p>
              </div>
            </article>
          ) : null}
          {messages.map((message) =>
            message.role === "user" ? (
              <article className="chat-message user-message" key={message.id}>
                <div className="chat-avatar">You</div>
                <div className="chat-bubble"><p>{message.content}</p></div>
              </article>
            ) : message.response ? (
              <AssistantAnswer animate={message.id === lastAssistantId} response={message.response} key={message.id} />
            ) : null,
          )}
          {pending ? <ThinkingBubble /> : null}
        </div>

        <div className="suggestion-panel">
          <strong>Suggested questions</strong>
          <div className="suggestion-row">
            {(latestAnswer?.suggestedFollowups ?? suggestedQuestions).concat(suggestedQuestions).slice(0, 8).map((question) => (
              <button className="suggestion-chip" disabled={pending} key={question} onClick={() => void sendQuestion(question)} type="button">
                {question}
              </button>
            ))}
          </div>
        </div>

        <form className="taxgpt-composer" onSubmit={(event) => { event.preventDefault(); void sendQuestion(input); }}>
          <textarea
            name="q"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendQuestion(input);
              }
            }}
            placeholder="Ask a tax research question, or mention a client/return to use file context..."
            rows={2}
            value={input}
          />
          <button disabled={pending || !input.trim()} type="submit">{pending ? "Thinking" : "Ask"}</button>
        </form>
        <p className="taxgpt-disclaimer">
          Docket answers are AI-prepared research and workflow support. Client-facing advice and filing readiness still require firm review.
        </p>
      </section>
    </div>
  );
}
