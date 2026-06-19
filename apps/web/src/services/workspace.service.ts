import type { Interview, JobApplication } from "@rghs1/domain";
import type { AuthSession } from "./auth.service";
import { apiBaseUrl, authenticatedApiFetch, parseJson } from "./http";

export type CreateApplicationInput = {
  workspaceId: string;
  profileId: string;
  marketId: string;
  resumeId?: string;
  jobTitle: string;
  companyName: string;
  jobLink: string;
  appliedAt?: string;
};

export type CreateInterviewInput = {
  workspaceId: string;
  applicationId: string;
  profileId: string;
  interviewType: Interview["interviewType"];
  scheduledAt?: string;
  notes?: string;
};

export type PublicWorkspace = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    status: "active" | "suspended" | "archived";
    createdAt: string;
  };
};

export type WorkspaceSession = {
  workspace: PublicWorkspace["workspace"];
  member: {
    id: string;
    email: string;
    displayName: string;
    status: "active" | "invited" | "pending" | "rejected" | "disabled";
    roleKeys: string[];
  };
  accessState: "active" | "invited" | "pending" | "rejected" | "disabled";
  canAccess: boolean;
  requiresPasswordChange: boolean;
  temporaryPasswordExpiresAt: string | null;
};

export type WorkspaceMembership = {
  workspace: PublicWorkspace["workspace"];
  member: {
    id: string;
    email: string;
    displayName: string;
    status: "active" | "invited" | "pending" | "rejected" | "disabled";
  };
  accessState: "active" | "invited" | "pending" | "rejected" | "disabled";
  canAccess: boolean;
};

export type WorkspaceMemberSummary = {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "invited" | "pending" | "rejected" | "disabled";
  roleKeys: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMembersResponse = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  currentMemberId: string;
  roles: Array<{
    id: string;
    key: string;
    name: string;
    assignable: boolean;
  }>;
  members: WorkspaceMemberSummary[];
};

function authHeaders(): HeadersInit {
  return {
    "content-type": "application/json"
  };
}

export async function fetchPublicWorkspace(slug: string): Promise<PublicWorkspace> {
  const response = await fetch(`${apiBaseUrl}/v1/workspaces/by-slug/${slug}/public`);
  return parseJson<PublicWorkspace>(response);
}

export async function fetchWorkspaceSession(
  session: AuthSession,
  slug: string
): Promise<WorkspaceSession> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/session`,
    { headers: authHeaders() }
  );

  return parseJson<WorkspaceSession>(response);
}

export async function fetchWorkspaceMembership(
  session: AuthSession,
  slug: string
): Promise<WorkspaceMembership> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/membership`,
    { headers: authHeaders() }
  );

  return parseJson<WorkspaceMembership>(response);
}

export async function completeWorkspacePasswordChange(
  session: AuthSession,
  slug: string
): Promise<{ ok: boolean; passwordChangedAt: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/password-change-complete`,
    {
      method: "POST",
      headers: authHeaders()
    }
  );

  return parseJson<{ ok: boolean; passwordChangedAt: string }>(response);
}

export async function registerWorkspaceMember(
  slug: string,
  input: {
    email: string;
    displayName: string;
  },
  session: AuthSession
): Promise<{ member: WorkspaceMemberSummary; message: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/register`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );

  return parseJson<{ member: WorkspaceMemberSummary; message: string }>(response);
}

export async function fetchWorkspaceMembers(
  session: AuthSession,
  slug: string
): Promise<WorkspaceMembersResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/admin/members`,
    { headers: authHeaders() }
  );

  return parseJson<WorkspaceMembersResponse>(response);
}

export async function updateWorkspaceMemberStatus(
  session: AuthSession,
  slug: string,
  memberId: string,
  status: "active" | "rejected" | "disabled"
): Promise<{ member: WorkspaceMemberSummary }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/admin/members/${memberId}/status`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ status })
    }
  );

  return parseJson<{ member: WorkspaceMemberSummary }>(response);
}

export async function updateWorkspaceMemberRoles(
  session: AuthSession,
  slug: string,
  memberId: string,
  roleKeys: string[]
): Promise<{ member: WorkspaceMemberSummary }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/admin/members/${memberId}/roles`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ roleKeys })
    }
  );

  return parseJson<{ member: WorkspaceMemberSummary }>(response);
}

export async function deleteWorkspaceMember(
  session: AuthSession,
  slug: string,
  memberId: string
): Promise<{ ok: boolean; memberId: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/admin/members/${memberId}`,
    {
      method: "DELETE",
      headers: authHeaders()
    }
  );

  return parseJson<{ ok: boolean; memberId: string }>(response);
}

export async function createApplication(input: CreateApplicationInput): Promise<JobApplication> {
  const response = await fetch(`${apiBaseUrl}/v1/applications`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return parseJson<JobApplication>(response);
}

export async function createInterview(input: CreateInterviewInput): Promise<Interview> {
  const response = await fetch(`${apiBaseUrl}/v1/interviews`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return parseJson<Interview>(response);
}
