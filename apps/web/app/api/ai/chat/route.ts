import { NextResponse } from "next/server";

import { buildTaxChatResponse } from "../../../../src/lib/tax-chat";
import type { ChatHistoryTurn } from "../../../../src/lib/tax-chat-shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: unknown; returnId?: unknown; history?: unknown };
    const question = typeof body.question === "string" ? body.question : "";
    const returnId = typeof body.returnId === "string" ? body.returnId : undefined;
    const history = Array.isArray(body.history)
      ? body.history
          .filter((turn): turn is ChatHistoryTurn => {
            if (!turn || typeof turn !== "object") return false;
            const candidate = turn as Partial<ChatHistoryTurn>;
            return (candidate.role === "user" || candidate.role === "assistant") && typeof candidate.content === "string";
          })
          .slice(-10)
      : [];
    const response = await buildTaxChatResponse(question, returnId, history);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat route error";
    console.error("Docket chat route failed", { message });
    return NextResponse.json(
      {
        error: "Docket chat is temporarily unavailable.",
        detail: process.env.NODE_ENV === "production" ? undefined : message,
      },
      { status: 500 },
    );
  }
}
