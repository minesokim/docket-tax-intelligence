import { TaxChatClient } from "./tax-chat-client";

export const dynamic = "force-dynamic";

export default async function AITaxIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; returnId?: string }>;
}) {
  const params = await searchParams;
  return <TaxChatClient initialQuestion={params.q ?? ""} initialReturnId={params.returnId} />;
}
