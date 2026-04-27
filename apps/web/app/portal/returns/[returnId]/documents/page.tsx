import { notFound } from "next/navigation";

import { getPortalReturn } from "@docket/domain";

import { PageHeader, Section, SourceDocumentCard, StatusBadge } from "../../../../../src/components/docket-ui";

export default async function PortalDocumentsPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const portal = getPortalReturn(returnId);
  if (!portal) notFound();
  return (
    <>
      <PageHeader eyebrow="Documents" title="Uploads and requests" description="Upload control is stubbed for the foundation release." />
      <Section title="Upload placeholder">
        <div className="item-card">
          <div className="item-card-title">
            <h3>Document upload</h3>
            <StatusBadge label="Stubbed" tone="yellow" />
          </div>
          <p>Production storage is modeled through the S3/R2-ready storage key and adapter interface.</p>
        </div>
      </Section>
      <Section title="Current documents">
        <div className="grid-2">
          {portal.documents.map((document) => (
            <SourceDocumentCard document={document} key={document.id} />
          ))}
        </div>
      </Section>
    </>
  );
}
