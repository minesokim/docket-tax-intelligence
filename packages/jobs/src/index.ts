import type { DocketRepository } from "@docket/db";
import {
  IDS,
  approveAllTaxFactsForReturn,
  completeDemoReviewForReturn,
  generateClientQuestions,
  generateExportPacket,
  generateWorkpapers,
  markReadyForReview,
  markReadyForSignature,
  markReadyToFileStub,
  receiveMissingDocumentForReturn,
  resolveAllIssuesForReturn,
  runAIPrep,
  runContextReconciliation,
  runDocumentExtraction,
  runKnowledgeSync,
  runTaxProBench,
  signReturnAuthorization,
  type DocketData,
  type WorkflowResult,
} from "@docket/domain";

export const jobCatalog = [
  "documents.validate-upload",
  "documents.malware-scan-placeholder",
  "documents.classify-and-extract",
  "context.reconcile-client-file",
  "conversation.extract-tax-claims",
  "knowledge.sync-official-sources",
  "knowledge.assess-source-changes",
  "risk.score-return-readiness",
  "ai.run-prep-workflow",
  "ai.run-reviewer-check",
  "client.generate-clarifications",
  "workpapers.generate",
  "export.generate-packet",
  "evals.run-taxpro-bench",
  "audit.redaction-check",
  "review.approve-all-facts",
  "review.resolve-all-issues",
  "review.mark-ready-for-review",
  "review.mark-ready-for-signature",
  "review.receive-missing-document",
  "review.sign-authorization",
  "review.complete-demo-review",
] as const;

export type DocketJobName = (typeof jobCatalog)[number];
export type DocketJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "BLOCKED" | "FAILED";

export type DocketJobPayload = {
  returnId?: string;
  clientId?: string;
  requestedByUserId?: string;
  params?: Record<string, string | number | boolean | null>;
};

export type DocketJobRecord = {
  id: string;
  name: DocketJobName;
  payload: DocketJobPayload;
  status: DocketJobStatus;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  blocked: boolean;
  blockers: string[];
  auditEventIds: string[];
  resultSummary: Record<string, unknown> | null;
  error: string | null;
};

export type DocketJobHandler = (payload: DocketJobPayload) => WorkflowResult | { data: DocketData; summary: Record<string, unknown> };

export type DocketJobQueue = {
  enqueue(name: DocketJobName, payload: DocketJobPayload): DocketJobRecord;
  runNext(): DocketJobRecord | null;
  runAll(): DocketJobRecord[];
  getJob(id: string): DocketJobRecord | null;
  listJobs(): DocketJobRecord[];
};

export type DocketJobQueueOptions = {
  now?: () => string;
  idPrefix?: string;
};

export type DocketWorkflowHandlerOptions = {
  repository: DocketRepository<DocketData>;
  reviewerId?: string;
  ownerId?: string;
};

function requireReturnId(payload: DocketJobPayload): string {
  if (!payload.returnId) {
    throw new Error("returnId is required for this Docket job.");
  }
  return payload.returnId;
}

function summarizeWorkflow(result: WorkflowResult): Record<string, unknown> {
  return {
    blocked: result.blocked,
    blockers: result.blockers,
    auditEventIds: result.auditEvents.map((event) => event.id),
    auditEventTypes: result.auditEvents.map((event) => event.eventType),
  };
}

function toWorkflowResult(result: ReturnType<DocketJobHandler>): WorkflowResult {
  if ("auditEvents" in result) {
    return result;
  }

  return {
    data: result.data,
    auditEvents: [],
    blocked: false,
    blockers: [],
  };
}

function redactJobError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\bMiguel Sandoval\b/g, "[client]");
}

