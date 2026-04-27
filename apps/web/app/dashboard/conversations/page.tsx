import { getDocketSnapshot } from "@docket/domain";

import { PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";

export default function ConversationsPage() {
  const data = getDocketSnapshot();
  return (
    <>
      <PageHeader eyebrow="Conversation Intelligence" title="Claims, commitments, missing-doc signals, and contradictions from messages and transcripts" />
      <Section title="Insights">
        <div className="grid-3">
          {data.conversationInsights.map((insight) => (
            <div className="item-card" key={insight.id}>
              <div className="item-card-title">
                <h3>{insight.insightType.replaceAll("_", " ")}</h3>
                <StatusBadge label={insight.riskLevel} tone={insight.riskLevel === "RED" ? "red" : "yellow"} />
              </div>
              <p>{insight.summary}</p>
              <p>{insight.sourceQuote}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Messages and transcripts">
        <div className="grid-3">
          {data.conversationMessages.map((message) => (
            <div className="item-card" key={message.id}>
              <StatusBadge label={message.authorType} tone="blue" />
              <p>{message.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
