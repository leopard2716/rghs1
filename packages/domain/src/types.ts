export type UUID = string;

export type WorkspaceStatus = "active" | "suspended" | "archived";

export type Workspace = {
  id: UUID;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  createdAt: string;
};

export type Permission =
  | "workspace:manage"
  | "member:invite"
  | "member:manage"
  | "role:manage"
  | "profile:create"
  | "profile:update"
  | "resume:upload"
  | "application:create"
  | "application:update"
  | "interview:create"
  | "interview:update"
  | "job_record:create"
  | "job_record:update"
  | "payment:create"
  | "payment:update"
  | "payment:pay"
  | "alert:manage"
  | "audit:view"
  | "global:tenant.view"
  | "global:tenant.manage";

export type WorkspaceRole = {
  id: UUID;
  workspaceId: UUID;
  name: string;
  key: string;
  permissions: Permission[];
  system: boolean;
};

export type WorkspaceMember = {
  id: UUID;
  workspaceId: UUID;
  authUserId: UUID;
  displayName: string;
  email: string;
  roleKeys: string[];
  status: "active" | "invited" | "pending" | "rejected" | "disabled";
};

export type JobMarket = {
  id: UUID;
  workspaceId: UUID;
  name: string;
  countryCode?: string;
  region?: string;
  timezone?: string;
  isGlobal: boolean;
  isActive: boolean;
};

export type Profile = {
  id: UUID;
  workspaceId: UUID;
  displayName: string;
  headline: string;
  defaultMarketId?: UUID;
  createdByMemberId: UUID;
};

export type ResumeSource =
  | {
      type: "link";
      url: string;
    }
  | {
      type: "file";
      fileId: UUID;
    };

export type Resume = {
  id: UUID;
  workspaceId: UUID;
  profileId: UUID;
  label: string;
  version: number;
  source: ResumeSource;
  createdByMemberId: UUID;
  createdAt: string;
};

export type JobApplicationStatus =
  | "saved"
  | "applied"
  | "interview_requested"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "archived";

export type JobApplication = {
  id: UUID;
  workspaceId: UUID;
  profileId: UUID;
  marketId: UUID;
  resumeId?: UUID;
  jobTitle: string;
  companyName: string;
  jobLink: string;
  status: JobApplicationStatus;
  appliedAt?: string;
  createdByMemberId: UUID;
  createdAt: string;
};

export type InterviewType = "initial" | "hr" | "technical" | "final" | "client" | "custom";

export type Interview = {
  id: UUID;
  workspaceId: UUID;
  applicationId: UUID;
  profileId: UUID;
  interviewType: InterviewType;
  scheduledAt?: string;
  status: "requested" | "scheduled" | "completed" | "cancelled";
  notes?: string;
  createdByMemberId: UUID;
  createdAt: string;
};

export type Alert = {
  id: UUID;
  workspaceId: UUID;
  title: string;
  severity: "info" | "warning" | "critical";
  dueAt?: string;
  read: boolean;
};

export type AuditEvent = {
  id: UUID;
  workspaceId?: UUID;
  actorMemberId?: UUID;
  actorAuthId?: UUID;
  action: string;
  targetType: string;
  targetId?: UUID;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  workspace: Workspace;
  roles: WorkspaceRole[];
  members: WorkspaceMember[];
  markets: JobMarket[];
  profiles: Profile[];
  resumes: Resume[];
  applications: JobApplication[];
  interviews: Interview[];
  alerts: Alert[];
  auditEvents: AuditEvent[];
};
