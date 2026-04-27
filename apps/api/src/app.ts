import Fastify from "fastify";

import { readApiEnv } from "@docket/config";
import { log } from "@docket/observability";

import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerReadModelRoutes } from "./routes/read-models.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerTaxWorkflowRoutes } from "./routes/tax-workflows.js";

export function buildApiApp() {
  const env = readApiEnv();
  const app = Fastify({
    logger: false,
  });

  app.get("/", async () => ({
    product: "Docket API",
    apps: ["firm_dashboard", "client_portal"],
    defaultAiProvider: "mock",
    externalAiCalls: "disabled_by_default",
    environment: env.NODE_ENV,
  }));

  registerHealthRoutes(app);
  registerSessionRoutes(app);
  registerReadModelRoutes(app);
  registerJobRoutes(app);
  registerTaxWorkflowRoutes(app);
  registerEventRoutes(app);

  app.addHook("onReady", async () => {
    log("info", "api.app.ready", { environment: env.NODE_ENV });
  });

  return app;
}