export function createDefaultDocketWorkflowHandlers(options: DocketWorkflowHandlerOptions): Partial<Record<DocketJobName, DocketJobHandler>> {
  const reviewerId = options.reviewerId ?? IDS.reviewer;
  const ownerId = options.ownerId ?? IDS.owner;

  return {
    "documents.classify-and-extract": (payload) => options.repository.transact((data) => runDocumentExtraction(data, requireReturnId(payload))),
    "context.reconcile-client-file": (payload) => options.repository.transact((data) => runContextReconciliation(data, requireReturnId(payload))),
    "ai.run-prep-workflow": (payload) => options.repository.transact((data) => runAIPrep(data, requireReturnId(payload))),
    "ai.run-reviewer-check": (payload) => options.repository.transact((data) => markReadyToFileStub(data, requireReturnId(payload), ownerId)),
    "client.generate-clarifications": (payload) => options.repository.transact((data) => generateClientQuestions(data, requireReturnId(payload))),
    "workpapers.generate": (payload) => options.repository.transact((data) => generateWorkpapers(data, requireReturnId(payload))),
    "export.generate-packet": (payload) => options.repository.transact((data) => generateExportPacket(data, requireReturnId(payload))),
    "knowledge.sync-official-sources": () => options.repository.transact((data) => runKnowledgeSync(data)),
    "review.approve-all-facts": (payload) => options.repository.transact((data) => approveAllTaxFactsForReturn(data, requireReturnId(payload), reviewerId)),
    "review.resolve-all-issues": (payload) => options.repository.transact((data) => resolveAllIssuesForReturn(data, requireReturnId(payload), reviewerId)),
    "review.mark-ready-for-review": (payload) => options.repository.transact((data) => markReadyForReview(data, requireReturnId(payload), payload.requestedByUserId ?? IDS.preparer)),
    "review.mark-ready-for-signature": (payload) => options.repository.transact((data) => markReadyForSignature(data, requireReturnId(payload), reviewerId)),
    "review.receive-missing-document": (payload) => options.repository.transact((data) => receiveMissingDocumentForReturn(data, requireReturnId(payload))),
    "review.sign-authorization": (payload) => options.repository.transact((data) => signReturnAuthorization(data, requireReturnId(payload))),
    "review.complete-demo-review": (payload) => options.repository.transact((data) => completeDemoReviewForReturn(data, requireReturnId(payload), reviewerId)),
    "evals.run-taxpro-bench": () => ({
      data: options.repository.read(),
      summary: runTaxProBench(options.repository.read()),
    }),
  };
}

export class InMemoryDocketJobQueue implements DocketJobQueue {
  private jobs: DocketJobRecord[] = [];
  private sequence = 0;

  constructor(
    private readonly handlers: Partial<Record<DocketJobName, DocketJobHandler>>,
    private readonly options: DocketJobQueueOptions = {},
  ) {}

  enqueue(name: DocketJobName, payload: DocketJobPayload): DocketJobRecord {
    if (!jobCatalog.includes(name)) {
      throw new Error(`Unknown Docket job: ${name}`);
    }

    this.sequence += 1;
    const job: DocketJobRecord = {
      id: `${this.options.idPrefix ?? "job"}-${this.sequence}`,
      name,
      payload,
      status: "QUEUED",
      attempts: 0,
      createdAt: this.now(),
      startedAt: null,
      finishedAt: null,
      blocked: false,
      blockers: [],
      auditEventIds: [],
      resultSummary: null,
      error: null,
    };
    this.jobs.push(job);
    return { ...job };
  }

  runNext(): DocketJobRecord | null {
    const job = this.jobs.find((item) => item.status === "QUEUED");
    if (!job) return null;

    const handler = this.handlers[job.name];
    job.status = "RUNNING";
    job.startedAt = this.now();
    job.attempts += 1;

    try {
      if (!handler) {
        throw new Error(`No handler registered for Docket job ${job.name}.`);
      }

      const result = toWorkflowResult(handler(job.payload));
      const summary = summarizeWorkflow(result);
      job.blocked = result.blocked;
      job.blockers = result.blockers;
      job.auditEventIds = result.auditEvents.map((event) => event.id);
      job.resultSummary = Object.keys(summary).length > 0 ? summary : null;
      job.status = result.blocked ? "BLOCKED" : "SUCCEEDED";
    } catch (error) {
      job.status = "FAILED";
      job.error = redactJobError(error);
    } finally {
      job.finishedAt = this.now();
    }

    return { ...job };
  }

  runAll(): DocketJobRecord[] {
    const completed: DocketJobRecord[] = [];
    let job = this.runNext();
    while (job) {
      completed.push(job);
      job = this.runNext();
    }
    return completed;
  }

  getJob(id: string): DocketJobRecord | null {
    const job = this.jobs.find((item) => item.id === id);
    return job ? { ...job } : null;
  }

  listJobs(): DocketJobRecord[] {
    return this.jobs.map((job) => ({ ...job }));
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

export function createInMemoryDocketJobQueue(
  handlers: Partial<Record<DocketJobName, DocketJobHandler>>,
  options?: DocketJobQueueOptions,
): DocketJobQueue {
  return new InMemoryDocketJobQueue(handlers, options);
}
