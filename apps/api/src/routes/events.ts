import type { FastifyInstance } from "fastify";

export function registerEventRoutes(app: FastifyInstance) {
  app.get("/api/v1/events/stream", async (_request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ status: "connected" })}\n\n`);
    reply.raw.end();
    return reply;
  });
}
