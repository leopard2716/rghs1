import { INTERVIEW_STEPS } from "@rghs1/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Save,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import { paths } from "../../../routing/paths";
import type { AuthSession } from "../../../services/auth.service";
import {
  createInterviewRecord,
  deleteInterviewRecord,
  fetchInterview,
  fetchInterviews,
  updateInterviewRecord,
  type BidRecord,
  type InterviewRecord,
  type TrackingListQuery
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import {
  deviceTimeZone,
  displayZonedDateTimeRange,
  localDateValue,
  localTimeValue,
  zonedDateTimeToIso
} from "../../../utils/datetime";
import { fieldValue, optionalFieldValue } from "../../../utils/form";
import { searchTimeZones, timeZoneInputLabel } from "../../../utils/timezone-search";
import { matchingJobs } from "../job-match";
import {
  clearTrackingModalParams,
  trackingListQueryFromParams,
  updateTrackingListParams
} from "../tracking-list-url";
import { PaginationControls } from "./PaginationControls";
import { TrackingListControls } from "./TrackingListControls";
import { WorkspaceShell } from "./WorkspaceShell";

export function InterviewsPage({
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
    () => trackingListQueryFromParams(new URLSearchParams(searchParamsValue)),
    [searchParamsValue]
  );
  const creating = searchParams.get("modal") === "new";
  const requestedBidId = creating ? searchParams.get("bidId") : null;
  const requestedInterviewId = searchParams.get("interviewId");
  const queryClient = useQueryClient();
  const [deletingInterviewId, setDeletingInterviewId] = useState<string | null>(null);
  const interviewsQuery = useQuery({
    queryKey: ["tracking-interviews", slug, memberId, listQuery],
    queryFn: () => fetchInterviews(session, slug, listQuery),
    placeholderData: (previousData) => previousData
  });
  const requestedInterviewQuery = useQuery({
    queryKey: ["tracking-interview", slug, memberId, requestedInterviewId],
    queryFn: () => fetchInterview(session, slug, requestedInterviewId as string),
    enabled: Boolean(requestedInterviewId)
  });
  const modalInterview =
    interviewsQuery.data?.interviews.find((interview) => interview.id === requestedInterviewId) ??
    requestedInterviewQuery.data?.interview ??
    null;
  const editingInterview =
    modalInterview && canEditInterview(modalInterview, memberId) ? modalInterview : null;
  const selectedInterview = modalInterview && !editingInterview ? modalInterview : null;
  const updateListQuery = useCallback(
    (change: Partial<TrackingListQuery>) => {
      setSearchParams(updateTrackingListParams(new URLSearchParams(searchParamsValue), change), {
        replace: true
      });
    },
    [searchParamsValue, setSearchParams]
  );
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createInterviewRecord>[2]) =>
      createInterviewRecord(session, slug, input),
    onSuccess: async () => {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({
      interviewId,
      input
    }: {
      interviewId: string;
      input: Parameters<typeof updateInterviewRecord>[3];
    }) => updateInterviewRecord(session, slug, interviewId, input),
    onSuccess: async () => {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (interviewId: string) => deleteInterviewRecord(session, slug, interviewId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
    },
    onSettled: () => setDeletingInterviewId(null)
  });
  const requestedBid = interviewsQuery.data?.bids.find((bid) => bid.id === requestedBidId);
  const showInterviewForm = Boolean(
    interviewsQuery.data &&
    (selectedInterview ||
      (interviewsQuery.data.canCreate && (creating || requestedBid || editingInterview)))
  );
  const showActions = Boolean(
    interviewsQuery.data?.interviews.some((interview) => canDeleteInterview(interview, memberId))
  );
  const interviewMutationPending = createMutation.isPending || updateMutation.isPending;
  const interviewFormBids = useMemo(() => {
    const bids = interviewsQuery.data?.bids ?? [];
    if (!modalInterview || bids.some((bid) => bid.id === modalInterview.bidId)) {
      return bids;
    }
    return [...bids, historicalBidForInterview(modalInterview)];
  }, [interviewsQuery.data?.bids, modalInterview]);

  useEffect(() => {
    setDeletingInterviewId(null);
  }, [memberId]);

  function closeInterviewForm() {
    if (!interviewMutationPending) {
      setSearchParams(clearTrackingModalParams(new URLSearchParams(searchParamsValue)), {
        replace: true
      });
    }
  }

  function openInterview(interview: InterviewRecord) {
    const next = clearTrackingModalParams(new URLSearchParams(searchParamsValue));
    next.set("interviewId", interview.id);
    setSearchParams(next);
    createMutation.reset();
    updateMutation.reset();
  }

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="interviews"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <CalendarClock aria-hidden="true" />
            <h3>Interview Tracking</h3>
          </div>
          <div className="panel-actions">
            <button
              className="icon-button"
              type="button"
              title="Refresh interviews"
              aria-label="Refresh interviews"
              disabled={interviewsQuery.isFetching}
              onClick={() => void interviewsQuery.refetch()}
            >
              <RefreshCw
                className={interviewsQuery.isFetching ? "spin-icon" : undefined}
                aria-hidden="true"
              />
            </button>
            {interviewsQuery.data?.canCreate ? (
              <button
                className="primary-action small"
                type="button"
                disabled={!interviewsQuery.data.bids.length}
                title={
                  !interviewsQuery.data.bids.length ? "A bidder must save a bid first" : undefined
                }
                onClick={() => {
                  createMutation.reset();
                  updateMutation.reset();
                  const next = clearTrackingModalParams(new URLSearchParams(searchParamsValue));
                  next.set("modal", "new");
                  setSearchParams(next);
                }}
              >
                <Plus aria-hidden="true" />
                Save interview
              </button>
            ) : null}
          </div>
        </div>

        {interviewsQuery.data ? (
          <TrackingListControls
            query={listQuery}
            profiles={interviewsQuery.data.filterProfiles}
            markets={interviewsQuery.data.filterMarkets}
            disabled={false}
            onChange={updateListQuery}
          />
        ) : null}

        {interviewsQuery.isError && !interviewsQuery.data ? (
          <p className="form-error">{errorMessage(interviewsQuery.error)}</p>
        ) : interviewsQuery.isLoading ? (
          <div className="admin-empty-state">
            <LoaderCircle className="spin-icon" aria-hidden="true" />
            <span>Loading interviews</span>
          </div>
        ) : interviewsQuery.data ? (
          <>
            <div className="table-wrap">
              <table className="tracking-table tracking-record-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Market</th>
                    <th>Step</th>
                    <th>Profile</th>
                    <th>Schedule</th>
                    <th>People</th>
                    <th>Interview link</th>
                    <th>Notes</th>
                    {showActions ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {interviewsQuery.isFetching ? (
                    <TableLoadingRow
                      colSpan={showActions ? 9 : 8}
                      label="Loading interview results"
                    />
                  ) : interviewsQuery.data.interviews.length ? (
                    interviewsQuery.data.interviews.map((interview) => (
                      <tr
                        key={interview.id}
                        className={`tracking-row-clickable${
                          deletingInterviewId === interview.id ? " tenant-row-pending" : ""
                        }`}
                        tabIndex={0}
                        onClick={() => openInterview(interview)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openInterview(interview);
                          }
                        }}
                        aria-busy={deletingInterviewId === interview.id}
                      >
                        <td>
                          <strong>{interview.jobTitle}</strong>
                          <span>
                            {interview.company}
                            {interview.bidDeleted ? " (deleted bid)" : ""}
                          </span>
                        </td>
                        <td>
                          <span className="market-pill">
                            {interview.jobMarket.name}
                            {interview.jobMarket.deletedAt ? " (deleted)" : ""}
                          </span>
                        </td>
                        <td>{interview.step}</td>
                        <td>
                          {interview.profileName}
                          {interview.profileDeleted ? " (deleted profile)" : ""}
                        </td>
                        <td>
                          <strong>
                            {displayZonedDateTimeRange(
                              interview.startAt,
                              interview.endAt,
                              interview.timeZone
                            )}
                          </strong>
                          <span>{interview.timeZone ?? "Legacy schedule"}</span>
                        </td>
                        <td>
                          <span>Bidder: {interview.bidder?.name ?? "Former member"}</span>
                          <span>Interviewer: {interview.interviewer?.name ?? "Former member"}</span>
                        </td>
                        <td>
                          <a
                            className="record-link"
                            href={interview.interviewLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExternalLink aria-hidden="true" />
                            Open
                          </a>
                        </td>
                        <td>
                          <p className="plain-notes">{interview.notes ?? "No notes"}</p>
                        </td>
                        {showActions ? (
                          <td>
                            {canDeleteInterview(interview, memberId) ? (
                              <button
                                className="secondary-action compact-action danger-action"
                                type="button"
                                disabled={deletingInterviewId === interview.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const confirmed = window.confirm(
                                    `Delete the "${interview.step}" interview for ${interview.jobTitle}?`
                                  );
                                  if (confirmed) {
                                    setDeletingInterviewId(interview.id);
                                    deleteMutation.mutate(interview.id);
                                  }
                                }}
                              >
                                {deletingInterviewId === interview.id ? (
                                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                                ) : (
                                  <Trash2 aria-hidden="true" />
                                )}
                                {deletingInterviewId === interview.id ? "Deleting" : "Delete"}
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  ) : (
                    <tr className="tracking-table-empty-row">
                      <td colSpan={showActions ? 9 : 8}>No interviews match the current view.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={interviewsQuery.data.pagination}
              disabled={interviewsQuery.isFetching}
              onPageChange={(page) => updateListQuery({ page })}
              onPageSizeChange={(pageSize) => updateListQuery({ pageSize, page: 1 })}
            />
            {interviewsQuery.isError ? (
              <p className="form-error">{errorMessage(interviewsQuery.error)}</p>
            ) : null}
          </>
        ) : null}
        {deleteMutation.isError ? (
          <p className="form-error">{errorMessage(deleteMutation.error)}</p>
        ) : null}
        {requestedInterviewQuery.isError ? (
          <p className="form-error">{errorMessage(requestedInterviewQuery.error)}</p>
        ) : null}
      </section>

      {showInterviewForm && interviewsQuery.data ? (
        <InterviewForm
          key={modalInterview?.id ?? requestedBid?.id ?? "new-interview"}
          bids={interviewFormBids}
          workspaceSlug={slug}
          initialBidId={editingInterview?.bidId ?? selectedInterview?.bidId ?? requestedBid?.id}
          initialInterview={editingInterview ?? selectedInterview ?? undefined}
          readOnly={Boolean(selectedInterview)}
          pending={interviewMutationPending}
          error={createMutation.error ?? updateMutation.error}
          onClose={closeInterviewForm}
          onSubmit={(input) => {
            if (editingInterview) {
              updateMutation.mutate({
                interviewId: editingInterview.id,
                input
              });
            } else {
              createMutation.mutate(input);
            }
          }}
        />
      ) : null}
    </WorkspaceShell>
  );
}

function InterviewForm({
  bids,
  workspaceSlug,
  initialBidId,
  initialInterview,
  readOnly,
  pending,
  error,
  onClose,
  onSubmit
}: {
  bids: Awaited<ReturnType<typeof fetchInterviews>>["bids"];
  workspaceSlug: string;
  initialBidId?: string;
  initialInterview?: InterviewRecord;
  readOnly: boolean;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (input: Parameters<typeof createInterviewRecord>[2]) => void;
}) {
  const initialBid = bids.find((bid) => bid.id === initialBidId) ?? bids[0];
  const [bidId, setBidId] = useState(initialBid?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(
    initialInterview?.profileId ?? initialBid?.profiles[0]?.id ?? ""
  );
  const [timeZone, setTimeZone] = useState(initialInterview?.timeZone ?? deviceTimeZone());
  const defaultRange = useMemo(() => interviewFormRange(initialInterview), [initialInterview]);
  const selectedBid = useMemo(() => bids.find((bid) => bid.id === bidId), [bidId, bids]);
  const formDisabled = pending || readOnly;

  return (
    <Modal
      title={
        readOnly ? "Interview Details" : initialInterview ? "Edit Interview" : "Save Interview"
      }
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
          const form = new FormData(event.currentTarget);
          if (!bidId || !selectedBid) {
            setFormError("Select a job from the search results.");
            return;
          }
          if (!profileId) {
            setFormError("Select an interview profile.");
            return;
          }
          if (!timeZone) {
            setFormError("Select a timezone from the search results.");
            return;
          }
          const date = fieldValue(form, "interviewDate");
          const startAt = zonedDateTimeToIso(date, fieldValue(form, "startTime"), timeZone);
          const endAt = zonedDateTimeToIso(date, fieldValue(form, "endTime"), timeZone);
          if (!startAt || !endAt) {
            setFormError("Enter a valid date and time range for the selected timezone.");
            return;
          }
          if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
            setFormError("Interview end time must be after the start time.");
            return;
          }
          setFormError(null);
          onSubmit({
            bidId,
            profileId,
            step: fieldValue(form, "step") as Parameters<typeof createInterviewRecord>[2]["step"],
            startAt,
            endAt,
            timeZone,
            interviewLink: fieldValue(form, "interviewLink"),
            notes: optionalFieldValue(form, "notes")
          });
        }}
      >
        <SearchableJobSelect
          bids={bids}
          selectedBidId={bidId}
          disabled={formDisabled}
          onSelect={(bid) => {
            setBidId(bid.id);
            setProfileId(bid.profiles[0]?.id ?? "");
            setFormError(null);
          }}
          onClear={() => {
            setBidId("");
            setProfileId("");
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
            {initialInterview ? (
              <span>
                Interview created by: {initialInterview.interviewer?.name ?? "Former member"}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="form-grid">
          <label>
            Interview step
            <select
              name="step"
              required
              disabled={formDisabled}
              defaultValue={initialInterview?.step ?? INTERVIEW_STEPS[0]}
            >
              {INTERVIEW_STEPS.map((step) => (
                <option key={step} value={step}>
                  {step}
                </option>
              ))}
            </select>
          </label>
          <label>
            Interview profile
            <select
              name="profileId"
              required
              value={profileId}
              disabled={formDisabled}
              onChange={(event) => {
                setProfileId(event.target.value);
                setFormError(null);
              }}
            >
              {!selectedBid ? <option value="">Select a job first</option> : null}
              {selectedBid?.profiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="schedule-fields">
          <legend>Interview schedule</legend>
          <label>
            Date
            <input
              name="interviewDate"
              type="date"
              required
              defaultValue={defaultRange.date}
              disabled={formDisabled}
            />
          </label>
          <label>
            Start time
            <input
              name="startTime"
              type="time"
              required
              defaultValue={defaultRange.startTime}
              disabled={formDisabled}
            />
          </label>
          <label>
            End time
            <input
              name="endTime"
              type="time"
              required
              defaultValue={defaultRange.endTime}
              disabled={formDisabled}
            />
          </label>
          <SearchableTimeZoneSelect
            selectedTimeZone={timeZone}
            disabled={formDisabled}
            onSelect={(zone) => {
              setTimeZone(zone);
              setFormError(null);
            }}
            onClear={() => {
              setTimeZone("");
              setFormError(null);
            }}
          />
        </fieldset>
        <div className="form-grid">
          <label>
            Interview link
            <input
              name="interviewLink"
              type="url"
              required
              disabled={formDisabled}
              defaultValue={initialInterview?.interviewLink ?? ""}
            />
            {readOnly && initialInterview ? (
              <a
                className="record-link"
                href={initialInterview.interviewLink}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                Open interview
              </a>
            ) : null}
          </label>
          <label>
            <span>
              Interview notes <span className="optional-label">Optional</span>
            </span>
            <textarea
              name="notes"
              rows={5}
              maxLength={20000}
              disabled={formDisabled}
              defaultValue={initialInterview?.notes ?? ""}
              placeholder="Recruiter details, preparation items, or follow-up context."
            />
          </label>
        </div>
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
              {pending ? "Saving" : initialInterview ? "Save changes" : "Save interview"}
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
  onSelect,
  onClear
}: {
  bids: BidRecord[];
  selectedBidId: string;
  disabled: boolean;
  onSelect: (bid: BidRecord) => void;
  onClear: () => void;
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
      <label htmlFor="interview-job-search">Job</label>
      <div className="search-input">
        <Search aria-hidden="true" />
        <input
          id="interview-job-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="interview-job-options"
          value={query}
          placeholder="Search company or job title"
          autoComplete="off"
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onClear();
          }}
        />
      </div>
      {open ? (
        <div className="job-options" id="interview-job-options" role="listbox">
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
            <p>No matching jobs</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function jobOptionLabel(bid: BidRecord): string {
  return `${bid.jobTitle} at ${bid.company}`;
}

function historicalBidForInterview(interview: InterviewRecord): BidRecord {
  return {
    id: interview.bidId,
    createdByMemberId: interview.bidder?.id ?? null,
    jobTitle: interview.jobTitle,
    company: interview.company,
    jobLink: "",
    bidAt: interview.createdAt,
    jobDescription: null,
    jobMarket: interview.jobMarket,
    profiles: [
      {
        id: interview.profileId,
        name: interview.profileName,
        createdAt: interview.createdAt,
        deletedAt: interview.profileDeleted ? interview.createdAt : null,
        resume: null
      }
    ],
    bidder: interview.bidder,
    createdAt: interview.createdAt,
    deletedAt: interview.bidDeleted ? interview.createdAt : null,
    canDelete: false,
    canEdit: false
  };
}

function SearchableTimeZoneSelect({
  selectedTimeZone,
  disabled,
  onSelect,
  onClear
}: {
  selectedTimeZone: string;
  disabled: boolean;
  onSelect: (timeZone: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState(selectedTimeZone ? timeZoneInputLabel(selectedTimeZone) : "");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => searchTimeZones(query), [query]);

  return (
    <div
      className="timezone-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <label htmlFor="interview-timezone-search">Timezone</label>
      <div className="search-input">
        <Search aria-hidden="true" />
        <input
          id="interview-timezone-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="interview-timezone-options"
          value={query}
          placeholder="Search city or timezone"
          autoComplete="off"
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onClear();
          }}
        />
      </div>
      {open ? (
        <div className="timezone-options" id="interview-timezone-options" role="listbox">
          {matches.length ? (
            matches.map((zone) => (
              <button
                type="button"
                role="option"
                aria-selected={zone.id === selectedTimeZone}
                className={zone.id === selectedTimeZone ? "selected" : undefined}
                key={zone.id}
                onClick={() => {
                  setQuery(timeZoneInputLabel(zone.id));
                  setOpen(false);
                  onSelect(zone.id);
                }}
              >
                <span>
                  <strong>{zone.friendlyName ?? zone.city}</strong>
                  <small>
                    {zone.id} | {zone.offset}
                    {zone.isDevice ? " | Device timezone" : ""}
                  </small>
                </span>
                {zone.id === selectedTimeZone ? <Check aria-hidden="true" /> : null}
              </button>
            ))
          ) : (
            <p>No matching timezones</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function interviewFormRange(interview?: InterviewRecord) {
  if (!interview) {
    return defaultInterviewRange();
  }
  const timeZone = interview.timeZone ?? deviceTimeZone();
  try {
    return {
      date: zonedInputValue(interview.startAt, timeZone, "date"),
      startTime: zonedInputValue(interview.startAt, timeZone, "time"),
      endTime: zonedInputValue(
        interview.endAt ??
          new Date(new Date(interview.startAt).getTime() + 60 * 60 * 1000).toISOString(),
        timeZone,
        "time"
      )
    };
  } catch {
    return defaultInterviewRange();
  }
}

function zonedInputValue(value: string, timeZone: string, type: "date" | "time"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return type === "date"
    ? `${values.year}-${values.month}-${values.day}`
    : `${values.hour}:${values.minute}`;
}

function defaultInterviewRange() {
  let start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30);
  let end = new Date(start.getTime() + 60 * 60 * 1000);
  if (localDateValue(start) !== localDateValue(end)) {
    start = new Date(start);
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  return {
    date: localDateValue(start),
    startTime: localTimeValue(start),
    endTime: localTimeValue(end)
  };
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

function canEditInterview(interview: InterviewRecord, memberId: string): boolean {
  return interview.canEdit && interview.createdByMemberId === memberId;
}

function canDeleteInterview(interview: InterviewRecord, memberId: string): boolean {
  return interview.canDelete && interview.createdByMemberId === memberId;
}
