import type { JobApplicationStatus } from "./types";

const allowedTransitions: Record<JobApplicationStatus, JobApplicationStatus[]> = {
  saved: ["applied", "withdrawn", "archived"],
  applied: ["interview_requested", "rejected", "withdrawn", "archived"],
  interview_requested: ["interviewing", "rejected", "withdrawn", "archived"],
  interviewing: ["offer", "rejected", "withdrawn", "archived"],
  offer: ["archived", "withdrawn"],
  rejected: ["archived"],
  withdrawn: ["archived"],
  archived: []
};

export function canTransitionApplicationStatus(
  from: JobApplicationStatus,
  to: JobApplicationStatus
): boolean {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function assertApplicationStatusTransition(
  from: JobApplicationStatus,
  to: JobApplicationStatus
): void {
  if (!canTransitionApplicationStatus(from, to)) {
    throw new Error(`Cannot transition application from ${from} to ${to}.`);
  }
}

export function nextApplicationStatuses(from: JobApplicationStatus): JobApplicationStatus[] {
  return [...(allowedTransitions[from] ?? [])];
}
