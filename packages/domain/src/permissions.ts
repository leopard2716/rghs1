import type { Permission, WorkspaceMember, WorkspaceRole } from "./types";

export const ALL_PERMISSIONS: Permission[] = [
  "workspace:manage",
  "member:invite",
  "member:manage",
  "role:manage",
  "profile:create",
  "profile:update",
  "resume:upload",
  "application:create",
  "application:update",
  "interview:create",
  "interview:update",
  "alert:manage",
  "audit:view",
  "global:tenant.view",
  "global:tenant.manage"
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    "workspace:manage",
    "member:invite",
    "member:manage",
    "role:manage",
    "profile:create",
    "profile:update",
    "resume:upload",
    "application:create",
    "application:update",
    "interview:create",
    "interview:update",
    "alert:manage",
    "audit:view"
  ],
  bidder: [
    "profile:create",
    "profile:update",
    "resume:upload",
    "application:create",
    "application:update"
  ],
  interviewer: ["interview:create", "interview:update", "application:update"]
};

export function permissionsForMember(
  member: WorkspaceMember,
  roles: WorkspaceRole[]
): Set<Permission> {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    if (role.workspaceId !== member.workspaceId || !member.roleKeys.includes(role.key)) {
      continue;
    }

    for (const permission of role.permissions) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export function can(
  member: WorkspaceMember,
  roles: WorkspaceRole[],
  permission: Permission
): boolean {
  if (member.status !== "active") {
    return false;
  }

  return permissionsForMember(member, roles).has(permission);
}
