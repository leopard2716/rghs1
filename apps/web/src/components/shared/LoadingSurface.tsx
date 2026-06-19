import { Activity } from "lucide-react";

export function LoadingSurface({ label }: { label: string }) {
  return (
    <div className="loading-surface">
      <Activity className="spin-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
