import { readApiEnv } from "@docket/config";
import { log } from "@docket/observability";

import { buildApiApp } from "./app.js";

const env = readApiEnv();
const app = buildApiApp();

const port = Number(process.env.PORT ?? 4000);

try {
  await app.listen({ port, host: "0.0.0.0" });
  log("info", "api.server.started", {
    port,
    appBaseUrl: env.APP_BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
  });
} catch (error) {
  log("error", "api.server.failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
