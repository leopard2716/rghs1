import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Edit3,
  Globe2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useState } from "react";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  createTrackingJobMarket,
  createTrackingProfile,
  deleteTrackingJobMarket,
  deleteTrackingProfile,
  fetchTrackingProfiles,
  updateTrackingProfile,
  type TrackingProfile,
  type TrackingProfileCareerExperience,
  type TrackingProfileInput
} from "../../../services/tracking.service";
import type { WorkspaceSession } from "../../../services/workspace.service";
import { displayDate } from "../../../utils/datetime";
import { fieldValue, optionalFieldValue } from "../../../utils/form";
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
  const [editingProfile, setEditingProfile] = useState<TrackingProfile | null>(null);
  const [creatingMarket, setCreatingMarket] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [deletingMarketId, setDeletingMarketId] = useState<string | null>(null);
  const profilesQuery = useQuery({
    queryKey: ["tracking-profiles", slug, memberId],
    queryFn: () => fetchTrackingProfiles(session, slug)
  });
  const createMutation = useMutation({
    mutationFn: (input: TrackingProfileInput) => createTrackingProfile(session, slug, input),
    onSuccess: async () => {
      setCreating(false);
      await invalidateTracking(queryClient, slug);
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ profileId, input }: { profileId: string; input: TrackingProfileInput }) =>
      updateTrackingProfile(session, slug, profileId, input),
    onSuccess: async () => {
      setEditingProfile(null);
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
  const profileFormPending = createMutation.isPending || updateMutation.isPending;
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
                  updateMutation.reset();
                  setEditingProfile(null);
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
            <table className="tracking-table tracking-profiles-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Contact</th>
                  <th>Career</th>
                  <th>Created</th>
                  {profilesQuery.data.canEdit || profilesQuery.data.canDelete ? (
                    <th>Actions</th>
                  ) : null}
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
                      <span>{profileDisplayName(profile) || "Personal name not set"}</span>
                    </td>
                    <td>
                      <strong>{profile.email || "Email not set"}</strong>
                      <span>{profile.phoneNumber || "Phone not set"}</span>
                      <span>{profileLocation(profile) || "Address not set"}</span>
                    </td>
                    <td>
                      <strong>
                        {profile.careerExperiences?.[0]?.companyName || "No company set"}
                      </strong>
                      <span>
                        {profile.careerExperiences?.length
                          ? `${profile.careerExperiences.length} career entr${
                              profile.careerExperiences.length === 1 ? "y" : "ies"
                            }`
                          : "No career history"}
                      </span>
                    </td>
                    <td>{displayDate(profile.createdAt)}</td>
                    {profilesQuery.data.canEdit || profilesQuery.data.canDelete ? (
                      <td>
                        <div className="table-action-row">
                          {profilesQuery.data.canEdit ? (
                            <button
                              className="secondary-action compact-action"
                              type="button"
                              disabled={Boolean(deletingProfileId)}
                              onClick={() => {
                                createMutation.reset();
                                updateMutation.reset();
                                setCreating(false);
                                setEditingProfile(profile);
                              }}
                            >
                              <Edit3 aria-hidden="true" />
                              Edit
                            </button>
                          ) : null}
                          {profilesQuery.data.canDelete ? (
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
                          ) : null}
                        </div>
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

      {creating || editingProfile ? (
        <ProfileFormModal
          initialProfile={editingProfile}
          pending={profileFormPending}
          error={createMutation.error ?? updateMutation.error}
          onClose={() => {
            if (!profileFormPending) {
              setCreating(false);
              setEditingProfile(null);
            }
          }}
          onSubmit={(input) => {
            if (editingProfile) {
              updateMutation.mutate({ profileId: editingProfile.id, input });
            } else {
              createMutation.mutate(input);
            }
          }}
        />
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

function ProfileFormModal({
  initialProfile,
  pending,
  error,
  onClose,
  onSubmit
}: {
  initialProfile: TrackingProfile | null;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (input: TrackingProfileInput) => void;
}) {
  const [careerExperiences, setCareerExperiences] = useState<TrackingProfileCareerExperience[]>(
    () =>
      initialProfile?.careerExperiences?.length
        ? initialProfile.careerExperiences.map((experience) => ({ ...experience }))
        : [emptyCareerExperience()]
  );

  function updateCareerExperience(index: number, patch: Partial<TrackingProfileCareerExperience>) {
    setCareerExperiences((current) =>
      current.map((experience, itemIndex) =>
        itemIndex === index ? { ...experience, ...patch } : experience
      )
    );
  }

  return (
    <Modal title={initialProfile ? "Edit Profile" : "Add Profile"} size="large" onClose={onClose}>
      <form
        className="modal-form profile-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSubmit(profileInputFromForm(new FormData(event.currentTarget), careerExperiences));
        }}
      >
        <section className="profile-form-section">
          <h4>Identity</h4>
          <div className="form-grid">
            <label>
              Original profile name
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                defaultValue={initialProfile?.name ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              First name
              <input
                name="firstName"
                required
                maxLength={120}
                autoComplete="given-name"
                defaultValue={initialProfile?.firstName ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              <span>
                Middle name <span className="optional-label">Optional</span>
              </span>
              <input
                name="middleName"
                maxLength={120}
                autoComplete="additional-name"
                defaultValue={initialProfile?.middleName ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Last name
              <input
                name="lastName"
                required
                maxLength={120}
                autoComplete="family-name"
                defaultValue={initialProfile?.lastName ?? ""}
                disabled={pending}
              />
            </label>
            <fieldset className="profile-radio-group">
              <legend>Gender</legend>
              <label>
                <input
                  type="radio"
                  name="gender"
                  value="man"
                  required
                  defaultChecked={initialProfile?.gender === "man"}
                  disabled={pending}
                />
                Man
              </label>
              <label>
                <input
                  type="radio"
                  name="gender"
                  value="woman"
                  required
                  defaultChecked={initialProfile?.gender === "woman"}
                  disabled={pending}
                />
                Woman
              </label>
            </fieldset>
            <label>
              Date of birth
              <input
                name="dateOfBirth"
                type="date"
                required
                autoComplete="bday"
                defaultValue={dateInputValue(initialProfile?.dateOfBirth)}
                disabled={pending}
              />
            </label>
          </div>
        </section>

        <section className="profile-form-section">
          <h4>Contact</h4>
          <div className="form-grid">
            <label>
              Email
              <input
                name="email"
                type="email"
                maxLength={320}
                autoComplete="email"
                defaultValue={initialProfile?.email ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Phone number
              <input
                name="phoneNumber"
                type="tel"
                maxLength={50}
                autoComplete="tel"
                defaultValue={initialProfile?.phoneNumber ?? ""}
                disabled={pending}
              />
            </label>
            <label className="profile-full-field">
              Street
              <input
                name="street"
                maxLength={180}
                autoComplete="address-line1"
                defaultValue={initialProfile?.street ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              City
              <input
                name="city"
                maxLength={120}
                autoComplete="address-level2"
                defaultValue={initialProfile?.city ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              State
              <input
                name="state"
                maxLength={120}
                autoComplete="address-level1"
                defaultValue={initialProfile?.state ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Country
              <input
                name="country"
                maxLength={120}
                autoComplete="country-name"
                defaultValue={initialProfile?.country ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Zip/postal code
              <input
                name="postalCode"
                maxLength={40}
                autoComplete="postal-code"
                defaultValue={initialProfile?.postalCode ?? ""}
                disabled={pending}
              />
            </label>
            <label className="profile-full-field">
              LinkedIn URL
              <input
                name="linkedinUrl"
                type="url"
                maxLength={2000}
                placeholder="https://www.linkedin.com/in/profile"
                defaultValue={initialProfile?.linkedinUrl ?? ""}
                disabled={pending}
              />
            </label>
          </div>
        </section>

        <section className="profile-form-section">
          <h4>Education</h4>
          <div className="form-grid">
            <label>
              University
              <input
                name="educationUniversity"
                maxLength={180}
                defaultValue={initialProfile?.education?.university ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Location
              <input
                name="educationLocation"
                maxLength={180}
                defaultValue={initialProfile?.education?.location ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Degree
              <input
                name="educationDegree"
                maxLength={180}
                defaultValue={initialProfile?.education?.degree ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              Major
              <input
                name="educationMajor"
                maxLength={180}
                defaultValue={initialProfile?.education?.major ?? ""}
                disabled={pending}
              />
            </label>
            <label>
              From
              <input
                name="educationDateFrom"
                type="date"
                defaultValue={dateInputValue(initialProfile?.education?.dateFrom)}
                disabled={pending}
              />
            </label>
            <label>
              To
              <input
                name="educationDateTo"
                type="date"
                defaultValue={dateInputValue(initialProfile?.education?.dateTo)}
                disabled={pending}
              />
            </label>
          </div>
        </section>

        <section className="profile-form-section">
          <div className="profile-section-header">
            <h4>Career Experience</h4>
            <button
              className="secondary-action compact-action"
              type="button"
              disabled={pending}
              onClick={() =>
                setCareerExperiences((current) => [...current, emptyCareerExperience()])
              }
            >
              <Plus aria-hidden="true" />
              Add new
            </button>
          </div>
          <div className="profile-career-list">
            {careerExperiences.map((experience, index) => (
              <fieldset className="profile-career-entry" key={index}>
                <legend>{index + 1}. Career experience</legend>
                <div className="form-grid">
                  <label>
                    Company name
                    <input
                      maxLength={180}
                      value={experience.companyName ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        updateCareerExperience(index, { companyName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Job title
                    <input
                      maxLength={180}
                      value={experience.jobTitle ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        updateCareerExperience(index, { jobTitle: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Company location
                    <input
                      maxLength={180}
                      value={experience.companyLocation ?? ""}
                      disabled={pending}
                      onChange={(event) =>
                        updateCareerExperience(index, { companyLocation: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    From
                    <input
                      type="date"
                      value={dateInputValue(experience.dateFrom)}
                      disabled={pending}
                      onChange={(event) =>
                        updateCareerExperience(index, { dateFrom: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={dateInputValue(experience.dateTo)}
                      disabled={pending}
                      onChange={(event) =>
                        updateCareerExperience(index, { dateTo: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Responsibilities and accomplishments
                  <textarea
                    rows={5}
                    maxLength={10000}
                    value={experience.description ?? ""}
                    disabled={pending}
                    placeholder="Use one achievement or responsibility per line. Include technologies and metrics only when factual."
                    onChange={(event) =>
                      updateCareerExperience(index, { description: event.target.value })
                    }
                  />
                </label>
                {careerExperiences.length > 1 ? (
                  <button
                    className="secondary-action compact-action danger-action"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setCareerExperiences((current) =>
                        current.length > 1
                          ? current.filter((_, itemIndex) => itemIndex !== index)
                          : [emptyCareerExperience()]
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </fieldset>
            ))}
          </div>
        </section>

        <section className="profile-form-section">
          <h4>Resume</h4>
          <label>
            Resume HTML template
            <textarea
              name="resumeHtmlTemplate"
              rows={12}
              maxLength={200000}
              defaultValue={initialProfile?.resumeHtmlTemplate ?? ""}
              disabled={pending}
            />
          </label>
          <label>
            Resume tailoring note
            <textarea
              name="resumeTailoringNote"
              rows={7}
              maxLength={50000}
              defaultValue={initialProfile?.resumeTailoringNote ?? ""}
              disabled={pending}
            />
          </label>
        </section>

        {error ? <p className="form-error">{errorMessage(error)}</p> : null}
        <div className="modal-actions">
          <button className="secondary-action" type="button" disabled={pending} onClick={onClose}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button className="primary-action small" type="submit" disabled={pending}>
            <Save aria-hidden="true" />
            {pending ? "Saving" : initialProfile ? "Save changes" : "Save profile"}
          </button>
        </div>
      </form>
    </Modal>
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

function profileInputFromForm(
  form: FormData,
  careerExperiences: TrackingProfileCareerExperience[]
): TrackingProfileInput {
  const rawGender = fieldValue(form, "gender");
  const gender = rawGender === "man" || rawGender === "woman" ? rawGender : undefined;
  return {
    name: fieldValue(form, "name"),
    firstName: fieldValue(form, "firstName"),
    middleName: optionalFieldValue(form, "middleName"),
    lastName: fieldValue(form, "lastName"),
    gender,
    dateOfBirth: fieldValue(form, "dateOfBirth"),
    email: optionalFieldValue(form, "email"),
    phoneNumber: optionalFieldValue(form, "phoneNumber"),
    street: optionalFieldValue(form, "street"),
    city: optionalFieldValue(form, "city"),
    state: optionalFieldValue(form, "state"),
    country: optionalFieldValue(form, "country"),
    postalCode: optionalFieldValue(form, "postalCode"),
    linkedinUrl: optionalFieldValue(form, "linkedinUrl"),
    education: {
      university: optionalFieldValue(form, "educationUniversity"),
      location: optionalFieldValue(form, "educationLocation"),
      degree: optionalFieldValue(form, "educationDegree"),
      major: optionalFieldValue(form, "educationMajor"),
      dateFrom: optionalFieldValue(form, "educationDateFrom"),
      dateTo: optionalFieldValue(form, "educationDateTo")
    },
    careerExperiences: careerExperiences.map(cleanCareerExperience).filter(hasCareerExperience),
    resumeHtmlTemplate: optionalFieldValue(form, "resumeHtmlTemplate"),
    resumeTailoringNote: optionalFieldValue(form, "resumeTailoringNote")
  };
}

function cleanCareerExperience(
  experience: TrackingProfileCareerExperience
): TrackingProfileCareerExperience {
  return {
    companyName: trimOptional(experience.companyName),
    jobTitle: trimOptional(experience.jobTitle),
    companyLocation: trimOptional(experience.companyLocation),
    dateFrom: trimOptional(experience.dateFrom),
    dateTo: trimOptional(experience.dateTo),
    description: trimOptional(experience.description)
  };
}

function hasCareerExperience(experience: TrackingProfileCareerExperience): boolean {
  return Boolean(
    experience.companyName ||
    experience.jobTitle ||
    experience.companyLocation ||
    experience.dateFrom ||
    experience.dateTo ||
    experience.description
  );
}

function emptyCareerExperience(): TrackingProfileCareerExperience {
  return {
    companyName: "",
    jobTitle: "",
    companyLocation: "",
    dateFrom: "",
    dateTo: "",
    description: ""
  };
}

function profileDisplayName(profile: TrackingProfile): string {
  return [profile.firstName, profile.middleName, profile.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}

function profileLocation(profile: TrackingProfile): string {
  return [profile.street, profile.city, profile.state, profile.postalCode, profile.country]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
}

function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

function trimOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : undefined;
}

async function invalidateTracking(queryClient: ReturnType<typeof useQueryClient>, slug: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tracking-profiles", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-interviews", slug] }),
    queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
  ]);
}
