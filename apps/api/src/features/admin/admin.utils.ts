import type { WorkspaceRow } from "./admin.types";

export function titleCaseRole(key: string): string {
  return key
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function defaultMarketRows(workspaceId: string, actorId: string, names?: string[]) {
  const marketNames = names?.length
    ? names
    : [
        "Remote Global",
        "US Job Market",
        "EU Job Market",
        "Philippines Job Market",
        "Japan Job Market"
      ];

  return marketNames.map((name) => ({
    workspace_id: workspaceId,
    name,
    is_global: name.toLowerCase().includes("global"),
    is_active: true,
    created_by: actorId
  }));
}

export function tenantUrlPath(slug: string): string {
  return `/${slug}`;
}

export function workspaceHealth(
  workspace: WorkspaceRow,
  activeAdmins: number
): "healthy" | "attention" | "suspended" | "archived" | "deleting" {
  if (workspace.deleted_at) {
    return "deleting";
  }

  if (workspace.status === "archived") {
    return "archived";
  }

  if (workspace.status === "suspended") {
    return "suspended";
  }

  if (activeAdmins === 0) {
    return "attention";
  }

  return "healthy";
}
