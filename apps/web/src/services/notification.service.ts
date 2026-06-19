import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { AuthSession } from "./auth.service";
import { apiBaseUrl, authenticatedApiFetch, parseJson } from "./http";

export type NotificationPriority = "critical" | "error" | "warning" | "info" | "success";

export type AppNotification = {
  id: string;
  workspaceId: string | null;
  scope: "admin" | "workspace";
  priority: NotificationPriority;
  eventType: string;
  title: string;
  message: string;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export type NotificationsResponse = {
  unreadCount: number;
  notifications: AppNotification[];
};

export type NotificationScope = { scope: "admin" } | { workspaceSlug: string; workspaceId: string };

export async function fetchNotifications(
  session: AuthSession,
  scope: NotificationScope
): Promise<NotificationsResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/notifications${scopeQuery(scope)}`
  );
  return parseJson<NotificationsResponse>(response);
}

export async function markNotificationRead(session: AuthSession, notificationId: string) {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/notifications/${notificationId}/read`,
    { method: "PATCH" }
  );
  return parseJson<{ ok: boolean; notificationId: string }>(response);
}

export async function markAllNotificationsRead(session: AuthSession, scope: NotificationScope) {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/notifications/read-all${scopeQuery(scope)}`,
    { method: "POST" }
  );
  return parseJson<{ ok: boolean }>(response);
}

let realtimeClient: ReturnType<typeof createClient> | null = null;

export function subscribeToNotifications(
  session: AuthSession,
  onNotification: (notification: AppNotification) => void
): () => void {
  const client = notificationRealtimeClient();
  client.realtime.setAuth(session.accessToken);
  const channel: RealtimeChannel = client
    .channel(`notifications:${session.user.id}:${session.scope}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_auth_user_id=eq.${session.user.id}`
      },
      (payload) => {
        onNotification(notificationFromRealtime(payload.new));
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

function notificationRealtimeClient() {
  if (realtimeClient) {
    return realtimeClient;
  }
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.");
  }
  realtimeClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  return realtimeClient;
}

function notificationFromRealtime(value: Record<string, unknown>): AppNotification {
  return {
    id: String(value.id),
    workspaceId: value.workspace_id ? String(value.workspace_id) : null,
    scope: value.scope === "admin" ? "admin" : "workspace",
    priority: priority(value.priority),
    eventType: String(value.event_type ?? ""),
    title: String(value.title ?? "Notification"),
    message: String(value.message ?? ""),
    actionUrl: value.action_url ? String(value.action_url) : null,
    entityType: value.entity_type ? String(value.entity_type) : null,
    entityId: value.entity_id ? String(value.entity_id) : null,
    metadata:
      value.metadata && typeof value.metadata === "object"
        ? (value.metadata as Record<string, unknown>)
        : {},
    createdAt: String(value.created_at ?? new Date().toISOString()),
    readAt: value.read_at ? String(value.read_at) : null
  };
}

function priority(value: unknown): NotificationPriority {
  return value === "critical" || value === "error" || value === "warning" || value === "success"
    ? value
    : "info";
}

function scopeQuery(scope: NotificationScope): string {
  const params = new URLSearchParams(
    "scope" in scope ? { scope: scope.scope } : { workspaceSlug: scope.workspaceSlug }
  );
  return `?${params.toString()}`;
}
