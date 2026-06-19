import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { FormEvent } from "react";
import { PasswordInput } from "../../components/shared/PasswordInput";
import { errorMessage } from "../../errors";
import {
  clearStoredSession,
  requestPasswordRecovery,
  signOut,
  updateAuthenticatedPassword,
  type AuthSession
} from "../../services/auth.service";
import { fieldValue } from "../../utils/form";
import { MfaGate } from "../setup/MfaGate";

export function PasswordRecoveryPage({
  session,
  recoveryError,
  onSessionChange,
  onSessionCleared,
  onNavigate
}: {
  session: AuthSession | null;
  recoveryError?: string | null;
  onSessionChange: (session: AuthSession) => void;
  onSessionCleared: () => void;
  onNavigate: (path: string) => void;
}) {
  const returnPath = recoveryReturnPath();

  if (session?.flow === "recovery") {
    return (
      <MfaGate
        session={session}
        onVerified={onSessionChange}
        onSignOut={() => {
          clearStoredSession();
          onSessionCleared();
        }}
      >
        <SetRecoveredPassword
          session={session}
          onComplete={() => {
            onSessionCleared();
            onNavigate(returnPath);
          }}
        />
      </MfaGate>
    );
  }

  return (
    <RequestRecoveryEmail
      initialEmail={session?.user.email}
      recoveryError={recoveryError}
      onBack={() => onNavigate(returnPath)}
    />
  );
}

function RequestRecoveryEmail({
  initialEmail,
  recoveryError,
  onBack
}: {
  initialEmail?: string;
  recoveryError?: string | null;
  onBack: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (email: string) =>
      requestPasswordRecovery(
        email,
        `${window.location.origin}${window.location.pathname}${window.location.search}`
      )
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(fieldValue(new FormData(event.currentTarget), "email"));
  }

  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="recovery-request-title">
        <div className="metric-icon">
          <Mail aria-hidden="true" />
        </div>
        <p className="eyebrow">Account recovery</p>
        <h2 id="recovery-request-title">Reset your password</h2>
        <p>Enter your account email. Supabase will send a secure recovery link.</p>
        <form className="modal-form admin-create-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={initialEmail}
            />
          </label>
          {recoveryError ? <p className="form-error">{recoveryError}</p> : null}
          {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
          {mutation.isSuccess ? (
            <p className="form-success">Recovery email sent. Open the newest link in your inbox.</p>
          ) : null}
          <div className="modal-actions">
            <button className="primary-action" type="submit" disabled={mutation.isPending}>
              <Mail aria-hidden="true" />
              {mutation.isPending ? "Sending" : "Send recovery link"}
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

function SetRecoveredPassword({
  session,
  onComplete
}: {
  session: AuthSession;
  onComplete: () => void;
}) {
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
      await signOut(session).catch(() => clearStoredSession());
    },
    onSuccess: onComplete
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
      <section className="setup-panel" aria-labelledby="recovery-password-title">
        <div className="metric-icon">
          <KeyRound aria-hidden="true" />
        </div>
        <p className="eyebrow">Account recovery</p>
        <h2 id="recovery-password-title">Choose a new password</h2>
        <p>MFA is verified. Set a new password to finish recovering your account.</p>
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
            {mutation.isPending ? "Saving" : "Set new password"}
          </button>
        </form>
      </section>
    </div>
  );
}

function recoveryReturnPath(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/recover")) {
    return "/";
  }

  return value;
}
