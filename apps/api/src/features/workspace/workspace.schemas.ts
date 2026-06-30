import { z } from "zod";

export const workspaceRegistrationInput = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(2).max(120)
});

export const workspaceMemberStatusInput = z.object({
  status: z.enum(["active", "rejected", "disabled"])
});

export const workspaceMemberRolesInput = z.object({
  roleKeys: z
    .array(z.enum(["bidder", "interviewer", "payment_manager"]))
    .max(3)
    .transform((roleKeys) => [...new Set(roleKeys)])
});

export type WorkspaceRegistrationInput = z.infer<typeof workspaceRegistrationInput>;
export type WorkspaceMemberStatusInput = z.infer<typeof workspaceMemberStatusInput>;
export type WorkspaceMemberRolesInput = z.infer<typeof workspaceMemberRolesInput>;

export const applicationInput = z.object({
  workspaceId: z.string().min(1),
  profileId: z.string().min(1),
  marketId: z.string().min(1),
  resumeId: z.string().min(1).optional(),
  jobTitle: z.string().min(2).max(160),
  companyName: z.string().min(2).max(160),
  jobLink: z.string().url(),
  appliedAt: z.string().datetime().optional()
});

export const interviewInput = z.object({
  workspaceId: z.string().min(1),
  applicationId: z.string().min(1),
  profileId: z.string().min(1),
  interviewType: z.enum(["initial", "hr", "technical", "final", "client", "custom"]),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional()
});

export type ApplicationInput = z.infer<typeof applicationInput>;
export type InterviewInput = z.infer<typeof interviewInput>;
