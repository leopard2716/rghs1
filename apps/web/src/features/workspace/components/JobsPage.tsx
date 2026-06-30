import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import { paths } from "../../../routing/paths";
import type { AuthSession } from "../../../services/auth.service";
import {
  createJobRecord,
  fetchJob,
  fetchJobs,
  updateJobRecord,
  type BidRecord,
  type JobRecord,
  type JobRecordListQuery,
  type TrackingJobMarket,
  type TrackingMemberSummary
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { displayDate } from "../../../utils/datetime";
import { fieldValue } from "../../../utils/form";
import {
  clearTrackingModalParams,
  jobListQueryFromParams,
  updateTrackingListParams
} from "../tracking-list-url";
import { matchingJobs } from "../job-match";
import { PaginationControls } from "./PaginationControls";
import { WorkspaceShell } from "./WorkspaceShell";

const DEFAULT_JOB_RATES = {
  bidder: 10,
  caller: 45,
  worker: 40,
  discount: 5
};

export function JobsPage({
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
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsValue = searchParams.toString();
  const listQuery = useMemo(
    () => jobListQueryFromParams(new URLSearchParams(searchParamsValue)),
    [searchParamsValue]
  );
  const creating = searchParams.get("modal") === "new";
  const requestedJobId = searchParams.get("jobRecordId");
  const queryClient = useQueryClient();
  const jobsQuery = useQuery({
    queryKey: ["tracking-jobs", slug, memberId, listQuery],
    queryFn: () => fetchJobs(session, slug, listQuery),
    placeholderData: (previousData) => previousData
  });
  const requestedJobQuery = useQuery({
    queryKey: ["tracking-job", slug, memberId, requestedJobId],
    queryFn: () => fetchJob(session, slug, requestedJobId as string),
    enabled: Boolean(requestedJobId)
  });
  const modalJob =
    jobsQuery.data?.jobs.find((job) => job.id === requestedJobId) ??
    requestedJobQuery.data?.job ??
    null;
  const editingJob = modalJob && canEditJob(modalJob, memberId) ? modalJob : null;
  const selectedJob = modalJob && !editingJob ? modalJob : null;
  const showJobForm = Boolean(
    jobsQuery.data && (selectedJob || editingJob || (creating && jobsQuery.data.canCreate))
  );
  const updateListQuery = useCallback(
    (change: Partial<JobRecordListQuery>) => {
      setSearchParams(updateTrackingListParams(new URLSearchParams(searchParamsValue), change), {
        replace: true
      });
    },
    [searchParamsValue, setSearchParams]
  );
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createJobRecord>[2]) =>
      createJobRecord(session, slug, input),
    onSuccess: async () => {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-jobs", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-payments", slug] })
      ]);
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({
      jobId,
      input
    }: {
      jobId: string;
      input: Parameters<typeof updateJobRecord>[3];
    }) => updateJobRecord(session, slug, jobId, input),
    onSuccess: async () => {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-jobs", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-payments", slug] })
      ]);
    }
  });
  const pending = createMutation.isPending || updateMutation.isPending;

  function openJob(job: JobRecord) {
    const next = clearTrackingModalParams(new URLSearchParams(searchParamsValue));
    next.set("jobRecordId", job.id);
    setSearchParams(next);
    createMutation.reset();
    updateMutation.reset();
  }

  function closeJobForm() {
    if (!pending) {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
    }
  }

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="jobs"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <ClipboardList aria-hidden="true" />
            <h3>Job Records</h3>
          </div>
          <div className="panel-actions">
            <button
              className="icon-button"
              type="button"
              title="Refresh jobs"
              aria-label="Refresh jobs"
              disabled={jobsQuery.isFetching}
              onClick={() => void jobsQuery.refetch()}
            >
              <RefreshCw
                className={jobsQuery.isFetching ? "spin-icon" : undefined}
                aria-hidden="true"
              />
            </button>
            {jobsQuery.data?.canCreate ? (
              <button
                className="primary-action small"
                type="button"
                disabled={!jobsQuery.data.bids.length || !jobsQuery.data.members.length}
                onClick={() => {
                  createMutation.reset();
                  updateMutation.reset();
                  const next = clearTrackingModalParams(new URLSearchParams(searchParamsValue));
                  next.set("modal", "new");
                  setSearchParams(next);
                }}
              >
                <Plus aria-hidden="true" />
                Add job record
              </button>
            ) : null}
          </div>
        </div>

        {jobsQuery.data ? (
          <JobListControls
            query={listQuery}
            markets={jobsQuery.data.filterMarkets}
            members={jobsQuery.data.filterMembers}
            disabled={jobsQuery.isFetching}
            onChange={updateListQuery}
          />
        ) : null}

        {jobsQuery.isError && !jobsQuery.data ? (
          <p className="form-error">{errorMessage(jobsQuery.error)}</p>
        ) : jobsQuery.isLoading ? (
          <RecordLoading label="Loading jobs" />
        ) : jobsQuery.data ? (
          <>
            <div className="table-wrap">
              <table className="tracking-table tracking-record-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Market</th>
                    <th>References</th>
                    <th>People</th>
                    <th>Rate split</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsQuery.isFetching ? (
                    <TableLoadingRow colSpan={6} label="Loading job results" />
                  ) : jobsQuery.data.jobs.length ? (
                    jobsQuery.data.jobs.map((job) => (
                      <tr
                        key={job.id}
                        className="tracking-row-clickable"
                        tabIndex={0}
                        onClick={() => openJob(job)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openJob(job);
                          }
                        }}
                      >
                        <td>
                          <strong>{job.jobTitle}</strong>
                          <span>
                            {job.company}
                            {job.bidDeleted ? " (deleted bid)" : ""}
                          </span>
                        </td>
                        <td>
                          <span className="market-pill">{job.jobMarket.name}</span>
                        </td>
                        <td>
                          <div className="record-links">
                            <Link
                              to={paths.workspaceBid(slug, job.bidId)}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ExternalLink aria-hidden="true" />
                              Bid
                            </Link>
                          </div>
                        </td>
                        <td>
                          <span>Bidder: {job.bidder?.name ?? "Former member"}</span>
                          <span>Caller: {job.caller?.name ?? "Former member"}</span>
                          <span>Worker: {job.worker?.name ?? "Former member"}</span>
                        </td>
                        <td>
                          <span>Bidder {formatPercent(job.rates.bidder)}</span>
                          <span>Caller {formatPercent(job.rates.caller)}</span>
                          <span>Worker {formatPercent(job.rates.worker)}</span>
                          <span>Discount {formatPercent(job.rates.discount)}</span>
                        </td>
                        <td>{displayDate(job.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="tracking-table-empty-row">
                      <td colSpan={6}>No job records match the current view.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={jobsQuery.data.pagination}
              disabled={jobsQuery.isFetching}
              onPageChange={(page) => updateListQuery({ page })}
              onPageSizeChange={(pageSize) => updateListQuery({ pageSize, page: 1 })}
            />
            {jobsQuery.isError ? (
              <p className="form-error">{errorMessage(jobsQuery.error)}</p>
            ) : null}
          </>
        ) : null}
        {requestedJobQuery.isError ? (
          <p className="form-error">{errorMessage(requestedJobQuery.error)}</p>
        ) : null}
      </section>

      {showJobForm && jobsQuery.data ? (
        <JobForm
          key={modalJob?.id ?? "new-job"}
          workspaceSlug={slug}
          bids={jobsQuery.data.bids}
          members={jobsQuery.data.members}
          initialJob={editingJob ?? selectedJob ?? undefined}
          readOnly={Boolean(selectedJob)}
          pending={pending}
          error={createMutation.error ?? updateMutation.error}
          onClose={closeJobForm}
          onSubmit={(input) => {
            if (editingJob) {
              updateMutation.mutate({ jobId: editingJob.id, input });
            } else {
              createMutation.mutate(input);
            }
          }}
        />
      ) : null}
    </WorkspaceShell>
  );
}

function JobListControls({
  query,
  markets,
  members,
  disabled,
  onChange
}: {
  query: JobRecordListQuery;
  markets: TrackingJobMarket[];
  members: TrackingMemberSummary[];
  disabled: boolean;
  onChange: (change: Partial<JobRecordListQuery>) => void;
}) {
  const [search, setSearch] = useState(query.search ?? "");

  useEffect(() => {
    setSearch(query.search ?? "");
  }, [query.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== (query.search ?? "")) {
        onChange({ search, page: 1 });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [onChange, query.search, search]);

  return (
    <div className="tracking-list-controls">
      <label className="tracking-search">
        <span>Search jobs</span>
        <div className="search-input">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Company or job title"
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </label>
      <label>
        Job market
        <select
          value={query.jobMarketId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ jobMarketId: event.target.value || undefined, page: 1 })}
        >
          <option value="">All markets</option>
          {markets.map((market) => (
            <option value={market.id} key={market.id}>
              {market.name}
              {market.deletedAt ? " (deleted)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        User
        <select
          value={query.memberId ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ memberId: event.target.value || undefined, page: 1 })}
        >
          <option value="">All users</option>
          {members.map((member) => (
            <option value={member.id} key={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sort
        <select
          value={query.sortBy ?? "datetime"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              sortBy: event.target.value as JobRecordListQuery["sortBy"],
              page: 1
            })
          }
        >
          <option value="datetime">Created date</option>
          <option value="company">Company name</option>
          <option value="jobTitle">Job title</option>
        </select>
      </label>
      <label>
        Direction
        <select
          value={query.sortDirection ?? "desc"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              sortDirection: event.target.value as JobRecordListQuery["sortDirection"],
              page: 1
            })
          }
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
    </div>
  );
}

function JobForm({
  workspaceSlug,
  bids,
  members,
  initialJob,
  readOnly,
  pending,
  error,
  onClose,
  onSubmit
}: {
  workspaceSlug: string;
  bids: BidRecord[];
  members: TrackingMemberSummary[];
  initialJob?: JobRecord;
  readOnly: boolean;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createJobRecord>[2]) => void;
}) {
  const initialBid = bids.find((bid) => bid.id === initialJob?.bidId) ?? bids[0];
  const [bidId, setBidId] = useState(initialBid?.id ?? "");
  const selectedBid = bids.find((bid) => bid.id === bidId);
  const [bidderMemberId, setBidderMemberId] = useState(
    initialJob?.bidder?.id ?? initialBid?.bidder?.id ?? members[0]?.id ?? ""
  );
  const [callerMemberId, setCallerMemberId] = useState(
    initialJob?.caller?.id ?? members[0]?.id ?? ""
  );
  const [workerMemberId, setWorkerMemberId] = useState(
    initialJob?.worker?.id ?? members[0]?.id ?? ""
  );
  const [bidderRate, setBidderRate] = useState(
    initialJob?.rates.bidder ?? DEFAULT_JOB_RATES.bidder
  );
  const [callerRate, setCallerRate] = useState(
    initialJob?.rates.caller ?? DEFAULT_JOB_RATES.caller
  );
  const [workerRate, setWorkerRate] = useState(
    initialJob?.rates.worker ?? DEFAULT_JOB_RATES.worker
  );
  const [discountRate, setDiscountRate] = useState(
    initialJob?.rates.discount ?? DEFAULT_JOB_RATES.discount
  );
  const [formError, setFormError] = useState<string | null>(null);
  const formDisabled = pending || readOnly;
  const rateTotal = bidderRate + callerRate + workerRate + discountRate;

  useEffect(() => {
    if (!initialJob && selectedBid?.bidder?.id) {
      setBidderMemberId(selectedBid.bidder.id);
    }
  }, [initialJob, selectedBid?.bidder?.id]);

  return (
    <Modal
      title={readOnly ? "Job Details" : initialJob ? "Edit Job" : "Add Job Record"}
      size="large"
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (readOnly) {
            return;
          }
          if (!bidId) {
            setFormError("Select a bid record.");
            return;
          }
          if (!bidderMemberId || !callerMemberId || !workerMemberId) {
            setFormError("Select bidder, caller, and worker users.");
            return;
          }
          const nextRates = {
            bidderRate: Number(fieldValue(new FormData(event.currentTarget), "bidderRate")),
            callerRate: Number(fieldValue(new FormData(event.currentTarget), "callerRate")),
            workerRate: Number(fieldValue(new FormData(event.currentTarget), "workerRate")),
            discountRate: Number(fieldValue(new FormData(event.currentTarget), "discountRate"))
          };
          const nextTotal =
            nextRates.bidderRate +
            nextRates.callerRate +
            nextRates.workerRate +
            nextRates.discountRate;
          if (Math.round(nextTotal * 100) !== 10000) {
            setFormError("Bidder, caller, worker, and discount rates must total 100%.");
            return;
          }
          setFormError(null);
          onSubmit({
            bidId,
            bidderMemberId,
            callerMemberId,
            workerMemberId,
            ...nextRates
          });
        }}
      >
        <SearchableJobSelect
          bids={bids}
          selectedBidId={bidId}
          disabled={formDisabled}
          onSelect={(bid) => {
            setBidId(bid.id);
            setBidderMemberId(bid.bidder?.id ?? members[0]?.id ?? "");
            setFormError(null);
          }}
        />
        {selectedBid ? (
          <div className="selected-job-summary">
            <span className="market-pill">{selectedBid.jobMarket.name}</span>
            <span>Bid created by: {selectedBid.bidder?.name ?? "Former member"}</span>
            <Link className="record-link" to={paths.workspaceBid(workspaceSlug, selectedBid.id)}>
              View bid record
            </Link>
          </div>
        ) : null}
        <div className="form-grid">
          <UserSelect
            label="Bidder"
            value={bidderMemberId}
            members={members}
            disabled={formDisabled}
            onChange={setBidderMemberId}
          />
          <UserSelect
            label="Caller"
            value={callerMemberId}
            members={members}
            disabled={formDisabled}
            onChange={setCallerMemberId}
          />
          <UserSelect
            label="Worker"
            value={workerMemberId}
            members={members}
            disabled={formDisabled}
            onChange={setWorkerMemberId}
          />
        </div>
        <fieldset className="schedule-fields">
          <legend>Payment rate split</legend>
          <RateInput
            label="Bidder rate"
            name="bidderRate"
            value={bidderRate}
            disabled={formDisabled}
            onChange={setBidderRate}
          />
          <RateInput
            label="Caller rate"
            name="callerRate"
            value={callerRate}
            disabled={formDisabled}
            onChange={setCallerRate}
          />
          <RateInput
            label="Worker rate"
            name="workerRate"
            value={workerRate}
            disabled={formDisabled}
            onChange={setWorkerRate}
          />
          <RateInput
            label="Discount rate"
            name="discountRate"
            value={discountRate}
            disabled={formDisabled}
            onChange={setDiscountRate}
          />
        </fieldset>
        <p className={Math.round(rateTotal * 100) === 10000 ? "record-muted" : "form-error"}>
          Total rate: {formatPercent(rateTotal)}
        </p>
        {initialJob ? (
          <div className="selected-job-summary">
            <span>Created: {displayDate(initialJob.createdAt)}</span>
          </div>
        ) : null}
        {formError ? <p className="form-error">{formError}</p> : null}
        {error ? <p className="form-error">{errorMessage(error)}</p> : null}
        <div className="modal-actions">
          <button className="secondary-action" type="button" disabled={pending} onClick={onClose}>
            <X aria-hidden="true" />
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button className="primary-action small" type="submit" disabled={pending}>
              <Save aria-hidden="true" />
              {pending ? "Saving" : initialJob ? "Save changes" : "Save job"}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function SearchableJobSelect({
  bids,
  selectedBidId,
  disabled,
  onSelect
}: {
  bids: BidRecord[];
  selectedBidId: string;
  disabled: boolean;
  onSelect: (bid: BidRecord) => void;
}) {
  const selectedBid = bids.find((bid) => bid.id === selectedBidId);
  const [query, setQuery] = useState(selectedBid ? jobOptionLabel(selectedBid) : "");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => matchingJobs(query, bids), [query, bids]);

  return (
    <div
      className="job-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <label htmlFor="job-record-bid-search">Reference bid</label>
      <div className="search-input">
        <Search aria-hidden="true" />
        <input
          id="job-record-bid-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="job-record-bid-options"
          value={query}
          placeholder="Search company or job title"
          autoComplete="off"
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open ? (
        <div className="job-options" id="job-record-bid-options" role="listbox">
          {matches.length ? (
            matches.map((bid) => (
              <button
                type="button"
                role="option"
                aria-selected={bid.id === selectedBidId}
                className={bid.id === selectedBidId ? "selected" : undefined}
                key={bid.id}
                onClick={() => {
                  setQuery(jobOptionLabel(bid));
                  setOpen(false);
                  onSelect(bid);
                }}
              >
                <span>
                  <strong>{bid.jobTitle}</strong>
                  <small>
                    {bid.company} | {bid.jobMarket.name}
                  </small>
                </span>
                {bid.id === selectedBidId ? <Check aria-hidden="true" /> : null}
              </button>
            ))
          ) : (
            <p>No matching bids</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UserSelect({
  label,
  value,
  members,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  members: TrackingMemberSummary[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        required
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select user</option>
        {members.map((member) => (
          <option value={member.id} key={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RateInput({
  label,
  name,
  value,
  disabled,
  onChange
}: {
  label: string;
  name: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="number"
        min="0"
        max="100"
        step="0.01"
        required
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function jobOptionLabel(bid: BidRecord): string {
  return `${bid.jobTitle} at ${bid.company}`;
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

function RecordLoading({ label }: { label: string }) {
  return (
    <div className="admin-empty-state">
      <LoaderCircle className="spin-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function TableLoadingRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr className="tracking-table-loading-row">
      <td colSpan={colSpan}>
        <LoaderCircle className="spin-icon" aria-hidden="true" />
        <span>{label}</span>
      </td>
    </tr>
  );
}

function canEditJob(job: JobRecord, memberId: string): boolean {
  return job.canEdit && job.createdByMemberId === memberId;
}
