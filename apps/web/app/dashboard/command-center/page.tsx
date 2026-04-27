import Link from "next/link";

import { getCommandCenter } from "@docket/domain";

import { MetricCard, Meter, PageHeader, RiskBadge, Section, StatusBadge } from "../../../src/components/docket-ui";

export const dynamic = "force-dynamic";

export default function CommandCenterPage() {
  const command = getCommandCenter();

  return (
    <>
      <PageHeader
        eyebrow="Firm command center"
        title="Returns that need attention before they become filing risk"
        description="AI findings, missing documents, extension risk, review workload, and knowledge freshness across the firm."
        actions={<Link className="status-badge tone-blue" href="/dashboard/returns/return-miguel-2024/workbench">Open Miguel workbench</Link>}
      />

      <Section title="Firm intelligence">
        <div className="metric-grid">
          {command.metrics.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
          ))}
        </div>
      </Section>

      <div className="grid-2">
        <Section title="Active returns" description="Readiness and extension risk use source evidence, issue severity, review state, and client latency.">
          <div className="grid-2">
            {command.activeReturns.map((item) => (
              <Link className="item-card" href={`/dashboard/returns/${item.id}/workbench`} key={item.id}>
                <div className="item-card-title">
                  <h3>{item.client?.displayName}</h3>
                  <RiskBadge risk={item.riskLevel} />
                </div>
                <p>{item.returnType}</p>
                <Meter label="Readiness" value={item.readiness.readinessScore} tone="blue" />
                <Meter label="Extension risk" value={item.extension.extensionRiskScore} tone="red" />
                <div className="pill-row">
                  <StatusBadge label={item.extension.recommendation} tone="yellow" />
                  <StatusBadge label={item.gate.pass ? "Ready gate pass" : "Ready gate blocked"} tone={item.gate.pass ? "green" : "red"} />
                </div>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="AI findings today" description="Examples from the seeded foundation scenario and firm-wide operating model.">
          <div className="grid-2">
            {command.findings.map((finding) => (
              <div className="item-card" key={finding}>
                <h3>{finding}</h3>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
