import Link from "next/link";
import { notFound } from "next/navigation";

import { getClient360 } from "@docket/domain";

import {
  AuditTrail,
  IssueCard,
  Meter,
  OpportunityCard,
  PageHeader,
  Section,
  SourceDocumentCard,
  StatusBadge,
} from "../../../../src/components/docket-ui";

export const dynamic = "force-dynamic";

export default async function Client360Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client360 = getClient360(clientId);
  if (!client360) notFound();
  const currentReturn = client360.returns[0];
  const currentScore = client360.scores[0];

  return (
    <>
      <PageHeader
        eyebrow="Client 360"
        title={client360.client.displayName}
        description="What we know, how we know it, what changed, what is missing, and what should be asked next."
        actions={currentReturn ? <Link className="status-badge tone-blue" href={`/dashboard/returns/${currentReturn.id}/workbench`}>Open workbench</Link> : null}
      />

      <div className="grid-3">
        <Section title="Readiness">{currentScore ? <Meter label="Return readiness" value={currentScore.readiness.readinessScore} tone="blue" /> : null}</Section>
        <Section title="Extension risk">{currentScore ? <Meter label="Extension risk" value={currentScore.extension.extensionRiskScore} tone="red" /> : null}</Section>
        <Section title="Client responsiveness">
          <div className="item-card">
            <h3>{client360.client.averageResponseDays} days average response</h3>
            <p>{client360.client.tags.join(" · ")}</p>
          </div>
        </Section>
      </div>

      <div className="workbench-grid">
        <div>
          <Section title="Current returns">
            <div className="grid-2">
              {client360.returns.map((taxReturn) => (
                <Link className="item-card" href={`/dashboard/returns/${taxReturn.id}/workbench`} key={taxReturn.id}>
                  <div className="item-card-title">
                    <h3>{taxReturn.taxYear} {taxReturn.returnType}</h3>
                    <StatusBadge label={taxReturn.status.replaceAll("_", " ")} tone="yellow" />
                  </div>
                  <p>Readiness {taxReturn.readinessScore}% · Extension risk {taxReturn.extensionRiskScore}%</p>
                </Link>
              ))}
            </div>
          </Section>

          <Section title="Documents">
            <div className="grid-2">
              {client360.documents.map((document) => (
                <SourceDocumentCard document={document} key={document.id} />
              ))}
            </div>
          </Section>

          <Section title="Deduction opportunities">
            <div className="grid-2">
              {client360.deductionOpportunities.map((opportunity) => (
                <OpportunityCard opportunity={opportunity} key={opportunity.id} />
              ))}
            </div>
          </Section>
        </div>

        <div>
          <Section title="Missing and risky">
            <div className="grid-2">
              {client360.missingDocuments.map((document) => (
                <div className="item-card" key={document.id}>
                  <div className="item-card-title">
                    <h3>{document.expectedDocumentClass.replaceAll("_", " ")}</h3>
                    <StatusBadge label={document.severity} tone="red" />
                  </div>
                  <p>{document.reason}</p>
                </div>
              ))}
              {client360.conversationInsights.map((insight) => (
                <div className="item-card" key={insight.id}>
                  <div className="item-card-title">
                    <h3>{insight.insightType.replaceAll("_", " ")}</h3>
                    <StatusBadge label={insight.riskLevel} tone={insight.riskLevel === "RED" ? "red" : "yellow"} />
                  </div>
                  <p>{insight.summary}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Open risk flags">
            <div className="grid-2">
              {client360.riskFlags.map((flag) => (
                <IssueCard
                  key={flag.id}
                  issue={{
                    id: flag.id,
                    firmId: "",
                    clientId: client360.client.id,
                    taxReturnId: flag.taxReturnId,
                    issueType: flag.label,
                    title: flag.label,
                    description: flag.reason,
                    riskLevel: flag.riskLevel,
                    status: "OPEN",
                    blocker: flag.riskLevel === "RED",
                    sourceIds: flag.sourceIds,
                    recommendedAction: "Review source evidence and resolve before filing.",
                    assignedToRole: "MANAGER_REVIEWER",
                    createdAt: new Date().toISOString(),
                    resolvedAt: null,
                  }}
                />
              ))}
            </div>
          </Section>

          <Section title="Audit timeline">
            <AuditTrail events={client360.auditTimeline} />
          </Section>
        </div>
      </div>
    </>
  );
}
