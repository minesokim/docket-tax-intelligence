import { getKnowledgeAdmin } from "@docket/domain";
import { getKnowledgeGraphSourceRegistry } from "@docket/tax-knowledge";

import { AuthorityBadge, PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";

export default function KnowledgePage() {
  const knowledge = getKnowledgeAdmin();
  const sourceRegistry = getKnowledgeGraphSourceRegistry();
  const topSources = sourceRegistry.slice(0, 10);
  const riskSources = sourceRegistry.filter((source) => source.graphLayer === "PREPARER_RISK_GRAPH");
  const signalSources = sourceRegistry.filter((source) => source.graphLayer === "COMMUNITY_SIGNAL_LAYER");

  return (
    <>
      <PageHeader eyebrow="Tax Knowledge Engine" title="Current authority, source syncs, snapshots, and rule packages" />
      <Section title="Docket source hierarchy">
        <div className="split-list">
          <div className="item-card">
            <div className="item-card-title">
              <h3>Trusted tax conclusion sources</h3>
              <StatusBadge label={`${sourceRegistry.filter((source) => source.canSupportTrustedTaxConclusion).length} sources`} tone="green" />
            </div>
            <p>
              These sources can support a trusted tax conclusion when the tax year, jurisdiction, effective date, and source freshness match. Lower-tier
              sources never override higher authority.
            </p>
            <div className="source-rank-list">
              {topSources.map((source) => (
                <div className="source-rank-row" key={source.id}>
                  <strong>{source.priority}. {source.name}</strong>
                  <span>{source.graphLayer.replaceAll("_", " ")} · weight {source.authorityWeight}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="item-card">
            <div className="item-card-title">
              <h3>Risk and signal layers</h3>
              <StatusBadge label="Human review required" tone="yellow" />
            </div>
            <p>
              OPR discipline, DOJ, TIGTA, and practitioner communities are not tax-law authority. They create compliance patterns, review gates,
              risk alerts, and candidate research tasks.
            </p>
            <div className="source-rank-list">
              {[...riskSources, ...signalSources].map((source) => (
                <div className="source-rank-row" key={source.id}>
                  <strong>{source.priority}. {source.name}</strong>
                  <span>{source.authorityRole.replaceAll("_", " ")} · {source.ingestionPriority.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
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
