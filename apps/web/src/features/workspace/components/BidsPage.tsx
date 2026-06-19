import { isRichTextEmpty, type RichTextDocument } from "@rghs1/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarPlus,
  ExternalLink,
  FileUp,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import { paths } from "../../../routing/paths";
import type { AuthSession } from "../../../services/auth.service";
import {
  createBid,
  deleteBid as deleteBidRecord,
  fetchBids,
  updateBid,
  type BidRecord,
  type TrackingListQuery
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { displayDate, localDateTimeToIso, localDateTimeValue } from "../../../utils/datetime";
import { fieldValue } from "../../../utils/form";
import { matchingCompanyBids } from "../company-name-match";
import { plainTextToRichText } from "../csv-bid-import";
import { BulkBidImportModal } from "./BulkBidImportModal";
import { PaginationControls } from "./PaginationControls";
import { RichTextContent, RichTextEditor } from "./RichTextEditor";
import { TrackingListControls } from "./TrackingListControls";
import { WorkspaceShell } from "./WorkspaceShell";

const initialQuery: TrackingListQuery = {
  page: 1,
  pageSize: 20,
  sortBy: "datetime",
  sortDirection: "desc"
};

export function BidsPage({
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [listQuery, setListQuery] = useState<TrackingListQuery>(initialQuery);
  const [creating, setCreating] = useState(false);
  const [editingBid, setEditingBid] = useState<BidRecord | null>(null);
  const [selectedBid, setSelectedBid] = useState<BidRecord | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState<RichTextDocument | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [profileResumes, setProfileResumes] = useState<Record<string, string>>({});
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);
  const [deletingBidId, setDeletingBidId] = useState<string | null>(null);
  const bidsQuery = useQuery({
    queryKey: ["tracking-bids", slug, memberId, listQuery],
    queryFn: () => fetchBids(session, slug, listQuery)
  });
  const updateListQuery = useCallback((change: Partial<TrackingListQuery>) => {
    setListQuery((current) => ({ ...current, ...change }));
  }, []);
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createBid>[2]) => createBid(session, slug, input),
    onSuccess: async () => {
      setCreating(false);
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ bidId, input }: { bidId: string; input: Parameters<typeof updateBid>[3] }) =>
      updateBid(session, slug, bidId, input),
    onSuccess: async () => {
      setCreating(false);
      setEditingBid(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (bidId: string) => deleteBidRecord(session, slug, bidId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
    },
    onSettled: () => setDeletingBidId(null)
  });
  const companyMatches = useMemo(
    () => matchingCompanyBids(company, bidsQuery.data?.suggestionBids ?? []),
    [company, bidsQuery.data?.suggestionBids]
  );
  const modalBid = editingBid ?? selectedBid;
  const formProfiles = useMemo(
    () => [
      ...new Map(
        [...(bidsQuery.data?.profiles ?? []), ...(modalBid?.profiles ?? [])].map((profile) => [
          profile.id,
          profile
        ])
      ).values()
    ],
    [bidsQuery.data?.profiles, modalBid]
  );
  const formMarkets = useMemo(
    () => [
      ...new Map(
        [...(bidsQuery.data?.markets ?? []), ...(modalBid ? [modalBid.jobMarket] : [])].map(
          (market) => [market.id, market]
        )
      ).values()
    ],
    [bidsQuery.data?.markets, modalBid]
  );
  const showActions = Boolean(
    bidsQuery.data?.bids.some(
      (bid) =>
        canDeleteBid(bid, memberId) ||
        (bidsQuery.data?.canCreateInterview && bid.profiles.some((profile) => !profile.deletedAt))
    )
  );
  const bidMutationPending = createMutation.isPending || updateMutation.isPending;
  const bidFormDisabled = bidMutationPending || Boolean(selectedBid);

  useEffect(() => {
    setCreating(false);
    setEditingBid(null);
    setSelectedBid(null);
    setBulkImporting(false);
  }, [memberId]);

  function openBidForm() {
    setCompany("");
    setJobTitle("");
    setJobLink("");
    setJobDescription(null);
    setSelectedProfileIds([]);
    setProfileResumes({});
    setSelectedBidId(null);
    setEditingBid(null);
    setSelectedBid(null);
    setFormError(null);
    createMutation.reset();
    updateMutation.reset();
    setCreating(true);
  }

  function openBidEdit(bid: BidRecord) {
    populateBidForm(bid);
    setEditingBid(bid);
    setSelectedBid(null);
    createMutation.reset();
    updateMutation.reset();
    setCreating(true);
  }

  function openBidView(bid: BidRecord) {
    if (canEditBid(bid, memberId)) {
      openBidEdit(bid);
      return;
    }
    populateBidForm(bid);
    setEditingBid(null);
    setSelectedBid(bid);
    setCreating(true);
  }

  function populateBidForm(bid: BidRecord) {
    setCompany(bid.company);
    setJobTitle(bid.jobTitle);
    setJobLink(bid.jobLink);
    setJobDescription(
      typeof bid.jobDescription === "string"
        ? (plainTextToRichText(bid.jobDescription) ?? null)
        : bid.jobDescription
    );
    setSelectedProfileIds(bid.profiles.map((profile) => profile.id));
    setProfileResumes(
      Object.fromEntries(bid.profiles.map((profile) => [profile.id, profile.resume ?? ""]))
    );
    setSelectedBidId(null);
    setFormError(null);
  }

  function closeBidForm() {
    if (!createMutation.isPending && !updateMutation.isPending) {
      setCreating(false);
      setEditingBid(null);
      setSelectedBid(null);
      setFormError(null);
    }
  }

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="bids"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <BriefcaseBusiness aria-hidden="true" />
            <h3>Bid Tracking</h3>
          </div>
          <div className="panel-actions">
            <button
              className="icon-button"
              type="button"
              title="Refresh bids"
              aria-label="Refresh bids"
              disabled={bidsQuery.isFetching}
              onClick={() => void bidsQuery.refetch()}
            >
              <RefreshCw
                className={bidsQuery.isFetching ? "spin-icon" : undefined}
                aria-hidden="true"
              />
            </button>
            {bidsQuery.data?.canCreate ? (
              <>
                <button
                  className="secondary-action small"
                  type="button"
                  disabled={!bidsQuery.data.markets.length}
                  onClick={() => setBulkImporting(true)}
                >
                  <FileUp aria-hidden="true" />
                  Import CSV
                </button>
                <button
                  className="primary-action small"
                  type="button"
                  disabled={!bidsQuery.data.profiles.length || !bidsQuery.data.markets.length}
                  title={
                    !bidsQuery.data.profiles.length
                      ? "An admin must add a profile first"
                      : !bidsQuery.data.markets.length
                        ? "An admin must add a job market first"
                        : undefined
                  }
                  onClick={openBidForm}
                >
                  <Plus aria-hidden="true" />
                  Save bid
                </button>
              </>
            ) : null}
          </div>
        </div>

        {bidsQuery.data ? (
          <TrackingListControls
            query={listQuery}
            profiles={bidsQuery.data.filterProfiles}
            markets={bidsQuery.data.filterMarkets}
            disabled={bidsQuery.isFetching}
            onChange={updateListQuery}
          />
        ) : null}

        {bidsQuery.isError ? (
          <p className="form-error">{errorMessage(bidsQuery.error)}</p>
        ) : bidsQuery.isLoading ? (
          <RecordLoading label="Loading bids" />
        ) : bidsQuery.data?.bids.length ? (
          <>
            <div className="table-wrap">
              <table className="tracking-table tracking-record-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Market</th>
                    <th>Profiles</th>
                    <th>Resumes</th>
                    <th>Bidder</th>
                    <th>Bid date</th>
                    <th>Job link</th>
                    {showActions ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {bidsQuery.data.bids.map((bid) => (
                    <tr
                      key={bid.id}
                      className={`tracking-row-clickable${
                        deletingBidId === bid.id ? " tenant-row-pending" : ""
                      }`}
                      aria-busy={deletingBidId === bid.id}
                      tabIndex={0}
                      onClick={() => openBidView(bid)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openBidView(bid);
                        }
                      }}
                    >
                      <td>
                        <strong>{bid.jobTitle}</strong>
                        <span>{bid.company}</span>
                        {bid.jobDescription ? (
                          <details
                            className="record-details"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <summary>Description</summary>
                            <RichTextContent value={bid.jobDescription} />
                          </details>
                        ) : null}
                      </td>
                      <td>
                        <span className="market-pill">
                          {bid.jobMarket.name}
                          {bid.jobMarket.deletedAt ? " (deleted)" : ""}
                        </span>
                      </td>
                      <td>
                        <div className="profile-tags">
                          {bid.profiles.map((profile) => (
                            <span
                              className={profile.deletedAt ? "deleted-profile-tag" : undefined}
                              key={profile.id}
                            >
                              {profile.name}
                              {profile.deletedAt ? " (deleted)" : ""}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="resume-list">
                          {bid.profiles.map((profile) => (
                            <details
                              className="record-details"
                              key={profile.id}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <summary>{profile.name}</summary>
                              <p className="plain-resume">
                                {profile.resume ?? "No resume stored."}
                              </p>
                            </details>
                          ))}
                        </div>
                      </td>
                      <td>{bid.bidder?.name ?? "Former member"}</td>
                      <td>{displayDate(bid.bidAt)}</td>
                      <td>
                        <div className="record-links">
                          <a
                            href={bid.jobLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExternalLink aria-hidden="true" />
                            Open
                          </a>
                        </div>
                      </td>
                      {showActions ? (
                        <td>
                          <div className="record-actions">
                            {bidsQuery.data.canCreateInterview &&
                            bid.profiles.some((profile) => !profile.deletedAt) ? (
                              <button
                                className="secondary-action compact-action"
                                type="button"
                                disabled={deletingBidId === bid.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(paths.workspaceInterviewForBid(slug, bid.id));
                                }}
                              >
                                <CalendarPlus aria-hidden="true" />
                                Interview
                              </button>
                            ) : null}
                            {canDeleteBid(bid, memberId) ? (
                              <button
                                className="secondary-action compact-action danger-action"
                                type="button"
                                disabled={deletingBidId === bid.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const confirmed = window.confirm(
                                    `Delete the bid for "${bid.jobTitle}" at ${bid.company}? Existing interview history will be preserved.`
                                  );
                                  if (confirmed) {
                                    setDeletingBidId(bid.id);
                                    deleteMutation.mutate(bid.id);
                                  }
                                }}
                              >
                                {deletingBidId === bid.id ? (
                                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                                ) : (
                                  <Trash2 aria-hidden="true" />
                                )}
                                {deletingBidId === bid.id ? "Deleting" : "Delete"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls
              pagination={bidsQuery.data.pagination}
              disabled={bidsQuery.isFetching}
              onPageChange={(page) => updateListQuery({ page })}
              onPageSizeChange={(pageSize) => updateListQuery({ pageSize, page: 1 })}
            />
          </>
        ) : (
          <div className="admin-empty-state">
            <span>No bids match the current view.</span>
          </div>
        )}
        {deleteMutation.isError ? (
          <p className="form-error">{errorMessage(deleteMutation.error)}</p>
        ) : null}
      </section>

      {creating && bidsQuery.data ? (
        <Modal
          title={selectedBid ? "Bid Details" : editingBid ? "Edit Bid" : "Save Bid"}
          size="large"
          onClose={closeBidForm}
        >
          <form
            className="modal-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (selectedBid) {
                return;
              }
              const form = new FormData(event.currentTarget);
              if (!selectedProfileIds.length) {
                setFormError("Select at least one bid profile.");
                return;
              }
              const bidAt = localDateTimeToIso(fieldValue(form, "bidAt"));
              if (!bidAt) {
                setFormError("Enter a valid bid date and time.");
                return;
              }
              setFormError(null);
              const input = {
                jobTitle: fieldValue(form, "jobTitle"),
                company: fieldValue(form, "company"),
                jobLink: fieldValue(form, "jobLink"),
                bidAt,
                jobMarketId: fieldValue(form, "jobMarketId"),
                jobDescription:
                  jobDescription && !isRichTextEmpty(jobDescription) ? jobDescription : undefined,
                profileIds: selectedProfileIds,
                profileResumes: selectedProfileIds.flatMap((profileId) => {
                  const resume = profileResumes[profileId]?.trim();
                  return resume ? [{ profileId, resume }] : [];
                })
              };
              if (editingBid) {
                updateMutation.mutate({ bidId: editingBid.id, input });
              } else {
                createMutation.mutate(input);
              }
            }}
          >
            <div className="form-grid">
              <label>
                Job company
                <input
                  name="company"
                  required
                  minLength={2}
                  maxLength={180}
                  autoComplete="organization"
                  value={company}
                  disabled={bidFormDisabled}
                  onChange={(event) => {
                    setCompany(event.target.value);
                    setSelectedBidId(null);
                    setFormError(null);
                  }}
                />
              </label>
              <label>
                Job market
                <select
                  name="jobMarketId"
                  required
                  defaultValue={modalBid?.jobMarket.id ?? bidsQuery.data.markets[0]?.id}
                  disabled={bidFormDisabled}
                >
                  {formMarkets.map((market) => (
                    <option value={market.id} key={market.id}>
                      {market.name}
                      {market.deletedAt ? " (deleted)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedBid ? (
                <label>
                  Bid created by
                  <input value={selectedBid.bidder?.name ?? "Former member"} disabled readOnly />
                </label>
              ) : null}
            </div>

            {!modalBid && companyMatches.length ? (
              <section className="bid-company-matches" aria-live="polite">
                <h4>Similar company bids</h4>
                <div className="table-wrap">
                  <table className="bid-match-table">
                    <thead>
                      <tr>
                        <th>Date/time</th>
                        <th>Company name</th>
                        <th>Job title</th>
                        <th>Job link</th>
                        <th>Profiles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyMatches.map((bid) => (
                        <tr
                          key={bid.id}
                          className={selectedBidId === bid.id ? "bid-match-selected" : undefined}
                        >
                          <td>{displayDate(bid.bidAt)}</td>
                          <td>{bid.company}</td>
                          <td>
                            <button
                              className="bid-match-select"
                              type="button"
                              disabled={bidFormDisabled}
                              aria-pressed={selectedBidId === bid.id}
                              aria-label={`Use job details for ${bid.jobTitle}`}
                              onClick={() => {
                                setJobTitle(bid.jobTitle);
                                setJobLink(bid.jobLink);
                                setSelectedBidId(bid.id);
                                setFormError(null);
                              }}
                            >
                              {bid.jobTitle}
                            </button>
                          </td>
                          <td>
                            <a
                              className="record-link"
                              href={bid.jobLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink aria-hidden="true" />
                              Open
                            </a>
                          </td>
                          <td>
                            <div className="profile-tags compact-profile-tags">
                              {bid.profiles.map((profile) => (
                                <span key={profile.id}>{profile.name}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <div className="form-grid">
              <label>
                Job title
                <input
                  name="jobTitle"
                  required
                  minLength={2}
                  maxLength={180}
                  value={jobTitle}
                  disabled={bidFormDisabled}
                  onChange={(event) => {
                    setJobTitle(event.target.value);
                    setSelectedBidId(null);
                    setFormError(null);
                  }}
                />
              </label>
              <label>
                Job link
                <input
                  name="jobLink"
                  type="url"
                  required
                  value={jobLink}
                  disabled={bidFormDisabled}
                  onChange={(event) => {
                    setJobLink(event.target.value);
                    setSelectedBidId(null);
                    setFormError(null);
                  }}
                />
                {selectedBid ? (
                  <a
                    className="record-link"
                    href={selectedBid.jobLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" />
                    Open job posting
                  </a>
                ) : null}
              </label>
            </div>
            <label>
              Bid date and time
              <input
                name="bidAt"
                type="datetime-local"
                required
                defaultValue={localDateTimeValue(modalBid ? new Date(modalBid.bidAt) : new Date())}
                disabled={bidFormDisabled}
              />
            </label>
            <label>
              <span>
                Job description <span className="optional-label">Optional</span>
              </span>
              <RichTextEditor
                value={jobDescription}
                disabled={bidFormDisabled}
                onChange={setJobDescription}
              />
            </label>
            <fieldset className="profile-selector">
              <legend>Bid profiles</legend>
              {formProfiles.map((profile) => (
                <label key={profile.id}>
                  <input
                    type="checkbox"
                    value={profile.id}
                    checked={selectedProfileIds.includes(profile.id)}
                    disabled={bidFormDisabled}
                    onChange={(event) => {
                      setSelectedProfileIds((current) =>
                        event.target.checked
                          ? [...current, profile.id]
                          : current.filter((profileId) => profileId !== profile.id)
                      );
                      if (!event.target.checked) {
                        setProfileResumes((current) => {
                          const next = { ...current };
                          delete next[profile.id];
                          return next;
                        });
                      }
                      setFormError(null);
                    }}
                  />
                  {profile.name}
                </label>
              ))}
            </fieldset>
            {selectedProfileIds.length ? (
              <fieldset className="profile-resume-editor">
                <legend>Resume per profile (optional)</legend>
                {selectedProfileIds.map((profileId) => {
                  const profile = formProfiles.find((item) => item.id === profileId);
                  if (!profile) {
                    return null;
                  }
                  return (
                    <label key={profile.id}>
                      <span>
                        {profile.name} <span className="optional-label">Optional</span>
                      </span>
                      <textarea
                        rows={8}
                        maxLength={50000}
                        value={profileResumes[profile.id] ?? ""}
                        disabled={bidFormDisabled}
                        placeholder={`Paste the resume used for ${profile.name}`}
                        onChange={(event) => {
                          setProfileResumes((current) => ({
                            ...current,
                            [profile.id]: event.target.value
                          }));
                          setFormError(null);
                        }}
                      />
                    </label>
                  );
                })}
              </fieldset>
            ) : null}
            {formError ? <p className="form-error">{formError}</p> : null}
            {createMutation.isError || updateMutation.isError ? (
              <p className="form-error">
                {errorMessage(createMutation.error ?? updateMutation.error)}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={bidMutationPending}
                onClick={closeBidForm}
              >
                <X aria-hidden="true" />
                {selectedBid ? "Close" : "Cancel"}
              </button>
              {!selectedBid ? (
                <button
                  className="primary-action small"
                  type="submit"
                  disabled={bidMutationPending}
                >
                  <Save aria-hidden="true" />
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving"
                    : editingBid
                      ? "Save changes"
                      : "Save bid"}
                </button>
              ) : null}
            </div>
          </form>
        </Modal>
      ) : null}
      {bulkImporting && bidsQuery.data ? (
        <BulkBidImportModal
          session={session}
          slug={slug}
          memberId={memberId}
          profiles={bidsQuery.data.profiles}
          markets={bidsQuery.data.markets}
          onClose={() => setBulkImporting(false)}
          onImported={() => setBulkImporting(false)}
        />
      ) : null}
    </WorkspaceShell>
  );
}

function RecordLoading({ label }: { label: string }) {
  return (
    <div className="admin-empty-state">
      <LoaderCircle className="spin-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function canEditBid(bid: BidRecord, memberId: string): boolean {
  return bid.canEdit && bid.createdByMemberId === memberId;
}

function canDeleteBid(bid: BidRecord, memberId: string): boolean {
  return bid.canDelete && bid.createdByMemberId === memberId;
}
