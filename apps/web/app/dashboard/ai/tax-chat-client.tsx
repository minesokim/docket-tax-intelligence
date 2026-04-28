"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "../../../src/components/docket-ui";
import { suggestedQuestions, type ChatAnswer, type ChatHistoryTurn, type SourceIndexEntry, type TaxChatResponse } from "../../../src/lib/tax-chat-shared";

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

        {answer.professionalAnalyses?.length ? (
          <div className="professional-analysis-list">
            <h3>EA-grade review frame</h3>
            {answer.professionalAnalyses.map((analysis) => (
              <article className="professional-analysis-card" key={analysis.issueId}>
                <div className="item-card-title">
                  <h4>{analysis.title}</h4>
                  <StatusBadge label="Reviewer controlled" tone="yellow" />
                </div>
                <small>{analysis.situationMode}</small>
                <p>{analysis.professionalJudgment}</p>
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
                <SourcePills ids={[...analysis.sourceIds, ...analysis.citationIds]} sourceIndex={sourceIndex} />
              </article>
            ))}
          </div>
        ) : null}

        <div className="chat-citations">
          <h3>Sources cited</h3>
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
    <div className="taxgpt-shell">
      <aside className="taxgpt-history">
        <div className="taxgpt-history-header">
          <strong>Docket AI</strong>
          <StatusBadge label="Research" tone="blue" />
        </div>
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
