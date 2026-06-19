import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  ChartNoAxesCombined,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Target,
  UserRoundPlus,
  XCircle
} from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from "react";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  fetchTrackingDashboard,
  fetchTrackingProfileRequests,
  reviewTrackingProfileRequest,
  type DashboardBreakdown
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { deviceTimeZone, displayDate, localDateValue } from "../../../utils/datetime";
import { dashboardDateRange, datesInRange, type DashboardRangePreset } from "../dashboard-range";
import { WorkspaceShell } from "./WorkspaceShell";

type BreakdownGroup = "market" | "bidder" | "profile";
type ProfileReviewDecision = "approved" | "denied";

const chartColors = [
  "#2f8f75",
  "#d0a12c",
  "#cf6459",
  "#3978a8",
  "#5d665f",
  "#8c5fa8",
  "#a64d62",
  "#638d3d"
];

export function WorkspaceOverviewPage({
  session,
  workspaceSession,
  onRecoverPassword,
  onSignOut
}: {
  session: AuthSession;
  workspaceSession: WorkspaceSession;
  onRecoverPassword: () => void;
  onSignOut: () => void;
}) {
  const slug = workspaceSession.workspace.slug;
  const memberId = workspaceSession.member.id;
  const queryClient = useQueryClient();
  const profileReviewLocks = useRef(new Set<string>());
  const isAdmin = workspaceSession.member.roleKeys.includes("admin");
  const today = localDateValue();
  const [rangePreset, setRangePreset] = useState<DashboardRangePreset>("month");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [profileId, setProfileId] = useState("");
  const [jobMarketId, setJobMarketId] = useState("");
  const [bidderId, setBidderId] = useState("");
  const [bidGroup, setBidGroup] = useState<BreakdownGroup>("market");
  const [interviewGroup, setInterviewGroup] = useState<BreakdownGroup>("market");
  const [pendingProfileReviews, setPendingProfileReviews] = useState<
    Record<string, ProfileReviewDecision>
  >({});
  const timeZone = deviceTimeZone();
  const rangeValid =
    rangePreset !== "custom" ||
    (Boolean(customFrom) && Boolean(customTo) && customFrom <= customTo);
  const dateRange = useMemo(
    () => dashboardDateRange(rangePreset, timeZone, customFrom || today, customTo || today),
    [customFrom, customTo, rangePreset, timeZone, today]
  );
  const dashboardQuery = useQuery({
    queryKey: [
      "tracking-dashboard",
      slug,
      memberId,
      rangePreset,
      dateRange.from,
      dateRange.to,
      profileId,
      jobMarketId,
      bidderId
    ],
    queryFn: () =>
      fetchTrackingDashboard(session, slug, {
        from: dateRange.from,
        to: dateRange.to,
        todayFrom: dateRange.todayFrom,
        todayTo: dateRange.todayTo,
        timeZone,
        profileId: profileId || undefined,
        jobMarketId: jobMarketId || undefined,
        bidderId: bidderId || undefined
      }),
    enabled: rangeValid
  });
  const profileRequestsQuery = useQuery({
    queryKey: ["tracking-profile-requests", slug, memberId],
    queryFn: () => fetchTrackingProfileRequests(session, slug),
    enabled: isAdmin
  });
  const reviewRequestMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: ProfileReviewDecision }) =>
      reviewTrackingProfileRequest(session, slug, requestId, decision),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-profile-requests", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-profiles", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] })
      ]);
    },
    onSettled: (_data, _error, variables) => {
      profileReviewLocks.current.delete(variables.requestId);
      setPendingProfileReviews((current) => {
        const next = { ...current };
        delete next[variables.requestId];
        return next;
      });
    }
  });
  const trendDates = useMemo(
    () => datesInRange(dateRange.fromDate, dateRange.toDateExclusive),
    [dateRange.fromDate, dateRange.toDateExclusive]
  );

  function reviewProfileRequest(requestId: string, decision: ProfileReviewDecision) {
    if (profileReviewLocks.current.has(requestId)) {
      return;
    }
    profileReviewLocks.current.add(requestId);
    setPendingProfileReviews((current) => ({
      ...current,
      [requestId]: decision
    }));
    reviewRequestMutation.mutate({ requestId, decision });
  }

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="overview"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="dashboard-toolbar panel">
        <div className="dashboard-access">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>{workspaceSession.member.displayName}</strong>
            <span>{workspaceSession.member.roleKeys.join(", ") || "No role assigned"}</span>
          </div>
        </div>
        <div className="dashboard-controls">
          <label>
            Range
            <select
              value={rangePreset}
              onChange={(event) => setRangePreset(event.target.value as DashboardRangePreset)}
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {rangePreset === "custom" ? (
            <>
              <label>
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label>
            Profile
            <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              <option value="">All profiles</option>
              {dashboardQuery.data?.filters.profiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                  {profile.deletedAt ? " (deleted)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Job market
            <select value={jobMarketId} onChange={(event) => setJobMarketId(event.target.value)}>
              <option value="">All markets</option>
              {dashboardQuery.data?.filters.markets.map((market) => (
                <option value={market.id} key={market.id}>
                  {market.name}
                  {market.deletedAt ? " (deleted)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bidder
            <select value={bidderId} onChange={(event) => setBidderId(event.target.value)}>
              <option value="">All bidders</option>
              {dashboardQuery.data?.filters.bidders.map((bidder) => (
                <option value={bidder.id} key={bidder.id}>
                  {bidder.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            type="button"
            title="Refresh dashboard"
            aria-label="Refresh dashboard"
            disabled={dashboardQuery.isFetching}
            onClick={() => void dashboardQuery.refetch()}
          >
            <RefreshCw
              className={dashboardQuery.isFetching ? "spin-icon" : undefined}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      {!rangeValid ? (
        <p className="form-error">Custom range end must be on or after its start.</p>
      ) : dashboardQuery.isError ? (
        <p className="form-error">{errorMessage(dashboardQuery.error)}</p>
      ) : dashboardQuery.isLoading || !dashboardQuery.data ? (
        <div className="panel admin-empty-state">
          <span>Loading workspace dashboard</span>
        </div>
      ) : (
        <>
          <section className="dashboard-stat-grid" aria-label="Tracking summary">
            <MetricCard
              icon={<BriefcaseBusiness aria-hidden="true" />}
              label="Today's bids"
              value={dashboardQuery.data.summary.todayBids}
              detail="Device-local day"
            />
            <MetricCard
              icon={<CalendarClock aria-hidden="true" />}
              label="Today's interviews"
              value={dashboardQuery.data.summary.todayInterviews}
              detail="Scheduled starts"
            />
            <MetricCard
              icon={<Activity aria-hidden="true" />}
              label="Total bids"
              value={dashboardQuery.data.summary.totalBids}
              detail={`${dashboardQuery.data.summary.bidSharePercent}% of tracked activity`}
            />
            <MetricCard
              icon={<ChartNoAxesCombined aria-hidden="true" />}
              label="Total interviews"
              value={dashboardQuery.data.summary.totalInterviews}
              detail={`${dashboardQuery.data.summary.interviewSharePercent}% of tracked activity`}
            />
            <MetricCard
              icon={<Target aria-hidden="true" />}
              label="Interview-to-bid"
              value={`${dashboardQuery.data.summary.interviewToBidPercent}%`}
              detail="Interviews divided by bids"
            />
          </section>

          {isAdmin &&
          profileRequestsQuery.data?.requests.some((request) => request.status === "pending") ? (
            <section className="panel profile-request-review">
              <div className="panel-header">
                <div>
                  <UserRoundPlus aria-hidden="true" />
                  <h3>Profile Requests</h3>
                </div>
                <span>
                  {
                    profileRequestsQuery.data.requests.filter(
                      (request) => request.status === "pending"
                    ).length
                  }{" "}
                  pending
                </span>
              </div>
              <div className="profile-request-list">
                {profileRequestsQuery.data.requests
                  .filter((request) => request.status === "pending")
                  .map((request) => {
                    const pendingDecision = pendingProfileReviews[request.id];
                    return (
                      <article key={request.id} aria-busy={Boolean(pendingDecision)}>
                        <div>
                          <strong>{request.name}</strong>
                          <span>
                            Requested by {request.requester?.name ?? "Workspace member"} for CSV
                            import
                          </span>
                        </div>
                        <div>
                          <button
                            className="primary-action compact-action"
                            type="button"
                            disabled={Boolean(pendingDecision)}
                            onClick={() => reviewProfileRequest(request.id, "approved")}
                          >
                            {pendingDecision === "approved" ? (
                              <LoaderCircle className="spin-icon" aria-hidden="true" />
                            ) : (
                              <UserRoundPlus aria-hidden="true" />
                            )}
                            {pendingDecision === "approved" ? "Approving" : "Approve"}
                          </button>
                          <button
                            className="secondary-action compact-action danger-action"
                            type="button"
                            disabled={Boolean(pendingDecision)}
                            onClick={() => reviewProfileRequest(request.id, "denied")}
                          >
                            {pendingDecision === "denied" ? (
                              <LoaderCircle className="spin-icon" aria-hidden="true" />
                            ) : (
                              <XCircle aria-hidden="true" />
                            )}
                            {pendingDecision === "denied" ? "Denying" : "Deny"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              {reviewRequestMutation.isError ? (
                <p className="form-error">{errorMessage(reviewRequestMutation.error)}</p>
              ) : null}
            </section>
          ) : null}

          <section className="dashboard-chart-grid">
            <DashboardChartPanel
              title="Bid Distribution"
              group={bidGroup}
              onGroupChange={setBidGroup}
            >
              <PieChart values={dashboardQuery.data.breakdowns.bids[bidGroup]} />
            </DashboardChartPanel>
            <DashboardChartPanel
              title="Interview Distribution"
              group={interviewGroup}
              onGroupChange={setInterviewGroup}
            >
              <PieChart values={dashboardQuery.data.breakdowns.interviews[interviewGroup]} />
            </DashboardChartPanel>
          </section>

          <section className="dashboard-chart-grid dashboard-line-grid">
            <DashboardLinePanel title="Bid Volume">
              <LineChart
                dates={trendDates}
                values={dashboardQuery.data.trends.bids}
                color="#2f8f75"
                label="Bids"
              />
            </DashboardLinePanel>
            <DashboardLinePanel title="Interview Volume">
              <LineChart
                dates={trendDates}
                values={dashboardQuery.data.trends.interviews}
                color="#3978a8"
                label="Interviews"
              />
            </DashboardLinePanel>
          </section>

          <section className="panel dashboard-activity-panel">
            <div className="panel-header">
              <div>
                <Activity aria-hidden="true" />
                <h3>Recent Activity</h3>
              </div>
              <span className="dashboard-timezone">{timeZone}</span>
            </div>
            {dashboardQuery.data.recentActivity.length ? (
              <div className="dashboard-activity-list">
                {dashboardQuery.data.recentActivity.map((item) => (
                  <article key={item.id}>
                    <span className={`activity-type ${item.type}`}>{item.type}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.company} | {item.market}
                      </span>
                    </div>
                    <time dateTime={item.at}>{displayDate(item.at)}</time>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">
                <span>No tracking activity in this range.</span>
              </div>
            )}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="dashboard-stat-card">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function DashboardChartPanel({
  title,
  group,
  onGroupChange,
  children
}: {
  title: string;
  group: BreakdownGroup;
  onGroupChange: (group: BreakdownGroup) => void;
  children: ReactNode;
}) {
  return (
    <section className="panel dashboard-chart-panel">
      <div className="panel-header">
        <div>
          <ChartNoAxesCombined aria-hidden="true" />
          <h3>{title}</h3>
        </div>
        <select
          aria-label={`${title} grouping`}
          value={group}
          onChange={(event) => onGroupChange(event.target.value as BreakdownGroup)}
        >
          <option value="market">Per job market</option>
          <option value="bidder">Per bidder</option>
          <option value="profile">Per profile</option>
        </select>
      </div>
      {children}
    </section>
  );
}

function DashboardLinePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel dashboard-chart-panel">
      <div className="panel-header">
        <div>
          <ChartNoAxesCombined aria-hidden="true" />
          <h3>{title}</h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function PieChart({ values }: { values: DashboardBreakdown[] }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (!total) {
    return <div className="dashboard-chart-empty">No data in this range.</div>;
  }
  let current = 0;
  const segments = values.map((item, index) => {
    const start = current;
    current += (item.value / total) * 100;
    return `${chartColors[index % chartColors.length]} ${start}% ${current}%`;
  });
  const style = {
    "--pie-background": `conic-gradient(${segments.join(", ")})`
  } as CSSProperties;

  return (
    <div className="pie-chart-layout">
      <div
        className="pie-chart"
        style={style}
        role="img"
        aria-label={`Distribution across ${values.length} groups`}
      >
        <strong>{total}</strong>
        <span>Total</span>
      </div>
      <div className="chart-legend">
        {values.map((item, index) => (
          <div key={item.key}>
            <i style={{ background: chartColors[index % chartColors.length] }} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({
  dates,
  values,
  color,
  label
}: {
  dates: string[];
  values: Array<{ date: string; value: number }>;
  color: string;
  label: string;
}) {
  const width = 720;
  const height = 230;
  const padding = 34;
  const valueMap = new Map(values.map((item) => [item.date, item.value]));
  const points = dates.map((date) => ({ date, value: valueMap.get(date) ?? 0 }));
  const max = Math.max(1, ...points.map((point) => point.value));
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const pointValues = points.map((point, index) => {
    const x =
      padding + (points.length <= 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
    const y = height - padding - (point.value / max) * chartHeight;
    return { ...point, x, y };
  });
  const path = pointValues
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} over time`}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <text x={padding} y={padding - 10}>
          {max}
        </text>
        <text x={padding} y={height - 10}>
          {formatChartDate(points[0]?.date)}
        </text>
        <text x={width - padding} y={height - 10} textAnchor="end">
          {formatChartDate(points.at(-1)?.date)}
        </text>
        <path d={path} fill="none" stroke={color} strokeWidth="3" />
        {pointValues.length <= 31
          ? pointValues.map((point) => (
              <circle key={point.date} cx={point.x} cy={point.y} r="4" fill={color}>
                <title>
                  {point.date}: {point.value}
                </title>
              </circle>
            ))
          : null}
      </svg>
    </div>
  );
}

function formatChartDate(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}
