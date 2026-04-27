import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IDS, readDocketData, resetDocketData } from "@docket/domain";

import { buildApiApp } from "../src/app";
import { resetApiJobQueueForTests } from "../src/routes/jobs";

let previousStatePath: string | undefined;
let stateDir: string;

beforeEach(() => {
  previousStatePath = process.env.DOCKET_STATE_PATH;
  stateDir = mkdtempSync(join(tmpdir(), "docket-api-jobs-"));
  process.env.DOCKET_STATE_PATH = join(stateDir, "state.json");
  resetApiJobQueueForTests();
  resetDocketData();
});

afterEach(() => {
  resetApiJobQueueForTests();
  if (previousStatePath === undefined) {
    delete process.env.DOCKET_STATE_PATH;
  } else {
    process.env.DOCKET_STATE_PATH = previousStatePath;
  }
  rmSync(stateDir, { recursive: true, force: true });
});

describe("API job routes", () => {
  it("exposes the job catalog", async () => {
    const app = buildApiApp();
    const response = await app.inject({ method: "GET", url: "/api/jobs/catalog" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ jobs: expect.arrayContaining(["ai.run-prep-workflow"]) }));
  });

  it("enqueues and runs a return workflow job", async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/returns/${IDS.taxReturn}/jobs/documents.classify-and-extract`,
      payload: { runImmediately: true },
    });
    const body = response.json();
    const data = readDocketData();

    expect(response.statusCode).toBe(200);
    expect(body.job.status).toBe("SUCCEEDED");
    expect(body.job.auditEventIds.length).toBeGreaterThan(0);
    expect(data.auditEvents.length).toBeGreaterThan(3);
  });

  it("reports blocked jobs without clearing review gates", async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: {
        name: "ai.run-reviewer-check",
        payload: { returnId: IDS.taxReturn },
        runImmediately: true,
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.job.status).toBe("BLOCKED");
    expect(body.job.blockers).toContain("Red flags remain unresolved.");
  });

  it("can list and fetch queued job records", async () => {
    const app = buildApiApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/jobs",
      payload: {
        name: "client.generate-clarifications",
        payload: { returnId: IDS.taxReturn },
      },
    });
    const job = created.json().job;
    const listed = await app.inject({ method: "GET", url: "/api/jobs" });
    const fetched = await app.inject({ method: "GET", url: `/api/jobs/${job.id}` });

    expect(created.statusCode).toBe(202);
    expect(listed.json().jobs).toContainEqual(expect.objectContaining({ id: job.id, status: "QUEUED" }));
    expect(fetched.json()).toEqual(expect.objectContaining({ id: job.id, name: "client.generate-clarifications" }));
  });

  it("persists consent grant and revoke workflow routes", async () => {
    const app = buildApiApp();
    const revoked = await app.inject({ method: "POST", url: "/api/consents/consent-ai-tax-prep/revoke" });
    let data = readDocketData();

    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().auditEvents[0].eventType).toBe("CONSENT_REVOKED");
    expect(data.consentRecords.find((record) => record.id === "consent-ai-tax-prep")?.granted).toBe(false);

    const granted = await app.inject({ method: "POST", url: "/api/consents/consent-ai-tax-prep/grant" });
    data = readDocketData();

    expect(granted.statusCode).toBe(200);
    expect(granted.json().auditEvents[0].eventType).toBe("CONSENT_GRANTED");
    expect(data.consentRecords.find((record) => record.id === "consent-ai-tax-prep")?.granted).toBe(true);
  });

  it("exposes return trust checklist and persists audited consent blockers", async () => {
    const app = buildApiApp();
    const checklist = await app.inject({ method: "GET", url: `/api/v1/returns/${IDS.taxReturn}/trust-checklist` });

    expect(checklist.statusCode).toBe(200);
    expect(checklist.json().items).toContainEqual(expect.objectContaining({ id: "consent-ai-prep", status: "PASS" }));

    await app.inject({ method: "POST", url: "/api/consents/consent-ai-tax-prep/revoke" });
    const blocked = await app.inject({ method: "POST", url: `/api/returns/${IDS.taxReturn}/run-document-extraction` });
    const data = readDocketData();

    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().blocked).toBe(true);
    expect(blocked.json().auditEvents[0].eventType).toBe("WORKFLOW_BLOCKED");
    expect(data.auditEvents).toContainEqual(expect.objectContaining({ eventType: "WORKFLOW_BLOCKED" }));
  });

  it("runs the Miguel return lifecycle through API routes with trust and audit verification", async () => {
    const app = buildApiApp();
    const initialWorkbench = await app.inject({ method: "GET", url: `/api/v1/returns/${IDS.taxReturn}/workbench` });
    expect(initialWorkbench.statusCode).toBe(200);
    expect(initialWorkbench.json().readyToFileGate.pass).toBe(false);

    const aiPrep = await app.inject({ method: "POST", url: `/api/returns/${IDS.taxReturn}/run-ai-prep` });
    expect(aiPrep.statusCode).toBe(200);
    expect(aiPrep.json().blocked).toBe(false);

    const completed = await app.inject({ method: "POST", url: `/api/returns/${IDS.taxReturn}/complete-demo-review` });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().blocked).toBe(false);

    const finalWorkbench = await app.inject({ method: "GET", url: `/api/v1/returns/${IDS.taxReturn}/workbench` });
    const workbench = finalWorkbench.json();
    expect(workbench.taxReturn.status).toBe("READY_TO_FILE_STUB");
    expect(workbench.readyToFileGate.pass).toBe(true);
    expect(workbench.exportPackage.state).toBe("GENERATED");
    expect(workbench.trustChecklist.blockers).toEqual([]);
    expect(workbench.trustChecklist.auditSummary.totalEvents).toBeGreaterThan(10);
    expect(workbench.auditEvents).toContainEqual(expect.objectContaining({ eventType: "STATUS_CHANGED" }));
  });
});
