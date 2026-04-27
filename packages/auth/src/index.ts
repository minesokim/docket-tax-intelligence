import { z } from "zod";

import { PermissionSchema, RoleSchema, type DocketData, type Permission, type Role } from "@docket/domain";

export const SessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;

export const DocketSessionSchema = z.object({
  firmId: z.string().min(1),
  user: SessionUserSchema,
});

export type DocketSession = z.infer<typeof DocketSessionSchema>;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  FIRM_OWNER: [
    "run_ai_prep",
    "approve_tax_fact",
    "resolve_red_flag",
    "send_client_tax_advice",
    "mark_ready_to_file",
    "view_pii",
    "export_packet",
    "manage_firm_policy",
    "manage_consent",
    "view_audit_log",
    "manage_tax_knowledge",
  ],
  PARTNER: [
    "run_ai_prep",
    "approve_tax_fact",
    "resolve_red_flag",
    "send_client_tax_advice",
    "mark_ready_to_file",
    "view_pii",
    "export_packet",
    "manage_firm_policy",
    "manage_consent",
    "view_audit_log",
    "manage_tax_knowledge",
  ],
  MANAGER_REVIEWER: ["run_ai_prep", "approve_tax_fact", "resolve_red_flag", "view_pii", "export_packet", "view_audit_log"],
  PREPARER: ["run_ai_prep", "view_pii", "export_packet", "view_audit_log"],
  ADMIN_ASSISTANT: ["view_pii", "view_audit_log"],
  CLIENT: [],
  EXTERNAL_BOOKKEEPER: ["view_pii"],
  READ_ONLY_AUDITOR: ["view_audit_log"],
  DOCKET_ADMIN: ["manage_tax_knowledge", "view_audit_log"],
};

export function can(user: { permissions: Permission[] }, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function createDemoSession(data: DocketData): DocketSession {
  const user = data.firmUsers[0];
  if (!user) throw new Error("Demo firm user missing.");
  return DocketSessionSchema.parse({
    firmId: user.firmId,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    },
  });
}
