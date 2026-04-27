import { notFound } from "next/navigation";

import { getPortalReturn } from "@docket/domain";

import { PageHeader, Section, StatusBadge } from "../../../../../src/components/docket-ui";

export default async function PortalChecklistPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const portal = getPortalReturn(returnId);
  if (!portal) notFound();
  return (
    <>
      <PageHeader eyebrow="Checklist" title="Adaptive return checklist" />
      <Section title="Open items">
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
    </>
  );
}
