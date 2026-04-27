#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const claudePath = process.env.DOCKET_CLAUDE_CODE_CLI_PATH || commandExists("claude");

if (!claudePath) {
  console.error("Claude Code CLI was not found. Install it first, then rerun pnpm setup:claude.");
  console.error("Docs: https://code.claude.com/docs/en/quickstart");
  process.exit(1);
}

const cwd = process.cwd();
const loginCommand = [
  `cd ${shellQuote(cwd)}`,
  "echo 'Docket local Claude Code setup'",
  "echo 'If you are not already signed in, Claude Code will open browser authentication.'",
  `${shellQuote(claudePath)}`,
].join(" && ");

if (process.platform === "darwin") {
  const script = [
    'tell application "Terminal"',
    "activate",
    `do script ${JSON.stringify(loginCommand)}`,
    "end tell",
  ].join("\n");
  const result = spawnSync("osascript", ["-e", script], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

const result = spawnSync(claudePath, [], { stdio: "inherit", cwd });
process.exit(result.status ?? 0);
