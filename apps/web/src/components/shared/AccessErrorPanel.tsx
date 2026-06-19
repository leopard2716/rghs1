import { ShieldCheck } from "lucide-react";

export function AccessErrorPanel({
  eyebrow = "RGHS1",
  title,
  detail,
  actionLabel = "Back",
  onAction
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="access-error-title">
        <div className="metric-icon">
          <ShieldCheck aria-hidden="true" />
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="access-error-title">{title}</h2>
        {detail ? <p>{detail}</p> : null}
        <button className="secondary-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      </section>
    </div>
  );
}
