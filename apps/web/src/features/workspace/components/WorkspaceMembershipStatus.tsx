import { Clock3, LogOut, ShieldX } from "lucide-react";
import type { WorkspaceMembership } from "../../../services/workspace.service";

export function WorkspaceMembershipStatus({
  workspaceSession,
  onSignOut
}: {
  workspaceSession: WorkspaceMembership;
  onSignOut: () => void;
}) {
  const pending = workspaceSession.accessState === "pending";
  const title = pending
    ? "Approval pending"
    : workspaceSession.accessState === "rejected"
      ? "Registration denied"
      : "Workspace account disabled";
  const detail = pending
    ? "A workspace admin must approve your account and assign your roles before you can enter."
    : workspaceSession.accessState === "rejected"
      ? "A workspace admin denied this registration. Contact the workspace team if this was unexpected."
      : "This account cannot currently access the workspace. Contact a workspace admin.";

  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="membership-status-title">
        <div className="metric-icon">
          {pending ? <Clock3 aria-hidden="true" /> : <ShieldX aria-hidden="true" />}
        </div>
        <p className="eyebrow">{workspaceSession.workspace.name}</p>
        <h2 id="membership-status-title">{title}</h2>
        <p>{detail}</p>
        <button className="secondary-action" type="button" onClick={onSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </button>
      </section>
    </div>
  );
}
