import Link from "next/link";

import { getDocketSnapshot } from "@docket/domain";

import { MetricCard, PageHeader, Section, StatusBadge } from "../../../src/components/docket-ui";

export default function ClientsPage() {
  const data = getDocketSnapshot();

  return (
    <>
      <PageHeader eyebrow="Clients" title="Client files with source-backed context" description="Open Client 360 to see facts, claims, documents, prior-year patterns, and risk in one place." />
      <Section title="Client list">
        <div className="grid-3">
          {data.clients.map((client) => (
            <Link className="item-card" href={`/dashboard/clients/${client.id}`} key={client.id}>
              <div className="item-card-title">
                <h3>{client.displayName}</h3>
                <StatusBadge label={`${client.averageResponseDays}d avg`} tone="yellow" />
              </div>
              <p>{client.tags.join(" · ")}</p>
              <div className="metric-grid">
                <MetricCard label="Responsiveness" value={`${client.responsivenessScore}%`} tone="yellow" />
                <MetricCard label="Open returns" value={data.taxReturns.filter((taxReturn) => taxReturn.clientId === client.id).length} tone="blue" />
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
