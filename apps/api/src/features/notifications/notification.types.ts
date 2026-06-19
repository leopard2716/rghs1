export type NotificationPriority = "critical" | "error" | "warning" | "info" | "success";

export type NotificationRow = {
  id: string;
  recipient_auth_user_id: string;
  workspace_id: string | null;
  scope: "admin" | "workspace";
  priority: NotificationPriority;
  event_type: string;
  title: string;
  message: string;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};
