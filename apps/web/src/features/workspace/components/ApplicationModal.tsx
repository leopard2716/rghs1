import type { JobApplication, Resume, WorkspaceSnapshot } from "@rghs1/domain";
import { useMutation } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { FormEvent } from "react";
import { Modal } from "../../../components/shared/Modal";
import {
  createApplication,
  type CreateApplicationInput
} from "../../../services/workspace.service";
import { errorMessage } from "../../../errors";
import { fieldValue, optionalFieldValue } from "../../../utils/form";

export function ApplicationModal({
  open,
  snapshot,
  onClose,
  onCreated
}: {
  open: boolean;
  snapshot: WorkspaceSnapshot;
  onClose: () => void;
  onCreated: (application: JobApplication) => void;
}) {
  const mutation = useMutation({
    mutationFn: createApplication,
    onSuccess: onCreated
  });

  if (!open) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const markApplied = form.get("markApplied") === "on";
    const payload: CreateApplicationInput = {
      workspaceId: snapshot.workspace.id,
      profileId: fieldValue(form, "profileId"),
      marketId: fieldValue(form, "marketId"),
      resumeId: optionalFieldValue(form, "resumeId"),
      jobTitle: fieldValue(form, "jobTitle"),
      companyName: fieldValue(form, "companyName"),
      jobLink: fieldValue(form, "jobLink"),
      appliedAt: markApplied ? new Date().toISOString() : undefined
    };

    mutation.mutate(payload);
  }

  return (
    <Modal title="Save Application" onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <label>
          Job title
          <input name="jobTitle" required minLength={2} placeholder="Senior Full-stack Engineer" />
        </label>
        <label>
          Company
          <input name="companyName" required minLength={2} placeholder="Nova Cloud" />
        </label>
        <label>
          Job link
          <input name="jobLink" required type="url" placeholder="https://example.com/job" />
        </label>
        <div className="form-grid">
          <label>
            Profile
            <select name="profileId" required defaultValue={snapshot.profiles[0]?.id}>
              {snapshot.profiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Market
            <select name="marketId" required defaultValue={snapshot.markets[0]?.id}>
              {snapshot.markets.map((market) => (
                <option value={market.id} key={market.id}>
                  {market.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Resume
          <select name="resumeId" defaultValue={snapshot.resumes[0]?.id ?? ""}>
            <option value="">No resume selected</option>
            {snapshot.resumes.map((resume: Resume) => (
              <option value={resume.id} key={resume.id}>
                {resume.label} v{resume.version}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input name="markApplied" type="checkbox" />
          Mark as applied now
        </label>
        {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
        <div className="modal-actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            <X aria-hidden="true" />
            Cancel
          </button>
          <button className="primary-action small" type="submit" disabled={mutation.isPending}>
            <Save aria-hidden="true" />
            {mutation.isPending ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
