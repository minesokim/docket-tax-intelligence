import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { runConfiguredDocketMigrations } from "./index";

async function main() {
  const result = await runConfiguredDocketMigrations();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";

if (import.meta.url === entryUrl) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
