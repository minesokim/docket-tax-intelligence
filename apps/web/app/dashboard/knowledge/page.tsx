import { getKnowledgeAdmin } from "@docket/domain";
import { getTieredKnowledgeSourceRegistry } from "@docket/tax-knowledge";

import { AuthorityBadge, PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";

export default function KnowledgePage() {
  const knowledge = getKnowledgeAdmin();
  const sourceTiers = getTieredKnowledgeSourceRegistry();

  return (
    <>
      <PageHeader eyebrow="Tax Knowledge Engine" title="Current authority, source syncs, snapshots, and rule packages" />
      <Section title="Docket source hierarchy">
        <div className="source-tier-list">
          {sourceTiers.map((tier) => (
            <div className="item-card source-tier-card" key={tier.tier}>
              <div className="item-card-title">
                <h3>Tier {tier.tier}: {tier.title}</h3>
                <StatusBadge label={`${tier.sources.length} source groups`} tone={tier.tier <= 2 ? "green" : tier.tier === 3 ? "yellow" : "blue"} />
              </div>
              <p>{tier.description}</p>
              <div className="source-rank-list">
                {tier.sources.map((source) => (
                  <div className="source-rank-row source-detail-row" key={source.id}>
                    <div className="source-detail-header">
                      <strong>{source.name}</strong>
                      <span>weight {source.authorityWeight} · {source.authorityRole.replaceAll("_", " ").toLowerCase()}</span>
                    </div>
                    <p>{source.notes}</p>
                    {source.includedSources ? (
                      <div className="included-source-list" aria-label={`${source.name} included sources`}>
                        {source.includedSources.map((includedSource) => (
                          <a className="included-source-chip" href={includedSource.sourceUrl} key={includedSource.id}>
                            {includedSource.name}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
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
