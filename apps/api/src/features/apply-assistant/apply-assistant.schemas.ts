import { z } from "zod";

const uuid = z.string().uuid();
const confidence = z.number().min(0).max(1);
const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP and HTTPS URLs are allowed.");

export const extensionScope = z.enum([
  "apply_assistant:use",
  "application:create",
  "application:update",
  "resume:upload"
]);

export const defaultExtensionScopes: ExtensionScope[] = [
  "apply_assistant:use",
  "application:create",
  "application:update",
  "resume:upload"
];

export const applyAssistantConnectInput = z
  .object({
    ttlMinutes: z.coerce.number().int().min(1).max(60).default(10),
    scopes: z
      .array(extensionScope)
      .min(1)
      .max(defaultExtensionScopes.length)
      .transform((scopes) => [...new Set(scopes)])
      .default(defaultExtensionScopes)
  })
  .default({});

export const applyAssistantTokenInput = z.object({
  code: z.string().trim().min(32).max(512),
  profileId: uuid.optional(),
  jobMarketId: uuid.optional()
});

export const elementKindSchema = z.enum([
  "input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "button",
  "file",
  "date",
  "time",
  "datetime",
  "number",
  "email",
  "tel",
  "url",
  "contenteditable",
  "combobox",
  "listbox",
  "switch"
]);

export const elementSnapshotSchema = z.object({
  ref: z.string().trim().min(1).max(120),
  kind: elementKindSchema,
  selector: z.string().trim().min(1).max(500),
  label: z.string().trim().max(500),
  name: z.string().trim().max(250).optional(),
  inputType: z.string().trim().max(80).optional(),
  ariaRole: z.string().trim().max(80).optional(),
  placeholder: z.string().trim().max(500).optional(),
  required: z.boolean(),
  disabled: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  multiple: z.boolean().optional(),
  checked: z.boolean().optional(),
  value: z.string().trim().max(2000).optional(),
  options: z.array(z.string().trim().max(500)).max(200).default([]),
  visibleText: z.string().trim().max(1000).optional()
});

export const pageSnapshotSchema = z.object({
  pageUrl: httpUrl,
  pageOrigin: httpUrl,
  pageTitle: z.string().trim().max(500),
  capturedAt: z.string().datetime(),
  visibleText: z.string().trim().max(50000),
  htmlSource: z.string().trim().max(100000).optional(),
  jsonLdJobPostings: z.array(z.record(z.unknown())).max(10).default([]),
  fields: z.array(elementSnapshotSchema).max(250),
  buttons: z.array(elementSnapshotSchema).max(100),
  warnings: z.array(z.string().trim().max(500)).max(50).default([])
});

export const extractedJobSchema = z.object({
  jobTitle: z.string().trim().min(1).max(240),
  company: z.string().trim().min(1).max(240),
  location: z.string().trim().max(240).optional(),
  employmentType: z.string().trim().max(120).optional(),
  requirements: z.array(z.string().trim().min(1).max(1000)).max(80).default([]),
  responsibilities: z.array(z.string().trim().min(1).max(1000)).max(80).default([]),
  skills: z.array(z.string().trim().min(1).max(120)).max(120).default([]),
  jobDescriptionText: z.string().trim().min(50).max(50000),
  confidence,
  warnings: z.array(z.string().trim().max(500)).max(50).default([])
});

export const fieldValueSourceSchema = z.enum([
  "profile.firstName",
  "profile.middleName",
  "profile.lastName",
  "profile.email",
  "profile.phoneNumber",
  "profile.street",
  "profile.city",
  "profile.state",
  "profile.country",
  "profile.postalCode",
  "profile.linkedinUrl",
  "generated.resumeFile",
  "generated.resumeText",
  "generated.coverLetter",
  "generated.answer",
  "user.review"
]);

export const mappedFieldSchema = z.object({
  elementRef: z.string().trim().min(1).max(120),
  label: z.string().trim().max(500),
  valueSource: fieldValueSourceSchema,
  value: z.string().max(10000),
  confidence,
  requiresUserReview: z.boolean()
});

