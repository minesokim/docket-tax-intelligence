import { NextResponse } from "next/server";

import { buildTaxChatResponse } from "../../../../src/lib/tax-chat";
import type { ChatHistoryTurn } from "../../../../src/lib/tax-chat-shared";

export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: unknown; returnId?: unknown; history?: unknown; stream?: unknown };
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

    const wantsStream = body.stream === true || request.headers.get("accept")?.includes("text/event-stream");
    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          void (async () => {
            try {
              const response = await buildTaxChatResponse(question, returnId, history, {
                emitTrace(step) {
                  controller.enqueue(encoder.encode(sse("reasoning", step)));
                },
              });
              controller.enqueue(encoder.encode(sse("response", response)));
              controller.close();
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown chat stream error";
              controller.enqueue(encoder.encode(sse("error", { message })));
              controller.close();
            }
          })();
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }

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
