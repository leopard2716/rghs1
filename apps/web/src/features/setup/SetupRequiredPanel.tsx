import { ChevronRight, ShieldCheck } from "lucide-react";

export function SetupRequiredPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="setup-page">
      <section className="setup-panel" aria-labelledby="setup-title">
        <div className="metric-icon">
          <ShieldCheck aria-hidden="true" />
        </div>
        <p className="eyebrow">Backend setup required</p>
        <h2 id="setup-title">RGHS1 needs real auth and workspace APIs</h2>
        <p>
          Demo bootstrap data has been removed. Configure Supabase Auth, then implement the
          authenticated workspace endpoints before opening the workspace portal.
        </p>
        <button className="secondary-action" type="button" onClick={onBack}>
          <ChevronRight aria-hidden="true" />
          Back to RGHS1
        </button>
      </section>
    </div>
  );
}
