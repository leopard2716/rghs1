import { useMutation } from "@tanstack/react-query";
import { BriefcaseBusiness, Globe2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent } from "react";
import { PasswordInput } from "../../../components/shared/PasswordInput";
import {
  signInWithPassword,
  workspaceAuthScope,
  type AuthSession
} from "../../../services/auth.service";
import type { PublicWorkspace } from "../../../services/workspace.service";
import { errorMessage } from "../../../errors";
import { fieldValue } from "../../../utils/form";

export function WorkspaceLandingPage({
  workspace,
  onAuthenticated,
  onRecoverPassword,
  onRegister
}: {
  workspace: PublicWorkspace["workspace"];
  onAuthenticated: (session: AuthSession) => void;
  onRecoverPassword: () => void;
  onRegister: () => void;
}) {
  const credentialMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithPassword(email, password, workspaceAuthScope(workspace.slug)),
    onSuccess: onAuthenticated
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextEmail = fieldValue(form, "email");
    credentialMutation.mutate({
      email: nextEmail,
      password: fieldValue(form, "password")
    });
  }

  return (
    <div className="workspace-login-page">
      <section className="workspace-login-hero">
        <div>
          <p className="eyebrow">RGHS1 workspace</p>
          <h1>{workspace.name}</h1>
          <p>
            Track profiles, resumes, applications, interviews, and team follow-up inside a private
            workspace.
          </p>
          <div className="hero-actions">
            <span className="runtime-pill">
              <Globe2 aria-hidden="true" />
              {workspace.slug}
            </span>
            <span className="runtime-pill">
              <BriefcaseBusiness aria-hidden="true" />
              Bid operations
            </span>
          </div>
        </div>
      </section>

      <section className="workspace-login-panel" aria-labelledby="workspace-login-title">
        <div className="brand-mark">
          <ShieldCheck aria-hidden="true" />
          <span>RGHS1</span>
        </div>
        <h2 id="workspace-login-title">Sign in</h2>
        <form className="modal-form admin-login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <PasswordInput name="password" required autoComplete="current-password" />
          </label>
          <button className="text-action" type="button" onClick={onRecoverPassword}>
            Forgot password?
          </button>
          {credentialMutation.error ? (
            <p className="form-error">{errorMessage(credentialMutation.error)}</p>
          ) : null}
          <button className="primary-action" type="submit" disabled={credentialMutation.isPending}>
            <LogIn aria-hidden="true" />
            {credentialMutation.isPending ? "Signing in" : "Sign in"}
          </button>
          <button className="secondary-action" type="button" onClick={onRegister}>
            <UserPlus aria-hidden="true" />
            Create account
          </button>
        </form>
      </section>
    </div>
  );
}
