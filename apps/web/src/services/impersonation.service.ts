import { paths } from "../routing/paths";
import type { AuthSession } from "./auth.service";
import { apiBaseUrl, authenticatedApiFetch, parseJson } from "./http";

type Impersonation = { id: string; displayName: string; expiresAt: string };

function key(session: AuthSession, slug: string) {
  return `rghs1.impersonation.${session.user.id}.${slug}`;
}

export function currentImpersonation(session: AuthSession, slug: string): Impersonation | null {
  return JSON.parse(window.sessionStorage.getItem(key(session, slug)) ?? "null");
}

export async function impersonateBidder(session: AuthSession, slug: string, memberId: string) {
  const result = await parseJson<Impersonation>(
    await authenticatedApiFetch(
      session,
      `${apiBaseUrl}/v1/workspaces/${slug}/admin/members/${memberId}/impersonate`,
      { method: "POST" }
    )
  );
  window.sessionStorage.setItem(key(session, slug), JSON.stringify(result));
  // Start with a fresh query cache and discard in-flight admin requests.
  window.location.replace(paths.workspaceBids(slug));
}

export async function endImpersonation(session: AuthSession, slug: string, id: string) {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/impersonations/${id}`,
    { method: "DELETE" }
  );
  if (!response.ok) await parseJson(response);
  window.sessionStorage.removeItem(key(session, slug));
  window.location.replace(paths.workspaceUsers(slug));
}
