import { useMutation } from "@tanstack/react-query";
import { LogIn, ShieldCheck } from "lucide-react";
import { FormEvent } from "react";
import { PasswordInput } from "../../../components/shared/PasswordInput";
import { signInWithPassword, type AuthSession } from "../../../services/auth.service";
import { errorMessage } from "../../../errors";
import { fieldValue } from "../../../utils/form";

export function GlobalAdminLogin({
  onAuthenticated,
  onBack,
  onRecoverPassword
}: {
  onAuthenticated: (session: AuthSession) => void;
  onBack: () => void;
  onRecoverPassword: () => void;
}) {
  const credentialMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithPassword(email, password, "admin"),
    onSuccess: onAuthenticated
  });

  function handleCredentialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = fieldValue(form, "email");
    credentialMutation.mutate({
      email,
      password: fieldValue(form, "password")
    });
  }

  return (
    <div className="admin-login-page">
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <button className="brand-button admin-brand" type="button" onClick={onBack}>
          <ShieldCheck aria-hidden="true" />
          <span>RGHS1</span>
        </button>
        <p className="eyebrow">RGHS1</p>
        <h1 id="admin-login-title">Sign in</h1>
        <form className="modal-form admin-login-form" onSubmit={handleCredentialSubmit}>
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
        </form>
      </section>
    </div>
  );
}
