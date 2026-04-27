import { AIWorkflowTaskSchema, PermissionSchema, RiskLevelSchema, RoleSchema } from "@docket/domain";
import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.enum(["web", "api", "worker"]),
  timestamp: z.string().datetime(),
});

export const SessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    role: RoleSchema,
    permissions: z.array(PermissionSchema),
  }),
  firm: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  navigation: z.array(z.string().min(1)),
});

export const WorkflowResponseSchema = z.object({
  blocked: z.boolean(),
  blockers: z.array(z.string()),
  auditEvents: z.array(
    z.object({
      id: z.string(),
      eventType: z.string(),
      summary: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const RunAIWorkflowRequestSchema = z.object({
  task: AIWorkflowTaskSchema.optional(),
});

export const RiskSummarySchema = z.object({
  riskLevel: RiskLevelSchema,
  readinessScore: z.number().min(0).max(100),
  extensionRiskScore: z.number().min(0).max(100),
});

export const SearchEntityTypeSchema = z.enum(["client", "return", "document", "issue", "tax_fact", "authority", "workpaper"]);

export const SearchResponseSchema = z.object({
  query: z.string().trim().default(""),
  results: z.array(
    z.object({
      entityType: SearchEntityTypeSchema,
      id: z.string(),
      title: z.string(),
      href: z.string(),
    }),
  ),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
