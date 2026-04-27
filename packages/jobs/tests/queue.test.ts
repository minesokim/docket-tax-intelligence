import { describe, expect, it } from "vitest";
import { createInMemoryDocketRepository } from "@docket/db";
import { IDS, cloneDocketData, runDocumentExtraction } from "@docket/domain";

import { createDefaultDocketWorkflowHandlers, createInMemoryDocketJobQueue } from "../src/index";

describe("@docket/jobs workflow orchestration", () => {
  it("runs Docket workflows through a queued job and records audit ids", () => {
    const repository = createInMemoryDocketRepository(cloneDocketData);
    const queue = createInMemoryDocketJobQueue(createDefaultDocketWorkflowHandlers({ repository }), {
      now: () => "2026-04-26T12:00:00.000Z",
    });

    const queued = queue.enqueue("documents.classify-and-extract", { returnId: IDS.taxReturn, requestedByUserId: IDS.preparer });
    const completed = queue.runNext();
    const data = repository.read();

    expect(queued.status).toBe("QUEUED");
    expect(completed?.status).toBe("SUCCEEDED");
    expect(completed?.auditEventIds.length).toBeGreaterThan(0);
    expect(data.auditEvents.length).toBeGreaterThan(cloneDocketData().auditEvents.length);
  });

  it("marks unsafe job progression as blocked instead of silently succeeding", () => {
    const repository = createInMemoryDocketRepository(cloneDocketData);
    const queue = createInMemoryDocketJobQueue(createDefaultDocketWorkflowHandlers({ repository }));

    queue.enqueue("ai.run-reviewer-check", { returnId: IDS.taxReturn, requestedByUserId: IDS.owner });
    const completed = queue.runNext();

    expect(completed?.status).toBe("BLOCKED");
    expect(completed?.blockers).toContain("Red flags remain unresolved.");
    expect(completed?.auditEventIds.length).toBe(1);
  });

  it("runs a complete queued review chain to ready-to-file stub", () => {
    const repository = createInMemoryDocketRepository(cloneDocketData);
    const queue = createInMemoryDocketJobQueue(createDefaultDocketWorkflowHandlers({ repository }));

    queue.enqueue("review.complete-demo-review", { returnId: IDS.taxReturn, requestedByUserId: IDS.reviewer });
    const completed = queue.runAll();
    const data = repository.read();

    expect(completed).toHaveLength(1);
    expect(completed[0]?.status).toBe("SUCCEEDED");
    expect(data.taxReturns.find((taxReturn) => taxReturn.id === IDS.taxReturn)?.status).toBe("READY_TO_FILE_STUB");
  });

  it("fails closed when a registered workflow is blocked", () => {
    const withoutConsent = cloneDocketData();
    withoutConsent.consentRecords = withoutConsent.consentRecords.map((record) =>
      record.consentType === "AI_ASSISTED_TAX_PREP" ? { ...record, granted: false, grantedAt: null } : record,
    );

    const repository = createInMemoryDocketRepository(() => withoutConsent);
    const queue = createInMemoryDocketJobQueue({
      "documents.classify-and-extract": (payload) => repository.transact((data) => runDocumentExtraction(data, payload.returnId ?? "")),
    });

    queue.enqueue("documents.classify-and-extract", { returnId: IDS.taxReturn });
    const completed = queue.runNext();

    expect(completed?.status).toBe("BLOCKED");
    expect(completed?.blockers).toContain("Missing required consent: AI_ASSISTED_TAX_PREP.");
  });
});
