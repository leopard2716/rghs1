import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, LoaderCircle, Plus, RefreshCw, Save, Trash2, UserRound, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  createTrackingJobMarket,
  createTrackingProfile,
  deleteTrackingJobMarket,
  deleteTrackingProfile,
  fetchTrackingProfiles
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { displayDate } from "../../../utils/datetime";
import { fieldValue } from "../../../utils/form";
import { WorkspaceShell } from "./WorkspaceShell";

export function TrackingProfilesPage({
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
  const [creating, setCreating] = useState(false);
  const [creatingMarket, setCreatingMarket] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [deletingMarketId, setDeletingMarketId] = useState<string | null>(null);
  const profilesQuery = useQuery({
    queryKey: ["tracking-profiles", slug, memberId],
    queryFn: () => fetchTrackingProfiles(session, slug)
  });
  const createMutation = useMutation({
    mutationFn: (name: string) => createTrackingProfile(session, slug, name),
    onSuccess: async () => {
      setCreating(false);
      await invalidateTracking(queryClient, slug);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (profileId: string) => deleteTrackingProfile(session, slug, profileId),
    onSuccess: async () => {
      await invalidateTracking(queryClient, slug);
    },
    onSettled: () => setDeletingProfileId(null)
  });
  const createMarketMutation = useMutation({
    mutationFn: (name: string) => createTrackingJobMarket(session, slug, name),
    onSuccess: async () => {
      setCreatingMarket(false);
      await invalidateTracking(queryClient, slug);
    }
  });
  const deleteMarketMutation = useMutation({
    mutationFn: (marketId: string) => deleteTrackingJobMarket(session, slug, marketId),
    onSuccess: async () => {
      await invalidateTracking(queryClient, slug);
    },
    onSettled: () => setDeletingMarketId(null)
  });

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="profiles"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <UserRound aria-hidden="true" />
            <h3>Profiles</h3>
          </div>
          <div className="panel-actions">
            <button
              className="icon-button"
              type="button"
              title="Refresh profiles"
              aria-label="Refresh profiles"
              disabled={profilesQuery.isFetching}
              onClick={() => void profilesQuery.refetch()}
            >
              <RefreshCw
                className={profilesQuery.isFetching ? "spin-icon" : undefined}
                aria-hidden="true"
              />
            </button>
            {profilesQuery.data?.canCreate ? (
              <button
                className="primary-action small"
                type="button"
                onClick={() => {
                  createMutation.reset();
                  setCreating(true);
                }}
              >
                <Plus aria-hidden="true" />
                Add profile
              </button>
            ) : null}
          </div>
        </div>

        {profilesQuery.isError ? (
          <p className="form-error">{errorMessage(profilesQuery.error)}</p>
        ) : profilesQuery.isLoading ? (
          <LoadingRecords label="Loading profiles" />
        ) : profilesQuery.data?.profiles.length ? (
          <div className="table-wrap">
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Created</th>
                  {profilesQuery.data.canDelete ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {profilesQuery.data.profiles.map((profile) => (
                  <tr
                    key={profile.id}
                    className={deletingProfileId === profile.id ? "tenant-row-pending" : undefined}
                    aria-busy={deletingProfileId === profile.id}
                  >
                    <td>
                      <strong>{profile.name}</strong>
                    </td>
                    <td>{displayDate(profile.createdAt)}</td>
                    {profilesQuery.data.canDelete ? (
                      <td>
                        <button
                          className="secondary-action compact-action danger-action"
                          type="button"
                          disabled={Boolean(deletingProfileId)}
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Delete profile "${profile.name}"? Existing bid and interview history will keep this profile name.`
                            );
                            if (confirmed) {
                              setDeletingProfileId(profile.id);
                              deleteMutation.mutate(profile.id);
                            }
                          }}
                        >
                          {deletingProfileId === profile.id ? (
                            <LoaderCircle className="spin-icon" aria-hidden="true" />
                          ) : (
                            <Trash2 aria-hidden="true" />
                          )}
                          {deletingProfileId === profile.id ? "Deleting" : "Delete"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyRecords label="No profiles have been added." />
        )}
        {deleteMutation.isError ? (
          <p className="form-error">{errorMessage(deleteMutation.error)}</p>
        ) : null}
      </section>

      <section className="panel tracking-markets-panel">
        <div className="panel-header">
          <div>
            <Globe2 aria-hidden="true" />
            <h3>Job Markets</h3>
          </div>
          {profilesQuery.data?.canManageMarkets ? (
            <button
              className="primary-action small"
              type="button"
              onClick={() => {
                createMarketMutation.reset();
                setCreatingMarket(true);
              }}
            >
              <Plus aria-hidden="true" />
              Add market
            </button>
          ) : null}
        </div>
        {profilesQuery.isLoading ? (
          <LoadingRecords label="Loading job markets" />
        ) : profilesQuery.data?.markets.length ? (
          <div className="market-card-grid">
            {profilesQuery.data.markets.map((market) => (
              <article
                className={deletingMarketId === market.id ? "tenant-row-pending" : undefined}
                aria-busy={deletingMarketId === market.id}
                key={market.id}
              >
                <div>
                  <strong>{market.name}</strong>
                  <span>{market.system ? "Built-in" : "Custom"}</span>
                </div>
                {profilesQuery.data.canManageMarkets && market.canDelete ? (
                  <button
                    className="icon-button danger-icon-button"
                    type="button"
                    title={`Delete ${market.name}`}
                    aria-label={`Delete ${market.name}`}
                    disabled={Boolean(deletingMarketId)}
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Delete job market "${market.name}"? Existing bid and interview history will preserve it.`
                      );
                      if (confirmed) {
                        setDeletingMarketId(market.id);
                        deleteMarketMutation.mutate(market.id);
                      }
                    }}
                  >
                    {deletingMarketId === market.id ? (
                      <LoaderCircle className="spin-icon" aria-hidden="true" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyRecords label="No active job markets are available." />
        )}
        {deleteMarketMutation.isError ? (
          <p className="form-error">{errorMessage(deleteMarketMutation.error)}</p>
        ) : null}
      </section>

      {creating ? (
        <Modal
          title="Add Profile"
          onClose={() => {
            if (!createMutation.isPending) {
              setCreating(false);
            }
          }}
        >
          <form
            className="modal-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              createMutation.mutate(fieldValue(new FormData(event.currentTarget), "name"));
            }}
          >
            <label>
              Profile name
              <input name="name" required minLength={2} maxLength={120} autoComplete="off" />
            </label>
            {createMutation.isError ? (
              <p className="form-error">{errorMessage(createMutation.error)}</p>
            ) : null}
            <div className="modal-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={createMutation.isPending}
                onClick={() => setCreating(false)}
              >
                <X aria-hidden="true" />
                Cancel
              </button>
              <button
                className="primary-action small"
                type="submit"
                disabled={createMutation.isPending}
              >
                <Save aria-hidden="true" />
                {createMutation.isPending ? "Saving" : "Save profile"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {creatingMarket ? (
        <Modal
          title="Add Job Market"
          onClose={() => {
            if (!createMarketMutation.isPending) {
              setCreatingMarket(false);
            }
          }}
        >
          <form
            className="modal-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              createMarketMutation.mutate(fieldValue(new FormData(event.currentTarget), "name"));
            }}
          >
            <label>
              Market name
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                placeholder="Canada Job Market"
              />
            </label>
            {createMarketMutation.isError ? (
              <p className="form-error">{errorMessage(createMarketMutation.error)}</p>
            ) : null}
            <div className="modal-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={createMarketMutation.isPending}
                onClick={() => setCreatingMarket(false)}
              >
                <X aria-hidden="true" />
                Cancel
              </button>
              <button
                className="primary-action small"
                type="submit"
                disabled={createMarketMutation.isPending}
              >
                <Save aria-hidden="true" />
                {createMarketMutation.isPending ? "Saving" : "Save market"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </WorkspaceShell>
  );
}

function LoadingRecords({ label }: { label: string }) {
  return (
    <div className="admin-empty-state">
      <LoaderCircle className="spin-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function EmptyRecords({ label }: { label: string }) {
  return (
    <div className="admin-empty-state">
      <span>{label}</span>
    </div>
  );
}

async function invalidateTracking(queryClient: ReturnType<typeof useQueryClient>, slug: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tracking-profiles", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
  ]);
}
