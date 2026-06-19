import type { AuthSession } from "./auth.service";
import { apiBaseUrl, authenticatedApiFetch, parseJson } from "./http";

export type AdminWorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  health: "healthy" | "attention" | "suspended" | "archived" | "deleting";
  createdAt: string;
  urlPath: string;
  deletedAt: string | null;
  deletion: {
    requestedAt: string | null;
    scheduledAt: string | null;
    requestedBy: string | null;
  };
  users: {
    total: number;
    active: number;
    invited: number;
    pending: number;
    rejected: number;
    disabled: number;
    admins: number;
  };
  dates: {
    createdAt: string;
    latestAt: string | null;
  };
};

export type AdminOverview = {
  platform: {
    totalWorkspaces: number;
    healthyWorkspaces: number;
    attentionWorkspaces: number;
    suspendedWorkspaces: number;
    totalUsers: number;
    activeUsers: number;
    workspacesWithoutAdmin: number;
    deletingWorkspaces: number;
    purgedExpiredWorkspaces: number;
    tenantDeletionAvailable: boolean;
  };
  workspaces: AdminWorkspaceSummary[];
};

export type CreateWorkspaceInput = {
  name: string;
  slug: string;
};

export type CreateWorkspaceResponse = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    status: string;
    createdAt: string;
    urlPath: string;
  };
};

export type AssignWorkspaceAdminInput = {
  email: string;
  displayName?: string;
};

export type AssignWorkspaceAdminResponse = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    urlPath: string;
  };
  member: {
    id: string;
    email: string;
    displayName: string;
    status: string;
  };
  temporaryPassword: string | null;
  requiresPasswordChange: boolean;
  expiresAt: string | null;
};

export type WorkspaceDeletionResponse = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    urlPath: string;
    deletedAt: string | null;
    deletionRequestedAt: string | null;
    deletionScheduledAt: string | null;
  };
};

function authHeaders(): HeadersInit {
  return {
    "content-type": "application/json"
  };
}

export async function fetchAdminOverview(session: AuthSession): Promise<AdminOverview> {
  const response = await authenticatedApiFetch(session, `${apiBaseUrl}/v1/admin/overview`, {
    headers: authHeaders()
  });

  return parseJson<AdminOverview>(response);
}

export async function createAdminWorkspace(
  session: AuthSession,
  input: CreateWorkspaceInput
): Promise<CreateWorkspaceResponse> {
  const response = await authenticatedApiFetch(session, `${apiBaseUrl}/v1/admin/workspaces`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input)
  });

  return parseJson<CreateWorkspaceResponse>(response);
}

export async function assignWorkspaceAdmin(
  session: AuthSession,
  workspaceId: string,
  input: AssignWorkspaceAdminInput
): Promise<AssignWorkspaceAdminResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/admin/workspaces/${workspaceId}/admins`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );

  return parseJson<AssignWorkspaceAdminResponse>(response);
}

export async function requestWorkspaceDeletion(
  session: AuthSession,
  workspaceId: string
): Promise<WorkspaceDeletionResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/admin/workspaces/${workspaceId}/deletion`,
    {
      method: "POST",
      headers: authHeaders()
    }
  );

  return parseJson<WorkspaceDeletionResponse>(response);
}

export async function cancelWorkspaceDeletion(
  session: AuthSession,
  workspaceId: string
): Promise<WorkspaceDeletionResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/admin/workspaces/${workspaceId}/deletion/cancel`,
    {
      method: "POST",
      headers: authHeaders()
    }
  );

  return parseJson<WorkspaceDeletionResponse>(response);
}
