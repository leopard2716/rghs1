import { z } from "zod";

const uuid = z.string().uuid();
const confidence = z.number().min(0).max(1);
const dateTime = z.string().datetime({ offset: true });
const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP and HTTPS URLs are allowed.");

export const extensionProfileOptionSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(240),
  firstName: z.string().trim().max(120).nullable().optional(),
  middleName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(320).nullable().optional(),
  phoneNumber: z.string().trim().max(80).nullable().optional(),
  street: z.string().trim().max(180).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(40).nullable().optional(),
  linkedinUrl: z.string().trim().max(2000).nullable().optional()
});

export const extensionJobMarketOptionSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(240),
  system: z.boolean(),
  createdAt: dateTime.optional()
});

export const extensionTokenContextSchema = z.object({
  token: z.object({
    tokenId: uuid,
    defaultProfileId: uuid.nullable().optional(),
    defaultJobMarketId: uuid.nullable().optional(),
    scopes: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    expiresAt: dateTime,
    lastUsedAt: dateTime.nullable().optional(),
    createdAt: dateTime.optional()
  }),
  workspace: z.object({
    id: uuid,
    name: z.string().trim().min(1).max(240),
    slug: z.string().trim().min(1).max(120)
  }),
  member: z.object({
    id: uuid,
    authUserId: uuid,
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().min(1).max(120)
  }),
  profiles: z.array(extensionProfileOptionSchema).max(500).default([]),
  jobMarkets: z.array(extensionJobMarketOptionSchema).max(100).default([])
});

export const packagedExtensionTokenSchema = z.object({
  version: z.literal(1),
  apiBaseUrl: httpUrl.optional(),
  token: z.string().trim().min(16).max(4096),
  tokenId: uuid.optional(),
  workspace: extensionTokenContextSchema.shape.workspace.optional(),
  member: extensionTokenContextSchema.shape.member.partial({ authUserId: true }).optional(),
  profile: extensionProfileOptionSchema.pick({ id: true, name: true }).optional(),
  jobMarket: extensionJobMarketOptionSchema.pick({ id: true, name: true, system: true }).optional(),
  issuedAt: dateTime.optional()
});

export const applyAssistantSettingsSchema = z.object({
  apiBaseUrl: httpUrl.default("http://localhost:8787"),
  workspaceSlug: z.string().trim().min(1).max(120).optional(),
  workspaceId: uuid.optional(),
  workspaceName: z.string().trim().min(1).max(240).optional(),
  memberId: uuid.optional(),
  memberAuthUserId: uuid.optional(),
  memberEmail: z.string().trim().email().max(320).optional(),
  memberDisplayName: z.string().trim().min(1).max(120).optional(),
  extensionToken: z.string().trim().min(16).max(4096).optional(),
  tokenId: uuid.optional(),
  tokenExpiresAt: dateTime.optional(),
  tokenScopes: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  profileId: uuid.optional(),
  jobMarketId: uuid.optional(),
  profiles: z.array(extensionProfileOptionSchema).max(500).default([]),
  jobMarkets: z.array(extensionJobMarketOptionSchema).max(100).default([])
});

export type ApplyAssistantSettings = z.output<typeof applyAssistantSettingsSchema>;
export type ExtensionProfileOption = z.output<typeof extensionProfileOptionSchema>;
export type ExtensionJobMarketOption = z.output<typeof extensionJobMarketOptionSchema>;
export type ExtensionTokenContext = z.output<typeof extensionTokenContextSchema>;
export type PackagedExtensionToken = z.output<typeof packagedExtensionTokenSchema>;

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

export type ElementSnapshot = z.output<typeof elementSnapshotSchema>;

export const pageSnapshotSchema = z.object({
  pageUrl: httpUrl,
  pageOrigin: httpUrl,
  pageTitle: z.string().trim().max(500),
  capturedAt: dateTime,
  visibleText: z.string().trim().max(50000),
  jsonLdJobPostings: z.array(z.record(z.unknown())).max(10).default([]),
  fields: z.array(elementSnapshotSchema).max(250),
  buttons: z.array(elementSnapshotSchema).max(100),
  warnings: z.array(z.string().trim().max(500)).max(50).default([])
});

export type PageSnapshot = z.output<typeof pageSnapshotSchema>;

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

export type ExtractedJob = z.output<typeof extractedJobSchema>;

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

export type FieldMap = z.output<typeof fieldMapSchema>;
export type MappedField = z.output<typeof mappedFieldSchema>;

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

export type GeneratedResume = z.output<typeof generatedResumeSchema>;

export const applySessionResponseSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  status: z.enum(["draft", "reviewing", "autofilled", "submitted", "committed", "abandoned"]),
  extractedJob: extractedJobSchema.optional(),
  fieldMap: fieldMapSchema.optional(),
  resumeVersions: z.array(generatedResumeSchema).default([])
});

export type ApplySessionResponse = z.output<typeof applySessionResponseSchema>;

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly details: unknown
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseWithSchema<Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
  label: string
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.flatten();
    throw new ValidationError(
      `${label} failed validation.${formatValidationIssues(result.error.issues)}`,
      {
        ...details,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
          code: issue.code
        }))
      }
    );
  }

  return result.data;
}

function formatValidationIssues(issues: z.ZodIssue[]): string {
  const messages = issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });

  return messages.length ? ` ${messages.slice(0, 4).join("; ")}` : "";
}