export const fieldMapSchema = z.object({
  fields: z.array(mappedFieldSchema).max(250),
  actions: z
    .object({
      nextButtonRef: z.string().trim().max(120).optional(),
      submitButtonRef: z.string().trim().max(120).optional(),
      submitRequiresConfirmation: z.boolean().default(true)
    })
    .default({ submitRequiresConfirmation: true }),
  warnings: z.array(z.string().trim().max(500)).max(50).default([])
});

export const generatedResumeSchema = z.object({
  id: uuid.optional(),
  resumeHtml: z.string().trim().min(1).max(250000),
  resumeText: z.string().trim().min(1).max(100000),
  changes: z.array(z.string().trim().max(1000)).max(50).default([]),
  missingEvidence: z.array(z.string().trim().max(1000)).max(50).default([]),
  warnings: z.array(z.string().trim().max(500)).max(50).default([]),
  quality: z.object({
    jdCoverage: confidence,
    fabricationRisk: z.enum(["low", "medium", "high"]),
    atsReadability: z.enum(["poor", "fair", "good", "excellent"])
  })
});

export const generateResumeInput = z
  .object({
    refinementNote: z.string().trim().max(5000).optional()
  })
  .default({});

export const modifyResumeInput = z.object({
  refinementNote: z.string().trim().min(1).max(5000)
});

export const applySessionStatusSchema = z.enum([
  "draft",
  "reviewing",
  "autofilled",
  "submitted",
  "committed",
  "abandoned"
]);

export const applySessionResponseSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  status: applySessionStatusSchema,
  extractedJob: extractedJobSchema.optional(),
  fieldMap: fieldMapSchema.optional(),
  resumeVersions: z.array(generatedResumeSchema).default([])
});

export const applyAssistantSessionInput = z.object({
  pageSnapshot: pageSnapshotSchema,
  profileId: uuid.optional(),
  jobMarketId: uuid.optional()
});

export const applyAssistantFieldMapInput = z.object({
  pageSnapshot: pageSnapshotSchema
});

export const commitBidInput = z
  .object({
    resumeVersionId: uuid.optional()
  })
  .default({});

export const commitBidResponseSchema = z.object({
  sessionId: uuid,
  bidId: uuid,
  status: z.literal("committed"),
  created: z.boolean(),
  jobTitle: z.string().trim().min(1).max(240),
  company: z.string().trim().min(1).max(240),
  jobLink: httpUrl
});

export const extensionTokenParams = z.object({
  tokenId: z.string().uuid()
});

export const applySessionParams = z.object({
  sessionId: uuid
});

export type ExtensionScope = z.infer<typeof extensionScope>;
export type ApplyAssistantConnectInput = z.infer<typeof applyAssistantConnectInput>;
export type ApplyAssistantTokenInput = z.infer<typeof applyAssistantTokenInput>;
export type ElementSnapshot = z.infer<typeof elementSnapshotSchema>;
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;
export type ExtractedJob = z.infer<typeof extractedJobSchema>;
export type FieldMap = z.infer<typeof fieldMapSchema>;
export type MappedField = z.infer<typeof mappedFieldSchema>;
export type GeneratedResume = z.infer<typeof generatedResumeSchema>;
export type GenerateResumeInput = z.infer<typeof generateResumeInput>;
export type ModifyResumeInput = z.infer<typeof modifyResumeInput>;
export type ApplySessionResponse = z.infer<typeof applySessionResponseSchema>;
export type ApplyAssistantSessionInput = z.infer<typeof applyAssistantSessionInput>;
export type ApplyAssistantFieldMapInput = z.infer<typeof applyAssistantFieldMapInput>;
export type CommitBidInput = z.infer<typeof commitBidInput>;
export type CommitBidResponse = z.infer<typeof commitBidResponseSchema>;
