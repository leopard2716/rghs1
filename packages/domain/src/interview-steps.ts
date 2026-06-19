export const INTERVIEW_STEPS = [
  "Intro Phone Call",
  "Assessment",
  "Initial Interview",
  "HR Interview",
  "Tech Interview 1 (Behavioral)",
  "Tech Interview 2 (Live Coding)",
  "Final Interview"
] as const;

export type InterviewStep = (typeof INTERVIEW_STEPS)[number];
