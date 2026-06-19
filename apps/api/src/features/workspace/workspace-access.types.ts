export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  created_at: string;
};

export type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  auth_user_id: string;
  display_name: string;
  email: string;
  status: "active" | "invited" | "pending" | "rejected" | "disabled";
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type WorkspaceRoleRow = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  system: boolean;
  deleted_at?: string | null;
};

export type WorkspaceMemberRoleRow = {
  workspace_id: string;
  member_id: string;
  role_id: string;
};

export type WorkspaceMemberOnboardingRow = {
  workspace_id: string;
  member_id: string;
  requires_password_change: boolean;
  temp_password_expires_at: string | null;
  password_changed_at: string | null;
};
