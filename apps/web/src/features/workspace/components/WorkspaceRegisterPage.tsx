import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent } from "react";
import { PasswordInput } from "../../../components/shared/PasswordInput";
import { errorMessage } from "../../../errors";
import {
  clearStoredSession,
  signUpWithPassword,
  signOut,
  workspaceAuthScope,
  type AuthSession
} from "../../../services/auth.service";
import { registerWorkspaceMember, type PublicWorkspace } from "../../../services/workspace.service";
import { fieldValue } from "../../../utils/form";

export function WorkspaceRegisterPage({
  workspace,
  session,
  onRegistered,
  onBack
}: {
  workspace: PublicWorkspace["workspace"];
  session?: AuthSession | null;
  onRegistered: () => void;
  onBack: () => void;
}) {
  const mutation = useMutation({
    mutationFn: async ({
      displayName,
      email,
      password,
      confirmPassword
    }: {
      displayName: string;
      email: string;
      password: string;
      confirmPassword: string;
    }) => {
      if (!session && password.length < 12) {
        throw new Error("Use at least 12 characters.");
      }

      if (!session && password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      const registrationSession =
        session ??
        (await signUpWithPassword(
          email,
          password,
          `${window.location.origin}/${workspace.slug}`,
          displayName,
          workspaceAuthScope(workspace.slug)
        ));
      const registrationEmail = registrationSession.user.email ?? email;
      if (!registrationEmail) {
        throw new Error("The signed-in account does not have an email address.");
      }

      await registerWorkspaceMember(
        workspace.slug,
        {
          email: registrationEmail,
          displayName
        },
        registrationSession
      );

      await signOut(registrationSession).catch(() => clearStoredSession());
    },
    onSuccess: onRegistered
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      displayName: fieldValue(form, "displayName"),
      email: fieldValue(form, "email"),
      password: fieldValue(form, "password"),
      confirmPassword: fieldValue(form, "confirmPassword")
    });
  }

  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="workspace-register-title">
        <div className="metric-icon">
          <UserPlus aria-hidden="true" />
        </div>
        <p className="eyebrow">{workspace.name}</p>
        <h2 id="workspace-register-title">
          {session ? "Join this workspace" : "Create workspace account"}
        </h2>
        <p>
          {session
            ? "Register your signed-in account for workspace-admin approval."
            : "Your registration will require workspace-admin approval."}
        </p>
        <form className="modal-form admin-create-form" onSubmit={handleSubmit}>
          <label>
            Display name
            <input name="displayName" required minLength={2} maxLength={120} autoComplete="name" />
          </label>
          {session ? (
            <label>
              Email
              <input value={session.user.email ?? ""} readOnly />
            </label>
          ) : (
            <>
              <label>
                Email
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label>
                Password
                <PasswordInput
                  name="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm password
                <PasswordInput
                  name="confirmPassword"
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
          {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
          <div className="modal-actions">
            <button className="primary-action" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <LoaderCircle className="spin-icon" aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {mutation.isPending ? "Registering" : session ? "Join workspace" : "Register"}
            </button>
            <button className="secondary-action" type="button" onClick={onBack}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
