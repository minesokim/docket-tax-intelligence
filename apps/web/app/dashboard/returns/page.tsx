import Link from "next/link";

import { getDocketSnapshot } from "@docket/domain";

import { Meter, PageHeader, RiskBadge, Section, StatusBadge } from "../../../src/components/docket-ui";

export const dynamic = "force-dynamic";

export default function ReturnsPage() {
  const data = getDocketSnapshot();

  return (
    <>
      <PageHeader eyebrow="Returns" title="Return inventory" description="Every status change is review-gated and auditable." />
      <Section title="Active returns">
        <div className="grid-3">
          {data.taxReturns.map((taxReturn) => {
            const client = data.clients.find((item) => item.id === taxReturn.clientId);
            return (
              <Link className="item-card" href={`/dashboard/returns/${taxReturn.id}/workbench`} key={taxReturn.id}>
                <div className="item-card-title">
                  <h3>{client?.displayName}</h3>
                  <RiskBadge risk={taxReturn.riskLevel} />
                </div>
                <p>{taxReturn.taxYear} {taxReturn.returnType}</p>
                <Meter label="Readiness" value={taxReturn.readinessScore} />
                <Meter label="Extension risk" value={taxReturn.extensionRiskScore} tone="red" />
                <StatusBadge label={taxReturn.status.replaceAll("_", " ")} tone="yellow" />
              </Link>
            );
          })}
        </div>
      </Section>
    </>
  );
}
