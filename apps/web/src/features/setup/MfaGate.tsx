import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, KeyRound, LogOut, QrCode, ShieldCheck, TriangleAlert } from "lucide-react";
import { FormEvent, type ReactNode } from "react";
import {
  enrollTotpFactor,
  fetchMfaState,
  verifyTotpCode,
  type AuthSession,
  type MfaFactor
} from "../../services/auth.service";
import { errorMessage } from "../../errors";
import { fieldValue } from "../../utils/form";
import { createTotpQrCode } from "../../services/qr.service";

export function MfaGate({
  session,
  issuerUrl,
  onVerified,
  onSignOut,
  children
}: {
  session: AuthSession;
  issuerUrl?: string;
  onVerified: (session: AuthSession) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const tokenKey = session.accessToken.slice(-12);
  const mfaQuery = useQuery({
    queryKey: ["mfa-state", session.user.id, tokenKey],
    queryFn: () => fetchMfaState(session),
    retry: false
  });

  if (mfaQuery.isLoading) {
    return <MfaLoading />;
  }

  if (mfaQuery.isError || !mfaQuery.data) {
    return (
      <MfaErrorPanel
        message={mfaQuery.error ? errorMessage(mfaQuery.error) : "MFA state could not be checked."}
        onSignOut={onSignOut}
      />
    );
  }

  if (mfaQuery.data.status === "setup_required") {
    return (
      <MfaSetup
        session={session}
        issuerUrl={issuerUrl}
        onVerified={onVerified}
        onSignOut={onSignOut}
      />
    );
  }

  if (mfaQuery.data.status === "challenge_required") {
    return (
      <MfaChallenge
        session={session}
        factor={mfaQuery.data.verifiedTotpFactors[0]}
        onVerified={onVerified}
        onSignOut={onSignOut}
      />
    );
  }

  return <>{children}</>;
}

function MfaSetup({
  session,
  issuerUrl,
  onVerified,
  onSignOut
}: {
  session: AuthSession;
  issuerUrl?: string;
  onVerified: (session: AuthSession) => void;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const tokenKey = session.accessToken.slice(-12);
  const issuer = issuerUrl ?? mfaIssuerUrl();
  const enrollmentQuery = useQuery({
    queryKey: ["mfa-enrollment", session.user.id, tokenKey, issuer],
    queryFn: async () => {
      const enrollment = await enrollTotpFactor(session, issuer);
      const accountName = session.user.email;
      if (!accountName) {
        throw new Error("An email address is required for MFA enrollment.");
      }

      const generated = await createTotpQrCode({
        secret: enrollment.secret,
        issuer,
        accountName
      });

      return {
        ...enrollment,
        ...generated
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  const mutation = useMutation({
    mutationFn: async (code: string) => {
      if (!enrollmentQuery.data) {
        throw new Error("Authenticator enrollment is not ready.");
      }

      return verifyTotpCode(session, enrollmentQuery.data.factorId, normalizeTotpCode(code));
    },
    onSuccess: (updatedSession) => {
      void queryClient.invalidateQueries({ queryKey: ["mfa-state", session.user.id] });
      onVerified(updatedSession);
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate(fieldValue(form, "code"));
  }

  return (
    <div className="setup-page">
      <section className="setup-panel mfa-panel" aria-labelledby="mfa-setup-title">
        <div className="metric-icon">
          <QrCode aria-hidden="true" />
        </div>
        <p className="eyebrow">Account security</p>
        <h2 id="mfa-setup-title">Set up MFA</h2>
        <p>Scan the QR code with an authenticator app, then enter the 6-digit code.</p>

        {enrollmentQuery.isLoading ? (
          <div className="mfa-loading-inline">
            <Activity aria-hidden="true" />
            <span>Creating QR code</span>
          </div>
        ) : null}

        {enrollmentQuery.isError ? (
          <p className="form-error">{errorMessage(enrollmentQuery.error)}</p>
        ) : null}

        {enrollmentQuery.data ? (
          <>
            <dl className="mfa-account-details">
              <div>
                <dt>Issuer</dt>
                <dd>{issuer}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{session.user.email ?? "Email unavailable"}</dd>
              </div>
            </dl>
            <div className="mfa-qr-frame">
              <img src={qrImageSource(enrollmentQuery.data.qrCode)} alt="Authenticator QR code" />
            </div>
            <div className="mfa-secret">
              <span>Manual setup key</span>
              <code>{enrollmentQuery.data.secret}</code>
            </div>
          </>
        ) : null}

        <form className="modal-form admin-create-form" onSubmit={handleSubmit}>
          <label>
            Authenticator code
            <input
              name="code"
              inputMode="numeric"
              required
              minLength={6}
              maxLength={8}
              autoComplete="one-time-code"
            />
          </label>
          {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
          <div className="modal-actions">
            <button
              className="primary-action"
              type="submit"
              disabled={mutation.isPending || !enrollmentQuery.data}
            >
              <ShieldCheck aria-hidden="true" />
              {mutation.isPending ? "Verifying" : "Verify"}
            </button>
            <button className="secondary-action" type="button" onClick={onSignOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MfaChallenge({
  session,
  factor,
  onVerified,
  onSignOut
}: {
  session: AuthSession;
  factor?: MfaFactor;
  onVerified: (session: AuthSession) => void;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (code: string) => {
      if (!factor) {
        throw new Error("No verified authenticator factor was found.");
      }

      return verifyTotpCode(session, factor.id, normalizeTotpCode(code));
    },
    onSuccess: (updatedSession) => {
      void queryClient.invalidateQueries({ queryKey: ["mfa-state", session.user.id] });
      onVerified(updatedSession);
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate(fieldValue(form, "code"));
  }

  return (
    <div className="setup-page">
      <section className="setup-panel mfa-panel" aria-labelledby="mfa-challenge-title">
        <div className="metric-icon">
          <KeyRound aria-hidden="true" />
        </div>
        <p className="eyebrow">Account security</p>
        <h2 id="mfa-challenge-title">Verify MFA</h2>
        <p>Enter the current code from your authenticator app.</p>
        <form className="modal-form admin-create-form" onSubmit={handleSubmit}>
          <label>
            Authenticator code
            <input
              name="code"
              inputMode="numeric"
              required
              minLength={6}
              maxLength={8}
              autoComplete="one-time-code"
            />
          </label>
          {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
          <div className="modal-actions">
            <button
              className="primary-action"
              type="submit"
              disabled={mutation.isPending || !factor}
            >
              <ShieldCheck aria-hidden="true" />
              {mutation.isPending ? "Verifying" : "Verify"}
            </button>
            <button className="secondary-action" type="button" onClick={onSignOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MfaLoading() {
  return (
    <div className="loading-surface">
      <Activity aria-hidden="true" />
      <span>Checking MFA</span>
    </div>
  );
}

function MfaErrorPanel({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="mfa-error-title">
        <div className="metric-icon">
          <TriangleAlert aria-hidden="true" />
        </div>
        <p className="eyebrow">Account security</p>
        <h2 id="mfa-error-title">MFA check failed</h2>
        <p>{message}</p>
        <button className="secondary-action" type="button" onClick={onSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </button>
      </section>
    </div>
  );
}

function normalizeTotpCode(code: string): string {
  return code.replace(/\s+/g, "");
}

function mfaIssuerUrl(): string {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  if (
    window.location.pathname.startsWith("/recover") &&
    returnTo?.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.startsWith("/recover")
  ) {
    const returnUrl = new URL(returnTo, window.location.origin);
    return `${returnUrl.origin}${returnUrl.pathname}`;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function qrImageSource(qrCode: string): string {
  const source = qrCode.trim();
  const svgDataUri = source.match(/^data:image\/svg\+xml(?:;[^,]*)?,(.*)$/is);

  if (svgDataUri) {
    if (/;base64,/i.test(source)) {
      return source;
    }

    const payload = svgDataUri[1] ?? "";
    let svg = payload;
    try {
      svg = decodeURIComponent(payload);
    } catch {
      // Supabase can return an unescaped SVG payload.
    }

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  if (source.startsWith("<svg") || source.startsWith("<?xml")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  return source;
}
