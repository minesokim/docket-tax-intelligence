import { notFound } from "next/navigation";

import { getPortalReturn } from "@docket/domain";

import { ClientQuestionCard, PageHeader, Section } from "../../../../../src/components/docket-ui";

export default async function PortalClarificationsPage({ params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const portal = getPortalReturn(returnId);
  if (!portal) notFound();
  return (
    <>
      <PageHeader eyebrow="Clarifications" title="Firm questions" description="Targeted questions generated from document and conversation reconciliation." />
      <Section title="Questions">
        <div className="grid-2">
          {portal.questions.map((question) => (
            <ClientQuestionCard question={question} key={question.id} />
          ))}
        </div>
      </Section>
    </>
  );
}
