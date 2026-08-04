import type { AuthSession } from "./auth.service";
import { apiBaseUrl, authenticatedApiFetch, parseJson } from "./http";

export type ApplyAssistantToken = {
  tokenId: string;
  token: string;
  workspaceId: string;
  memberId: string;
  defaultProfileId: string | null;
  defaultJobMarketId: string | null;
  scopes: string[];
  expiresAt: string;
};

export type ApplyAssistantTokenSummary = Omit<ApplyAssistantToken, "token"> & {
  lastUsedAt: string | null;
  createdAt: string;
};

export type ApplyAssistantExtensionTokenPackageInput = {
  token: ApplyAssistantToken;
  authUser: {
    id: string;
    email?: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  member: {
    id: string;
    email: string;
    displayName: string;
  };
  profile?: {
    id: string;
    name: string;
  } | null;
  jobMarket?: {
    id: string;
    name: string;
    system: boolean;
  } | null;
};

type ConnectionCodeResponse = {
  codeId: string;
  code: string;
  workspaceId: string;
  memberId: string;
  scopes: string[];
  expiresAt: string;
};

function authHeaders(): HeadersInit {
  return {
    "content-type": "application/json"
  };
}

export async function fetchApplyAssistantTokens(
  session: AuthSession,
  slug: string
): Promise<{ tokens: ApplyAssistantTokenSummary[] }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${encodeURIComponent(slug)}/apply-assistant/tokens`,
    { headers: authHeaders() }
  );

  return parseJson<{ tokens: ApplyAssistantTokenSummary[] }>(response);
}

export async function generateApplyAssistantToken(
  session: AuthSession,
  slug: string,
  defaults: {
    profileId?: string;
    jobMarketId?: string;
  } = {}
): Promise<ApplyAssistantToken> {
  const codeResponse = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${encodeURIComponent(slug)}/apply-assistant/connect`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({})
    }
  );
  const connection = await parseJson<ConnectionCodeResponse>(codeResponse);

  const tokenResponse = await fetch(
    `${apiBaseUrl}/v1/workspaces/${encodeURIComponent(slug)}/apply-assistant/token`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        code: connection.code,
        profileId: defaults.profileId,
        jobMarketId: defaults.jobMarketId
      })
    }
  );

  return parseJson<ApplyAssistantToken>(tokenResponse);
}

export function encodeApplyAssistantExtensionToken({
  authUser,
  jobMarket,
  member,
  profile,
  token,
  workspace
}: ApplyAssistantExtensionTokenPackageInput): string {
  const payload = {
    version: 1,
    apiBaseUrl,
    token: token.token,
    tokenId: token.tokenId,
    workspace,
    member: {
      ...member,
      authUserId: authUser.id,
      email: member.email || authUser.email || ""
    },
    profile: profile ?? undefined,
    jobMarket: jobMarket ?? undefined,
    issuedAt: new Date().toISOString()
  };

  return `rghs1-apply.${base64UrlEncode(JSON.stringify(payload))}`;
}

export async function revokeApplyAssistantToken(
  session: AuthSession,
  slug: string,
  tokenId: string
): Promise<{ ok: boolean; tokenId: string; revokedAt: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${encodeURIComponent(
      slug
    )}/apply-assistant/token/${encodeURIComponent(tokenId)}`,
    {
      method: "DELETE",
      headers: authHeaders()
    }
  );

  return parseJson<{ ok: boolean; tokenId: string; revokedAt: string }>(response);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
