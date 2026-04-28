import { notFound } from "next/navigation";

import { getPortalReturn } from "@docket/domain";

import { PageHeader, Section, SourceDocumentCard, StatusBadge } from "../../../../../src/components/docket-ui";
import { uploadPortalDocumentAction } from "./actions";

export default async function PortalDocumentsPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const portal = getPortalReturn(returnId);
  if (!portal) notFound();
  return (
    <>
      <PageHeader eyebrow="Documents" title="Uploads and requests" description="Upload a text-backed tax document and Docket will classify, extract, evidence-link, and route it through review." />
      <Section title="Upload document">
        <div className="item-card">
          <div className="item-card-title">
            <h3>Document upload</h3>
            <StatusBadge label="Text-backed ingestion" tone="green" />
          </div>
          <p>Supported now: text, CSV, and text-extracted PDFs. Production OCR/storage adapters remain behind the same pipeline.</p>
          <form action={uploadPortalDocumentAction} className="upload-form">
            <input name="returnId" type="hidden" value={returnId} />
            <input accept=".txt,.csv,.text" name="document" required type="file" />
            <button type="submit">Upload and analyze</button>
          </form>
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
