"use server";

import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

import { revalidatePath } from "next/cache";

function workspaceRoot(): string {
  return resolve(process.cwd(), "../..");
}

export async function openClaudeCodeAuthAction() {
  const root = workspaceRoot();
  const child = spawn(process.execPath, [join(root, "scripts/open-claude-code-auth.mjs")], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  revalidatePath("/dashboard/settings");
}
