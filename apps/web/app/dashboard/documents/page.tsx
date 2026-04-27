import { getDocketSnapshot } from "@docket/domain";

import { PageHeader, Section, SourceDocumentCard, StatusBadge } from "../../../src/components/docket-ui";

export default function DocumentsPage() {
  const data = getDocketSnapshot();
  return (
    <>
      <PageHeader eyebrow="Document Intelligence" title="Document intake, extraction, source linking, and flags" />
      <Section title="Source documents">
        <div className="grid-3">
          {data.sourceDocuments.map((document) => (
            <SourceDocumentCard document={document} key={document.id} />
          ))}
        </div>
      </Section>
      <Section title="Document flags">
        <div className="grid-3">
          {data.documentFlags.length === 0 ? <StatusBadge label="No document flags in current seed" tone="green" /> : null}
          {data.documentFlags.map((flag) => (
            <div className="item-card" key={flag.id}>
              <div className="item-card-title">
                <h3>{flag.flagType.replaceAll("_", " ")}</h3>
                <StatusBadge label={flag.severity} tone={flag.severity === "RED" ? "red" : "yellow"} />
              </div>
              <p>{flag.message}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
