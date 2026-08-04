import type { FieldMap, PageSnapshot } from "../shared/schemas";

export const sampleSnapshot: PageSnapshot = {
  pageUrl: "https://jobs.example.com/frontend-engineer",
  pageOrigin: "https://jobs.example.com",
  pageTitle: "Senior Frontend Engineer - ExampleCo",
  capturedAt: "2026-07-06T15:00:00.000Z",
  visibleText:
    "ExampleCo is hiring a Senior Frontend Engineer. Requirements include React, TypeScript, accessibility, and API integration.",
  jsonLdJobPostings: [],
  fields: [
    {
      ref: "field-1",
      kind: "input",
      selector: 'input[name="first_name"]',
      label: "First name",
      name: "first_name",
      inputType: "text",
      required: true,
      options: []
    },
    {
      ref: "field-2",
      kind: "input",
      selector: 'input[name="email"]',
      label: "Email",
      name: "email",
      inputType: "email",
      required: true,
      options: []
    },
    {
      ref: "field-3",
      kind: "file",
      selector: 'input[name="resume"]',
      label: "Resume",
      name: "resume",
      inputType: "file",
      required: true,
      options: []
    }
  ],
  buttons: [
    {
      ref: "button-1",
      kind: "button",
      selector: "button:nth-of-type(1)",
      label: "Submit application",
      inputType: "button",
      required: false,
      options: [],
      visibleText: "Submit application"
    }
  ],
  warnings: []
};

export const validGeminiExtraction = {
  jobTitle: "Senior Frontend Engineer",
  company: "ExampleCo",
  location: "Remote",
  employmentType: "Full-time",
  requirements: ["React", "TypeScript", "Accessibility", "API integration"],
  responsibilities: ["Build accessible product UI", "Integrate backend APIs"],
  skills: ["React", "TypeScript", "Accessibility"],
  jobDescriptionText:
    "ExampleCo is hiring a Senior Frontend Engineer. Requirements include React, TypeScript, accessibility, and API integration.",
  confidence: 0.91,
  warnings: []
};

export const validFieldMap: FieldMap = {
  fields: [
    {
      elementRef: "field-1",
      label: "First name",
      valueSource: "profile.firstName",
      value: "Ada",
      confidence: 0.96,
      requiresUserReview: false
    },
    {
      elementRef: "field-2",
      label: "Email",
      valueSource: "profile.email",
      value: "ada@example.com",
      confidence: 0.98,
      requiresUserReview: false
    },
    {
      elementRef: "field-3",
      label: "Resume",
      valueSource: "generated.resumeFile",
      value: "resume-version-1.pdf",
      confidence: 0.94,
      requiresUserReview: false
    }
  ],
  actions: {
    submitButtonRef: "button-1",
    submitRequiresConfirmation: true
  },
  warnings: []
};

export const unsafeFieldMap: FieldMap = {
  fields: [
    {
      elementRef: "field-999",
      label: "Unknown field",
      valueSource: "profile.email",
      value: "ada@example.com",
      confidence: 0.99,
      requiresUserReview: false
    },
    {
      elementRef: "field-1",
      label: "First name",
      valueSource: "profile.firstName",
      value: "Ada",
      confidence: 0.42,
      requiresUserReview: false
    }
  ],
  actions: {
    submitButtonRef: "button-1",
    submitRequiresConfirmation: false
  },
  warnings: []
};
