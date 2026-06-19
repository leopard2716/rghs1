import { z } from "zod";

export const createWorkspaceInput = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.")
    .refine((slug) => !["admin", "recover"].includes(slug), "This slug is reserved by RGHS1."),
  defaultMarkets: z.array(z.string().min(2).max(80)).max(12).optional()
});

export const assignWorkspaceAdminInput = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(2).max(120).optional()
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;
export type AssignWorkspaceAdminInput = z.infer<typeof assignWorkspaceAdminInput>;
