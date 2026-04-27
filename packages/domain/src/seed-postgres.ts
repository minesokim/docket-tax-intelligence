import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { createConfiguredAsyncDocketRepository } from "@docket/db";

import { cloneDocketData } from "./seed";

async function main() {
  const repository = createConfiguredAsyncDocketRepository({
    seedData: cloneDocketData,
    env: {
      ...process.env,
      DOCKET_PERSISTENCE: "postgres",
    },
  });

  try {
    const data = await repository.reset();
    console.log(
      JSON.stringify(
        {
          ok: true,
          repository: repository.kind,
          firms: data.firms.length,
          clients: data.clients.length,
          taxReturns: data.taxReturns.length,
          auditEvents: data.auditEvents.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await repository.close?.();
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";

if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
