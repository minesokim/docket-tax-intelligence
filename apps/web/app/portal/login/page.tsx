import Link from "next/link";

import { IDS } from "@docket/domain";

import { PageHeader, Section } from "../../../src/components/docket-ui";

export default function PortalLoginPage() {
  return (
    <>
      <PageHeader eyebrow="Client Portal" title="Docket secure portal" description="Seeded portal access for Miguel Sandoval." />
      <Section title="Continue">
        <Link className="item-card" href={`/portal/returns/${IDS.taxReturn}`}>
          <h3>Open 2024 return checklist</h3>
          <p>Document requests, clarifications, consent, and signature status.</p>
        </Link>
      </Section>
    </>
  );
}
