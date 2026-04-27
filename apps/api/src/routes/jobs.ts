import type { FastifyInstance } from "fastify";

import { createConfiguredDocketRepository } from "@docket/db";
import { IDS, cloneDocketData, type DocketData } from "@docket/domain";
import {
  createDefaultDocketWorkflowHandlers,
  createInMemoryDocketJobQueue,
  jobCatalog,
  type DocketJobName,
  type DocketJobPayload,
  type DocketJobQueue,
} from "@docket/jobs";

let queue: DocketJobQueue | null = null;

function getQueue(): DocketJobQueue {
  if (!queue) {
    const repository = createConfiguredDocketRepository<DocketData>({ seedData: cloneDocketData });
    queue = createInMemoryDocketJobQueue(createDefaultDocketWorkflowHandlers({ repository }), {
      idPrefix: "api-job",
    });
  }

  return queue;
}

export function resetApiJobQueueForTests(): void {
  queue = null;
}

function isDocketJobName(value: unknown): value is DocketJobName {
  return typeof value === "string" && jobCatalog.includes(value as DocketJobName);
}

function normalizePayload(value: unknown, fallbackReturnId?: string): DocketJobPayload {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : body;
  const normalized: DocketJobPayload = {
    clientId: typeof payload.clientId === "string" ? payload.clientId : IDS.client,
    requestedByUserId: typeof payload.requestedByUserId === "string" ? payload.requestedByUserId : IDS.preparer,
  };

  const returnId = typeof payload.returnId === "string" ? payload.returnId : fallbackReturnId;
  if (returnId) {
    normalized.returnId = returnId;
  }

  if (payload.params && typeof payload.params === "object") {
    normalized.params = payload.params as NonNullable<DocketJobPayload["params"]>;
  }

  return normalized;
}

function shouldRunImmediately(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { runImmediately?: unknown }).runImmediately);
}

export function registerJobRoutes(app: FastifyInstance) {
  app.get("/api/jobs/catalog", async () => ({ jobs: jobCatalog }));

  app.get("/api/jobs", async () => ({ jobs: getQueue().listJobs() }));

  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
    const job = getQueue().getJob(request.params.id);
    if (!job) {
      reply.code(404);
      return { error: "job_not_found" };
    }
    return job;
  });

  app.post<{ Body: { name?: unknown; payload?: unknown; runImmediately?: unknown } }>("/api/jobs", async (request, reply) => {
    if (!isDocketJobName(request.body?.name)) {
      reply.code(400);
      return { error: "invalid_job_name", jobs: jobCatalog };
    }

    const job = getQueue().enqueue(request.body.name, normalizePayload(request.body));
    if (shouldRunImmediately(request.body)) {
      const completed = getQueue().runNext();
      return { job: completed ?? job };
    }

    reply.code(202);
    return { job };
  });

  app.post<{ Params: { returnId: string; jobName: string }; Body: { payload?: unknown; runImmediately?: unknown } }>(
    "/api/returns/:returnId/jobs/:jobName",
    async (request, reply) => {
      if (!isDocketJobName(request.params.jobName)) {
        reply.code(400);
        return { error: "invalid_job_name", jobs: jobCatalog };
      }

      const job = getQueue().enqueue(request.params.jobName, normalizePayload(request.body, request.params.returnId));
      if (shouldRunImmediately(request.body)) {
        const completed = getQueue().runNext();
        return { job: completed ?? job };
      }

      reply.code(202);
      return { job };
    },
  );

  app.post("/api/jobs/run-next", async () => {
    const job = getQueue().runNext();
    return { job };
  });

  app.post("/api/jobs/run-all", async () => ({ jobs: getQueue().runAll() }));
}
