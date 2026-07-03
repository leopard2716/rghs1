import { CircleUserRound, KeyRound, LogOut, UserRoundCog } from "lucide-react";

export function AccountMenu({
  email,
  onOpenProfile,
  onRecoverPassword,
  onSignOut
}: {
  email?: string;
  onOpenProfile?: () => void;
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
        {onOpenProfile ? (
          <button type="button" onClick={onOpenProfile}>
            <UserRoundCog aria-hidden="true" />
            Profile
          </button>
        ) : null}
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
