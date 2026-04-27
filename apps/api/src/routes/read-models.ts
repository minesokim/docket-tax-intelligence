import type { FastifyInstance } from "fastify";

import {
  getClient360,
  getCommandCenter,
  getDocketSnapshot,
  getEvalsDashboard,
  getKnowledgeAdmin,
  getPortalReturn,
  getReturnTrustChecklist,
  getReturnWorkbench,
  searchDocket,
} from "@docket/domain";

export function registerReadModelRoutes(app: FastifyInstance) {
  app.get("/api/v1/dashboard/command-center", async () => getCommandCenter());

  app.get("/api/v1/clients", async () => ({ clients: getDocketSnapshot().clients }));

  app.get<{ Params: { clientId: string } }>("/api/v1/clients/:clientId", async (request, reply) => {
    const client = getClient360(request.params.clientId);
    if (!client) {
      reply.code(404);
      return { error: "client_not_found" };
    }
    return client;
  });

  app.get("/api/v1/returns", async () => ({ returns: getDocketSnapshot().taxReturns }));

  app.get<{ Params: { returnId: string } }>("/api/v1/returns/:returnId/workbench", async (request, reply) => {
    const workbench = getReturnWorkbench(request.params.returnId);
    if (!workbench) {
      reply.code(404);
      return { error: "return_not_found" };
    }
    return workbench;
  });

  app.get<{ Params: { returnId: string } }>("/api/v1/returns/:returnId/trust-checklist", async (request, reply) => {
    const checklist = getReturnTrustChecklist(request.params.returnId);
    if (!checklist) {
      reply.code(404);
      return { error: "return_not_found" };
    }
    return checklist;
  });

  app.get<{ Params: { returnId: string } }>("/api/v1/portal/returns/:returnId", async (request, reply) => {
    const portalReturn = getPortalReturn(request.params.returnId);
    if (!portalReturn) {
      reply.code(404);
      return { error: "return_not_found" };
    }
    return portalReturn;
  });

  app.get("/api/v1/documents", async () => ({ documents: getDocketSnapshot().sourceDocuments, flags: getDocketSnapshot().documentFlags }));
  app.get("/api/v1/conversations", async () => ({
    conversations: getDocketSnapshot().conversations,
    messages: getDocketSnapshot().conversationMessages,
    insights: getDocketSnapshot().conversationInsights,
  }));
  app.get("/api/v1/knowledge", async () => getKnowledgeAdmin());
  app.get("/api/v1/evals", async () => getEvalsDashboard());
  app.get<{ Querystring: { q?: string } }>("/api/v1/search", async (request) => ({
    query: request.query.q ?? "",
    results: searchDocket(request.query.q ?? ""),
  }));
}
