import { Bell, FileUp, Globe2, LogIn, ShieldCheck, Users } from "lucide-react";
import { MetricCard } from "../../components/shared/MetricCard";

export function LandingPage({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  return (
    <div className="landing-page">
      <section className="hero">
        <div className="hero-overlay" />
        <nav className="top-nav" aria-label="Product navigation">
          <div className="brand-mark">
            <ShieldCheck aria-hidden="true" />
            <span>RGHS1</span>
          </div>
          <div className="nav-actions">
            <button className="nav-action" type="button" onClick={onOpenAdmin}>
              <LogIn aria-hidden="true" />
              Sign in
            </button>
          </div>
        </nav>
        <div className="hero-content">
          <p className="eyebrow">Bid and interview operations</p>
          <h1>RGHS1</h1>
          <p className="hero-copy">
            Multi-tenant tracking for job bidding, profiles, resumes, interviews, notifications, and
            global workspace administration.
          </p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={onOpenAdmin}>
              <LogIn aria-hidden="true" />
              Sign in
            </button>
            <span className="runtime-pill">
              <Globe2 aria-hidden="true" />
              Cloud auth
            </span>
          </div>
        </div>
      </section>

      <section className="intro-strip" aria-label="RGHS1 product modules">
        <MetricCard icon={<Users aria-hidden="true" />} label="Tenants" value="Workspace based" />
        <MetricCard icon={<FileUp aria-hidden="true" />} label="Files" value="R2 ready" />
        <MetricCard icon={<Bell aria-hidden="true" />} label="Alerts" value="Follow-up aware" />
        <MetricCard icon={<ShieldCheck aria-hidden="true" />} label="Access" value="Role based" />
      </section>
    </div>
  );
}
