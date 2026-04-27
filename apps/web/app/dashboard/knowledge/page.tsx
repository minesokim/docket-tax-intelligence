import { getKnowledgeAdmin } from "@docket/domain";

import { AuthorityBadge, PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";

export default function KnowledgePage() {
  const knowledge = getKnowledgeAdmin();
  return (
    <>
      <PageHeader eyebrow="Tax Knowledge Engine" title="Current authority, source syncs, snapshots, and rule packages" />
      <Section title="Knowledge snapshots">
        <div className="grid-3">
          {knowledge.snapshots.map((snapshot) => (
            <AuthorityBadge
              key={snapshot.id}
              label={snapshot.label}
              level={snapshot.lastSyncStatus}
              current={snapshot.lastSyncStatus === "CURRENT"}
            />
          ))}
        </div>
      </Section>
      <Section title="Authority sources">
        <div className="grid-3">
          {knowledge.sources.map((source) => (
            <div className="item-card" key={source.id}>
              <div className="item-card-title">
                <h3>{source.title}</h3>
                <StatusBadge label={source.authorityLevel.replaceAll("_", " ")} tone="blue" />
              </div>
              <p>{source.topicTags.join(" · ")}</p>
              <p>Retrieved {new Date(source.retrievedAt).toLocaleDateString("en-US")}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Source changes and impacts">
        <div className="grid-2">
          {knowledge.sourceChanges.map((change) => (
            <div className="item-card" key={change.id}>
              <div className="item-card-title">
                <h3>{change.title}</h3>
                <StatusBadge label={change.reviewStatus.replaceAll("_", " ")} tone="green" />
              </div>
              <p>{change.affectedForms.join(", ")} · {change.affectedTaxYears.join(", ")}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
