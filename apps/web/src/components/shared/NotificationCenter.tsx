import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  LoaderCircle,
  TriangleAlert
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../errors";
import type { AuthSession } from "../../services/auth.service";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type AppNotification,
  type NotificationPriority,
  type NotificationScope
} from "../../services/notification.service";
import { displayDate } from "../../utils/datetime";

export function NotificationCenter({
  session,
  scope
}: {
  session: AuthSession;
  scope: NotificationScope;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [liveNotifications, setLiveNotifications] = useState<AppNotification[]>([]);
  const workspaceSlug = "workspaceSlug" in scope ? scope.workspaceSlug : null;
  const workspaceId = "workspaceId" in scope ? scope.workspaceId : null;
  const notificationScope = "scope" in scope ? scope.scope : "workspace";
  const queryKey = ["notifications", session.user.id, notificationScope, workspaceSlug];
  const notificationsQuery = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(session, scope),
    refetchInterval: 60_000
  });
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(session, notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey })
  });
  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(session, scope),
    onSuccess: () => queryClient.invalidateQueries({ queryKey })
  });

  useEffect(
    () =>
      subscribeToNotifications(session, (notification) => {
        if (!matchesScope(notification, notificationScope, workspaceId)) {
          return;
        }
        setLiveNotifications((current) => [notification, ...current].slice(0, 3));
        void queryClient.invalidateQueries();
        window.setTimeout(() => {
          setLiveNotifications((current) => current.filter((item) => item.id !== notification.id));
        }, 7000);
      }),
    [notificationScope, queryClient, session, workspaceId]
  );

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  function openNotification(notification: AppNotification) {
    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  }

  return (
    <>
      <details className="notification-center">
        <summary className="icon-button" aria-label="Open notifications" title="Notifications">
          <Bell aria-hidden="true" />
          {unreadCount ? (
            <span className="notification-badge">{Math.min(unreadCount, 99)}</span>
          ) : null}
        </summary>
        <div className="notification-popover">
          <header>
            <div>
              <strong>Notifications</strong>
              <span>{unreadCount} unread</span>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Mark all read"
              aria-label="Mark all notifications read"
              disabled={!unreadCount || markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              <CheckCheck aria-hidden="true" />
            </button>
          </header>
          <div className="notification-list">
            {notificationsQuery.isLoading ? (
              <div className="notification-empty">
                <LoaderCircle className="spin-icon" aria-hidden="true" />
                <span>Loading notifications</span>
              </div>
            ) : notificationsQuery.isError ? (
              <div className="notification-empty form-error">
                {errorMessage(notificationsQuery.error)}
              </div>
            ) : notifications.length ? (
              notifications.map((notification) => (
                <button
                  className={`notification-card priority-${notification.priority}${
                    notification.readAt ? " read" : ""
                  }`}
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                >
                  <PriorityIcon priority={notification.priority} />
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.message}</small>
                    <time dateTime={notification.createdAt}>
                      {displayDate(notification.createdAt)}
                    </time>
                  </span>
                </button>
              ))
            ) : (
              <div className="notification-empty">No notifications.</div>
            )}
          </div>
        </div>
      </details>
      {liveNotifications.length ? (
        <div className="notification-toast-stack" aria-live="polite">
          {liveNotifications.map((notification) => (
            <button
              className={`notification-toast priority-${notification.priority}`}
              type="button"
              key={notification.id}
              onClick={() => openNotification(notification)}
            >
              <PriorityIcon priority={notification.priority} />
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.message}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function PriorityIcon({ priority }: { priority: NotificationPriority }) {
  if (priority === "critical" || priority === "warning") {
    return <TriangleAlert aria-hidden="true" />;
  }
  if (priority === "error") {
    return <CircleX aria-hidden="true" />;
  }
  if (priority === "success") {
    return <CircleCheck aria-hidden="true" />;
  }
  if (priority === "info") {
    return <Info aria-hidden="true" />;
  }
  return <CircleAlert aria-hidden="true" />;
}

function matchesScope(
  notification: AppNotification,
  scope: "admin" | "workspace",
  workspaceId: string | null
): boolean {
  return scope === "admin"
    ? notification.scope === "admin"
    : notification.scope === "workspace" && notification.workspaceId === workspaceId;
}
