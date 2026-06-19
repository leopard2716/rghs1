import { CircleUserRound, KeyRound, LogOut } from "lucide-react";

export function AccountMenu({
  email,
  onRecoverPassword,
  onSignOut
}: {
  email?: string;
  onRecoverPassword: () => void;
  onSignOut: () => void;
}) {
  return (
    <details className="account-menu">
      <summary className="icon-button" aria-label="Open account menu" title="Account">
        <CircleUserRound aria-hidden="true" />
      </summary>
      <div className="account-menu-popover">
        <span>{email ?? "Signed in"}</span>
        <button type="button" onClick={onRecoverPassword}>
          <KeyRound aria-hidden="true" />
          Password recovery
        </button>
        <button type="button" onClick={onSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </button>
      </div>
    </details>
  );
}
