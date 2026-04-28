import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const webEnvSchema = baseEnvSchema.extend({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
});

export const apiEnvSchema = baseEnvSchema.extend({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/docket"),
  DOCKET_PERSISTENCE: z.enum(["file", "postgres"]).default("file"),
  DOCKET_ENABLE_POSTGRES: z.enum(["true", "false"]).default("false"),
  SESSION_SECRET: z.string().min(32).default("development-session-secret-should-change"),
  OIDC_ISSUER: z.string().url().default("https://example-idp.local"),
  OIDC_CLIENT_ID: z.string().min(1).default("local-client-id"),
  OIDC_CLIENT_SECRET: z.string().min(1).default("local-client-secret"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default("http://localhost:4318"),
});

export const workerEnvSchema = apiEnvSchema;

export function readWebEnv(input: Record<string, string | undefined> = process.env) {
  return webEnvSchema.parse(input);
}

export function readApiEnv(input: Record<string, string | undefined> = process.env) {
  return apiEnvSchema.parse(input);
}

export function readWorkerEnv(input: Record<string, string | undefined> = process.env) {
  return workerEnvSchema.parse(input);
}
