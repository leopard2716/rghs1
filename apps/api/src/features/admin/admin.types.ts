export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
  deletion_requested_at: string | null;
  deletion_scheduled_at: string | null;
  deletion_requested_by: string | null;
};

export type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  auth_user_id: string;
  display_name: string;
  email: string;
  status: "active" | "invited" | "pending" | "rejected" | "disabled";
  created_at: string;
};

export type WorkspaceRoleRow = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  system: boolean;
};

export type WorkspaceMemberRoleRow = {
  workspace_id: string;
  member_id: string;
  role_id: string;
};

export type WorkspaceMemberOnboardingRow = {
  workspace_id: string;
  member_id: string;
  temp_password_hash: string | null;
  temp_password_expires_at: string | null;
  requires_password_change: boolean;
  password_changed_at: string | null;
};

export type ApplicationRow = {
  workspace_id: string;
  status: string;
  created_at: string;
};

export type InterviewRow = {
  workspace_id: string;
  status: string;
  created_at: string;
};

export type AlertRow = {
  workspace_id: string;
  severity: "info" | "warning" | "critical";
  read: boolean;
  due_at: string | null;
};

export type AuditLogRow = {
  workspace_id: string | null;
  created_at: string;
};
