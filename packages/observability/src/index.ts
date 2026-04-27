export type LogLevel = "debug" | "info" | "warn" | "error";

function redact(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
    .replace(/\b\d{3}-\d{4}\b/g, "[phone]");
}

export function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = metadata ? ` ${redact(JSON.stringify(metadata))}` : "";
  console[level](`[docket] ${redact(message)}${payload}`);
}
