import type { Interview, JobApplication, WorkspaceSnapshot } from "@rghs1/domain";
import {
  BriefcaseBusiness,
  CalendarClock,
  Check,
  Globe2,
  LayoutDashboard,
  Plus,
  ShieldCheck
} from "lucide-react";
import { MetricCard } from "../../../components/shared/MetricCard";
import { PanelHeader } from "../../../components/shared/PanelHeader";
import { applicationDensityByMarket, buildDashboardMetrics } from "../workspace.metrics";
import { ApplicationTable } from "./ApplicationTable";
import { InterviewList } from "./InterviewList";
import { MarketList } from "./MarketList";

export function WorkspacePortal({
  snapshot,
  applications,
  interviews,
  onBack,
  onOpenApplication,
  onOpenInterview
}: {
  snapshot: WorkspaceSnapshot;
  applications: JobApplication[];
  interviews: Interview[];
  onBack: () => void;
  onOpenApplication: () => void;
  onOpenInterview: () => void;
}) {
  const metrics = buildDashboardMetrics({
    applications,
    interviews,
    profiles: snapshot.profiles,
    markets: snapshot.markets
  });
  const marketDensity = applicationDensityByMarket(applications, snapshot.markets);

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <button className="brand-button" type="button" onClick={onBack}>
          <ShieldCheck aria-hidden="true" />
          <span>RGHS1</span>
        </button>
        <nav className="sidebar-nav" aria-label="Workspace sections">
          <a href="#dashboard" className="active">
            <LayoutDashboard aria-hidden="true" />
            Dashboard
          </a>
          <a href="#applications">
            <BriefcaseBusiness aria-hidden="true" />
            Applications
          </a>
          <a href="#interviews">
            <CalendarClock aria-hidden="true" />
            Interviews
          </a>
          <a href="#admin">
            <ShieldCheck aria-hidden="true" />
            Admin
          </a>
        </nav>
      </aside>

      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Active workspace</p>
            <h2>{snapshot.workspace.name}</h2>
          </div>
          <div className="header-actions">
            <span className="runtime-pill compact">
              <Globe2 aria-hidden="true" />
              Workspace API
            </span>
            <button className="secondary-action" type="button" onClick={onOpenInterview}>
              <CalendarClock aria-hidden="true" />
              Save interview
            </button>
            <button className="primary-action small" type="button" onClick={onOpenApplication}>
              <Plus aria-hidden="true" />
              Save application
            </button>
          </div>
        </header>

        <section id="dashboard" className="metrics-grid" aria-label="Workspace metrics">
          <MetricCard
            icon={<BriefcaseBusiness aria-hidden="true" />}
            label="Active applications"
            value={metrics.activeApplications}
          />
          <MetricCard
            icon={<CalendarClock aria-hidden="true" />}
            label="Interview signals"
            value={metrics.interviewRequests}
          />
          <MetricCard
            icon={<ShieldCheck aria-hidden="true" />}
            label="Profiles"
            value={metrics.profiles}
          />
          <MetricCard
            icon={<Globe2 aria-hidden="true" />}
            label="Active markets"
            value={metrics.activeMarkets}
          />
        </section>

        <section className="workspace-grid">
          <section id="applications" className="panel wide-panel">
            <PanelHeader
              icon={<BriefcaseBusiness aria-hidden="true" />}
              title="Application Pipeline"
              actionLabel="New"
              onAction={onOpenApplication}
            />
            <ApplicationTable
              applications={applications}
              profiles={snapshot.profiles}
              markets={snapshot.markets}
            />
          </section>

          <section id="interviews" className="panel">
            <PanelHeader
              icon={<CalendarClock aria-hidden="true" />}
              title="Interviews"
              actionLabel="Save"
              onAction={onOpenInterview}
            />
            <InterviewList interviews={interviews} profiles={snapshot.profiles} />
          </section>

          <section className="panel">
            <PanelHeader icon={<Globe2 aria-hidden="true" />} title="Markets" />
            <MarketList marketDensity={marketDensity} />
          </section>

          <section id="admin" className="panel wide-panel">
            <PanelHeader icon={<ShieldCheck aria-hidden="true" />} title="Workspace Access" />
            <div className="role-grid">
              {snapshot.roles.map((role) => (
                <article className="role-card" key={role.id}>
                  <div>
                    <strong>{role.name}</strong>
                    <span>{role.permissions.length} permissions</span>
                  </div>
                  <Check aria-hidden="true" />
                </article>
              ))}
            </div>
          </section>
        </section>
      </section>
    </div>
  );
}
