import type { Interview, InterviewType, JobApplication, WorkspaceSnapshot } from "@rghs1/domain";
import { useMutation } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { FormEvent } from "react";
import { Modal } from "../../../components/shared/Modal";
import { createInterview, type CreateInterviewInput } from "../../../services/workspace.service";
import { errorMessage } from "../../../errors";
import { fieldValue, optionalFieldValue } from "../../../utils/form";

export function InterviewModal({
  open,
  snapshot,
  applications,
  onClose,
  onCreated
}: {
  open: boolean;
  snapshot: WorkspaceSnapshot;
  applications: JobApplication[];
  onClose: () => void;
  onCreated: (interview: Interview) => void;
}) {
  const mutation = useMutation({
    mutationFn: createInterview,
    onSuccess: onCreated
  });

  if (!open) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const applicationId = fieldValue(form, "applicationId");
    const application = applications.find((item) => item.id === applicationId);

    if (!application) {
      return;
    }

    const scheduledAtRaw = optionalFieldValue(form, "scheduledAt");
    const payload: CreateInterviewInput = {
      workspaceId: snapshot.workspace.id,
      applicationId,
      profileId: application.profileId,
      interviewType: fieldValue(form, "interviewType") as InterviewType,
      scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : undefined,
      notes: optionalFieldValue(form, "notes")
    };

    mutation.mutate(payload);
  }

  return (
    <Modal title="Save Interview" onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <label>
          Job
          <select name="applicationId" required defaultValue={applications[0]?.id}>
            {applications.map((application) => (
              <option value={application.id} key={application.id}>
                {application.jobTitle} at {application.companyName}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Type
            <select name="interviewType" defaultValue="initial">
              <option value="initial">Initial</option>
              <option value="hr">HR</option>
              <option value="technical">Technical</option>
              <option value="final">Final</option>
              <option value="client">Client</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Schedule
            <input name="scheduledAt" type="datetime-local" />
          </label>
        </div>
        <label>
          Notes
          <textarea
            name="notes"
            rows={4}
            placeholder="Recruiter call, technical panel, client round"
          />
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
