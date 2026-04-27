import { readWorkerEnv } from "@docket/config";
import { jobCatalog } from "@docket/jobs";
import { log } from "@docket/observability";

const env = readWorkerEnv();

log("info", "worker.boot", {
  environment: env.NODE_ENV,
  jobCount: jobCatalog.length,
  queue: "postgres_backed_placeholder",
});

for (const job of jobCatalog) {
  log("debug", "worker.job.registered", { job });
}
