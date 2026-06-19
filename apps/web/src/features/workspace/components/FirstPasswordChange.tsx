import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { FormEvent } from "react";
import { PasswordInput } from "../../../components/shared/PasswordInput";
import { updateAuthenticatedPassword, type AuthSession } from "../../../services/auth.service";
import { completeWorkspacePasswordChange } from "../../../services/workspace.service";
import { errorMessage } from "../../../errors";
import { fieldValue } from "../../../utils/form";

export function FirstPasswordChange({
  session,
  workspaceSlug
}: {
  session: AuthSession;
  workspaceSlug: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({
      password,
      confirmPassword
    }: {
      password: string;
      confirmPassword: string;
    }) => {
      if (password.length < 12) {
        throw new Error("Use at least 12 characters.");
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      await updateAuthenticatedPassword(session, password);
      await completeWorkspacePasswordChange(session, workspaceSlug);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-session", workspaceSlug] });
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      password: fieldValue(form, "password"),
      confirmPassword: fieldValue(form, "confirmPassword")
    });
  }

  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="password-change-title">
        <div className="metric-icon">
          <KeyRound aria-hidden="true" />
        </div>
        <p className="eyebrow">First sign in</p>
        <h2 id="password-change-title">Set your password</h2>
        <p>
          Your temporary password expires after first use. Choose a new password before opening the
          workspace.
        </p>
        <form className="modal-form admin-create-form" onSubmit={handleSubmit}>
          <label>
            New password
            <PasswordInput name="password" required minLength={12} autoComplete="new-password" />
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
          {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
          <button className="primary-action" type="submit" disabled={mutation.isPending}>
            <ShieldCheck aria-hidden="true" />
            {mutation.isPending ? "Saving" : "Save password"}
          </button>
        </form>
      </section>
    </div>
  );
}
