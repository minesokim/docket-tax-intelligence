import { notFound } from "next/navigation";

import { getClient360 } from "@docket/domain";

import { Meter, PageHeader, Section, StatusBadge } from "../../../../src/components/docket-ui";

export default async function PortalClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client360 = getClient360(clientId);
  if (!client360) notFound();
  const score = client360.scores[0];

  return (
    <>
      <PageHeader eyebrow="Client Portal" title={client360.client.displayName} description="Your current document requests, questions, consent, and progress." />
      <div className="grid-2">
        {score ? <Meter label="Return progress" value={score.readiness.readinessScore} /> : null}
        <div className="portal-panel">
          <h3>Firm needs</h3>
          <p>{client360.missingDocuments.length} missing document request · {client360.conversationInsights.length} tax context items</p>
          <StatusBadge label="Firm review in progress" tone="yellow" />
        </div>
      </div>
    </>
  );
}
