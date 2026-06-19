import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export function PanelHeader({
  icon,
  title,
  actionLabel,
  onAction
}: {
  icon: ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-header">
      <div>
        {icon}
        <h3>{title}</h3>
      </div>
      {actionLabel && onAction ? (
        <button className="icon-text-button" type="button" onClick={onAction}>
          <Plus aria-hidden="true" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
