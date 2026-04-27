import { notFound } from "next/navigation";

import { getPortalReturn } from "@docket/domain";

import { PageHeader, Section, StatusBadge } from "../../../../../src/components/docket-ui";

export default async function PortalSignaturePage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const portal = getPortalReturn(returnId);
  if (!portal) notFound();
  return (
    <>
      <PageHeader eyebrow="Signature" title="Signature and authorization status" description="Form 8879 and payment flow remain placeholders in the foundation release." />
      <Section title="Authorizations">
        <div className="grid-2">
          {portal.signatures.map((signature) => (
            <div className="item-card" key={signature.id}>
              <div className="item-card-title">
                <h3>{signature.authorizationType.replaceAll("_", " ")}</h3>
                <StatusBadge label={signature.status.replaceAll("_", " ")} tone={signature.status === "SIGNED" ? "green" : "yellow"} />
              </div>
              <p>{signature.retentionRequirement}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
