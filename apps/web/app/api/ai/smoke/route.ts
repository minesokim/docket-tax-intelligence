import { runTaxAgentSmokeLoop } from "../../../../src/lib/tax-agent-smoke";

export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const body = (await request.json()) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question : "";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        const response = runTaxAgentSmokeLoop(question, {
          emitTrace(step) {
            controller.enqueue(encoder.encode(sse("reasoning", step)));
          },
        });
        controller.enqueue(encoder.encode(sse("response", {
          answer: response.answer,
          sourceIndex: response.sourceIndex,
          contextLabel: response.contextLabel,
          contextReturnId: response.contextReturnId,
          reasoningTrace: response.reasoningTrace,
        })));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown smoke route error";
        controller.enqueue(encoder.encode(sse("error", { message })));
        controller.close();
      }
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
