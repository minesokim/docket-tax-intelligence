import Link from "next/link";
import { notFound } from "next/navigation";

import { getPortalReturn } from "@docket/domain";

import { ClientQuestionCard, Meter, PageHeader, Section, SourceDocumentCard, StatusBadge } from "../../../../src/components/docket-ui";

export const dynamic = "force-dynamic";

export default async function PortalReturnPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const portal = getPortalReturn(returnId);
  if (!portal) notFound();

  return (
    <>
      <div className="portal-header">
        <PageHeader eyebrow="Client Portal" title={`${portal.client?.displayName} · ${portal.taxReturn.taxYear} return`} description="Current firm requests and return progress." />
        <div className="header-actions">
          <Link className="status-badge tone-blue" href={`/portal/returns/${portal.taxReturn.id}/checklist`}>Checklist</Link>
          <Link className="status-badge tone-blue" href={`/portal/returns/${portal.taxReturn.id}/clarifications`}>Questions</Link>
          <Link className="status-badge tone-blue" href={`/portal/returns/${portal.taxReturn.id}/documents`}>Documents</Link>
          <Link className="status-badge tone-blue" href={`/portal/returns/${portal.taxReturn.id}/signature`}>Signature</Link>
        </div>
      </div>

      <div className="portal-layout">
        <div>
          <Section title="Checklist">
            <div className="grid-2">
              {portal.checklist.map((item) => (
                <div className="item-card" key={item.id}>
                  <div className="item-card-title">
                    <h3>{item.label}</h3>
                    <StatusBadge label={item.status} tone={item.status === "complete" ? "green" : "yellow"} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Clarifications">
            <div className="grid-2">
              {portal.questions.map((question) => (
                <ClientQuestionCard question={question} key={question.id} />
              ))}
            </div>
          </Section>
          <Section title="Uploaded documents">
            <div className="grid-2">
              {portal.documents.slice(0, 4).map((document) => (
                <SourceDocumentCard document={document} key={document.id} />
              ))}
            </div>
          </Section>
        </div>
        <aside>
          <Section title="Progress">
            <Meter label="Return progress" value={portal.progress} />
          </Section>
          <Section title="Consent">
            <div className="grid-2">
              {portal.consents.map((consent) => (
                <div className="item-card" key={consent.id}>
                  <div className="item-card-title">
                    <h3>{consent.consentType.replaceAll("_", " ")}</h3>
                    <StatusBadge label={consent.granted ? "Granted" : "Not granted"} tone={consent.granted ? "green" : "yellow"} />
                  </div>
                  <p>{consent.scope}</p>
                </div>
              ))}
            </div>
          </Section>
        </aside>
      </div>
    </>
  );
}
