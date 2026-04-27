import type { FastifyInstance } from "fastify";

import { HealthResponseSchema } from "@docket/contracts";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    }),
  );
}
