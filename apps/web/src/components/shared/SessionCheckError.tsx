import { ShieldCheck } from "lucide-react";

export function SessionCheckError({
  detail,
  onRetry,
  onClearSession
}: {
  detail: string | null;
  onRetry: () => void;
  onClearSession: () => void;
}) {
  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="session-check-error-title">
        <div className="metric-icon">
          <ShieldCheck aria-hidden="true" />
        </div>
        <p className="eyebrow">Account session</p>
        <h2 id="session-check-error-title">Session check failed</h2>
        {detail ? <p>{detail}</p> : null}
        <div className="modal-actions">
          <button className="primary-action" type="button" onClick={onRetry}>
            Retry
          </button>
          <button className="secondary-action" type="button" onClick={onClearSession}>
            Sign in again
          </button>
        </div>
      </section>
    </div>
  );
}
