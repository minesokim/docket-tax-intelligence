import type { FastifyInstance } from "fastify";

import { SessionResponseSchema } from "@docket/contracts";
import { docketSeedData } from "@docket/domain";

export function registerSessionRoutes(app: FastifyInstance) {
  app.get("/api/v1/session", async () => {
    const user = docketSeedData.firmUsers[0];
    const firm = docketSeedData.firms[0];
    if (!user || !firm) throw new Error("Seed session missing.");

    return SessionResponseSchema.parse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
      firm: {
        id: firm.id,
        name: firm.name,
      },
      navigation: [
        "Command Center",
        "Clients",
        "Return Workbench",
        "Documents",
        "Conversations",
        "Knowledge",
        "Evals",
        "Settings",
      ],
    });
  });

  app.get("/api/v1/firm", async () => ({
    firm: docketSeedData.firms[0],
    security: docketSeedData.securitySettings[0],
    policies: docketSeedData.firmPolicies,
  }));
}
