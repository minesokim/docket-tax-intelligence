import type { FastifyInstance } from "fastify";

import {
  IDS,
  acceptTaxFact,
  answerOpenClarificationsForReturn,
  answerClientClarification,
  approveAllTaxFactsForReturn,
  completeDemoReviewForReturn,
  escalateIssue,
  generateClientQuestions,
  generateExportPacket,
  generateWorkpapers,
  grantConsent,
  markReadyForReview,
  markReadyForSignature,
  markReadyToFileStub,
  receiveMissingDocumentForReturn,
  rejectTaxFact,
  resolveAllIssuesForReturn,
  resolveIssue,
  revokeConsent,
  runAIPrep,
  runContextReconciliation,
  runDocumentExtraction,
  runKnowledgeSync,
  readDocketData,
  resetDocketData,
  runPersistedWorkflow,
  runTaxProBench,
  signReturnAuthorization,
  writeDocketData,
} from "@docket/domain";

const summarize = (result: ReturnType<typeof runDocumentExtraction>) => ({
  blocked: result.blocked,
  blockers: result.blockers,
  auditEvents: result.auditEvents.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    summary: event.summary,
    createdAt: event.createdAt,
  })),
});

export function registerTaxWorkflowRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/returns/:id/run-context-reconciliation", async (request) =>
    summarize(runPersistedWorkflow((data) => runContextReconciliation(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/run-document-extraction", async (request) =>
    summarize(runPersistedWorkflow((data) => runDocumentExtraction(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/run-ai-prep", async (request) =>
    summarize(runPersistedWorkflow((data) => runAIPrep(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/run-reviewer-check", async (request) =>
    summarize(runPersistedWorkflow((data) => markReadyToFileStub(data, request.params.id, IDS.owner))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/mark-ready-for-review", async (request) =>
    summarize(runPersistedWorkflow((data) => markReadyForReview(data, request.params.id, IDS.preparer))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/mark-ready-for-signature", async (request) =>
    summarize(runPersistedWorkflow((data) => markReadyForSignature(data, request.params.id, IDS.reviewer))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/generate-client-questions", async (request) =>
    summarize(runPersistedWorkflow((data) => generateClientQuestions(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/generate-workpapers", async (request) =>
    summarize(runPersistedWorkflow((data) => generateWorkpapers(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/generate-export-packet", async (request) =>
    summarize(runPersistedWorkflow((data) => generateExportPacket(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/answer-open-clarifications", async (request) =>
    summarize(runPersistedWorkflow((data) => answerOpenClarificationsForReturn(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/receive-missing-document", async (request) =>
    summarize(runPersistedWorkflow((data) => receiveMissingDocumentForReturn(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/approve-all-facts", async (request) =>
    summarize(runPersistedWorkflow((data) => approveAllTaxFactsForReturn(data, request.params.id, IDS.reviewer))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/resolve-all-issues", async (request) =>
    summarize(runPersistedWorkflow((data) => resolveAllIssuesForReturn(data, request.params.id, IDS.reviewer))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/sign-authorization", async (request) =>
    summarize(runPersistedWorkflow((data) => signReturnAuthorization(data, request.params.id))),
  );
  app.post<{ Params: { id: string } }>("/api/returns/:id/complete-demo-review", async (request) =>
    summarize(runPersistedWorkflow((data) => completeDemoReviewForReturn(data, request.params.id, IDS.reviewer))),
  );
  app.post<{ Params: { id: string } }>("/api/tax-facts/:id/accept", async (request) =>
    summarize(runPersistedWorkflow((data) => acceptTaxFact(data, request.params.id, IDS.reviewer))),
  );
  app.post<{ Params: { id: string } }>("/api/tax-facts/:id/reject", async (request) =>
    summarize(runPersistedWorkflow((data) => rejectTaxFact(data, request.params.id, IDS.reviewer, "Rejected through API mock route."))),
  );
  app.post<{ Params: { id: string } }>("/api/issues/:id/resolve", async (request) =>
    summarize(runPersistedWorkflow((data) => resolveIssue(data, request.params.id, IDS.reviewer))),
  );
  app.post<{ Params: { id: string } }>("/api/issues/:id/escalate", async (request) =>
    summarize(runPersistedWorkflow((data) => escalateIssue(data, request.params.id, IDS.preparer))),
  );
  app.post<{ Params: { id: string } }>("/api/clarifications/:id/answer", async (request) =>
    summarize(runPersistedWorkflow((data) => answerClientClarification(data, request.params.id, "Portal answer submitted through mock API route."))),
  );
  app.post<{ Params: { id: string } }>("/api/consents/:id/grant", async (request) =>
    summarize(runPersistedWorkflow((data) => grantConsent(data, request.params.id, IDS.client))),
  );
  app.post<{ Params: { id: string } }>("/api/consents/:id/revoke", async (request) =>
    summarize(runPersistedWorkflow((data) => revokeConsent(data, request.params.id, IDS.client))),
  );
  app.post("/api/knowledge/sync", async () => summarize(runPersistedWorkflow((data) => runKnowledgeSync(data))));
  app.post("/api/evals/run", async () => runTaxProBench(readDocketData()));
  app.post("/api/dev/reset-state", async () => {
    const data = resetDocketData();
    writeDocketData(data);
    return { ok: true };
  });
}
