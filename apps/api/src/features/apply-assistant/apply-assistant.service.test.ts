import { describe, expect, it } from "vitest";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import type {
  AiFieldMapDraft,
  ApplyAssistantExtractionProvider,
  ApplyAssistantFieldMapProvider,
  ApplyAssistantFieldMapProviderInput,
  ApplyAssistantPageAnalysisProviderInput
} from "./apply-assistant-ai";
import type {
  ExtractedJob,
  FieldMap,
  GeneratedResume,
  PageSnapshot
} from "./apply-assistant.schemas";
import {
  ApplyAssistantService,
  formatResumeDates,
  richTextFromJobDescription,
  sanitizeResumeHtml
} from "./apply-assistant.service";

const workspaceId = "7dc5bfd2-452b-4625-9ea3-14f307db5feb";
const memberId = "64683d54-766c-4335-85d7-a3dd627d4282";
const authUserId = "7eef51d8-6d9e-4ed2-92c6-634bb80603df";
const roleId = "6c330b76-62a9-48af-a1d4-40338dd23a7f";
const codeId = "98a026f2-5ace-4ae7-bc75-c55e920733c2";
const tokenId = "7a9e0ea8-ec75-4ef5-9dac-506502a6ac8c";
const profileId = "8153792e-83a8-42ea-9bf0-8e16395e20ba";
const jobMarketId = "f8dcb88f-9146-45f1-b6df-a046ae58f7a8";
const sessionId = "22cb636d-8093-44ba-b44b-ef4ab8dcfd4c";
const tailoredResume: GeneratedResume = {
  id: "52a8f4fa-7d10-4a20-913e-d9de75c5c935",
  resumeHtml: "<section>Ada Lovelace</section>",
  resumeText: "Ada Lovelace\nTypeScript product engineer",
  changes: ["Tailored the resume."],
  missingEvidence: [],
  warnings: [],
  quality: { jdCoverage: 0.96, fabricationRisk: "low", atsReadability: "excellent" }
};

describe("job description rich text", () => {
  it("formats section headings and consecutive responsibilities as a bullet list", () => {
    const document = richTextFromJobDescription({
      jobTitle: "Staff Software Engineer, Systems",
      company: "Syllo",
      location: "Remote",
      requirements: [],
      responsibilities: [],
      skills: [],
      jobDescriptionText: [
        "Staff Software Engineer, Systems",
        "Remote",
        "About Syllo",
        "Syllo is on a mission to transform litigation.",
        "Responsibilities",
        "• Own cloud cost efficiency end-to-end.",
        "• Design scalable Kubernetes infrastructure.",
        "Qualifications",
        "• Strong GCP and distributed systems experience."
      ].join("\n"),
      confidence: 0.95,
      warnings: []
    });

    expect(document.content.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "bulletList",
      "heading",
      "bulletList"
    ]);
  });

  it("preserves visible HTML headings, bold metadata labels, paragraphs, and lists", () => {
    const job: ExtractedJob = {
      jobTitle: "Full Stack Engineer",
      company: "College Board",
      location: "Remote - USA",
      requirements: [],
      responsibilities: [],
      skills: [],
      jobDescriptionText: "Flattened fallback description that should not control formatting.",
      confidence: 0.96,
      warnings: []
    };
    const document = richTextFromJobDescription(
      job,
      [
        "<h2>Full Stack Engineer</h2>",
        "<p><strong>College Board</strong> – Technology</p>",
        "<p><strong>Location:</strong> This is a remote role.</p>",
        "<p><strong>Type:</strong> This is a full-time position.</p>",
        "<h3>About Technology at College Board</h3>",
        "<p>We are a mission-driven engineering team building the future of learning.</p>",
        "<h3>In this role, you will:</h3>",
        "<ul><li>Build scalable systems.</li><li>Champion engineering excellence.</li></ul>"
      ].join("")
    );

    expect(document.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "bulletList"
    ]);
    expect(document.content[1]?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
    expect(document.content[2]?.content?.[0]?.text).toBe("Location:");
    expect(document.content[2]?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
  });
});

type InsertCall = {
  table: string;
  rows: Record<string, unknown>[];
};

type UpdateCall = {
  table: string;
  values: Record<string, unknown>;
  filters: Record<string, string>;
};

class FakeSupabase {
  readonly inserts: InsertCall[] = [];
  readonly updates: UpdateCall[] = [];

  constructor(
    private readonly mode:
      | "connect"
      | "exchange"
      | "list"
      | "revoke"
      | "session"
      | "fieldMap"
      | "commit"
      | "tokenContext",
    private readonly sessionFieldMap: FieldMap | null = null,
    private readonly sessionResumeVersions: GeneratedResume[] = []
  ) {}

  async select<T>(table: string): Promise<T[]> {
    if (table === "workspaces") {
      return [
        {
          id: workspaceId,
          name: "RG Team",
          slug: "rg-team",
          status: "active",
          created_at: "2026-06-18T00:00:00.000Z"
        }
      ] as T[];
    }
    if (table === "workspace_members") {
      return [
        {
          id: memberId,
          workspace_id: workspaceId,
          auth_user_id: authUserId,
          display_name: "Workspace Member",
          email: "member@example.com",
          status: "active",
          created_at: "2026-06-18T00:00:00.000Z",
          updated_at: "2026-06-18T00:00:00.000Z",
          deleted_at: null
        }
      ] as T[];
    }
    if (table === "workspace_roles") {
      return [
        {
          id: roleId,
          workspace_id: workspaceId,
          name: "Bidder",
          key: "bidder",
          system: true,
          deleted_at: null
        }
      ] as T[];
    }
    if (table === "workspace_member_roles") {
      return [
        {
          workspace_id: workspaceId,
          member_id: memberId,
          role_id: roleId
        }
      ] as T[];
    }
    if (table === "extension_connection_codes" && this.mode === "exchange") {
      return [
        {
          id: codeId,
          workspace_id: workspaceId,
          member_id: memberId,
          code_hash: "stored-code-hash",
          scopes: ["apply_assistant:use", "application:create"],
          expires_at: "2099-01-01T00:00:00.000Z",
          consumed_at: null,
          created_at: "2026-07-06T12:00:00.000Z"
        }
      ] as T[];
    }
    if (
      table === "extension_tokens" &&
      (this.mode === "session" ||
        this.mode === "fieldMap" ||
        this.mode === "commit" ||
        this.mode === "tokenContext")
    ) {
      return [
        {
          id: tokenId,
          workspace_id: workspaceId,
          member_id: memberId,
          default_profile_id: this.mode === "tokenContext" ? profileId : null,
          default_job_market_id: this.mode === "tokenContext" ? jobMarketId : null,
          token_hash: "stored-token-hash",
          scopes: ["apply_assistant:use", "application:create"],
          expires_at: "2099-01-01T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
          created_at: "2026-07-06T12:01:00.000Z"
        }
      ] as T[];
    }
    if (table === "extension_tokens" && this.mode === "list") {
      return [
        {
          id: tokenId,
          workspace_id: workspaceId,
          member_id: memberId,
          default_profile_id: profileId,
          default_job_market_id: jobMarketId,
          token_hash: "stored-token-hash",
          scopes: ["apply_assistant:use", "application:create"],
          expires_at: "2099-01-01T00:00:00.000Z",
          last_used_at: "2026-07-06T12:05:00.000Z",
          revoked_at: null,
          created_at: "2026-07-06T12:01:00.000Z"
        }
      ] as T[];
    }
    if (table === "apply_assistant_sessions" && this.mode === "fieldMap") {
      return [
        {
          id: sessionId,
          workspace_id: workspaceId,
          member_id: memberId,
          profile_id: profileId,
          job_market_id: null,
          page_url: sampleSnapshot.pageUrl,
          page_origin: sampleSnapshot.pageOrigin,
          page_title: sampleSnapshot.pageTitle,
          page_snapshot: sampleSnapshot,
          extracted_job: null,
          field_map: this.sessionFieldMap,
          resume_versions: this.sessionResumeVersions,
          status: "draft",
          created_at: "2026-07-06T12:02:00.000Z",
          updated_at: "2026-07-06T12:02:00.000Z"
        }
      ] as T[];
    }
    if (table === "apply_assistant_sessions" && this.mode === "commit") {
      return [
        {
          id: sessionId,
          workspace_id: workspaceId,
          member_id: memberId,
          profile_id: profileId,
          job_market_id: jobMarketId,
          page_url: sampleSnapshot.pageUrl,
          page_origin: sampleSnapshot.pageOrigin,
          page_title: sampleSnapshot.pageTitle,
          page_snapshot: sampleSnapshot,
          extracted_job: {
            jobTitle: "Principal UI Engineer",
            company: "ExampleCo",
            requirements: ["TypeScript"],
            responsibilities: ["Build product features"],
            skills: ["TypeScript"],
            jobDescriptionText:
              "ExampleCo is hiring a Principal UI Engineer to build accessible TypeScript product features for customers.",
            confidence: 0.96,
            warnings: []
          },
          field_map: this.sessionFieldMap,
          resume_versions: [tailoredResume],
          status: "reviewing",
          created_at: "2026-07-06T12:02:00.000Z",
          updated_at: "2026-07-06T12:02:00.000Z"
        }
      ] as T[];
    }
    if (
      table === "tracking_profiles" &&
      (this.mode === "exchange" ||
        this.mode === "fieldMap" ||
        this.mode === "commit" ||
        this.mode === "tokenContext")
    ) {
      return [
        {
          id: profileId,
          workspace_id: workspaceId,
          name: "Ada Lovelace",
          first_name: "Ada",
          middle_name: null,
          last_name: "Lovelace",
          gender: null,
          date_of_birth: null,
          email: "ada@example.com",
          phone_number: "555-0101",
          street: "123 Algorithm Ave",
          city: "Austin",
          state: "TX",
          country: "United States",
          postal_code: "78701",
          linkedin_url: "https://www.linkedin.com/in/ada",
          education_university: null,
          education_location: null,
          education_degree: null,
          education_date_from: null,
          education_date_to: null,
          career_experiences: [],
          resume_html_template: null,
          resume_tailoring_note: null,
          created_by_member_id: memberId,
          created_at: "2026-07-06T12:00:00.000Z",
          updated_at: "2026-07-06T12:00:00.000Z",
          deleted_at: null
        }
      ] as T[];
    }
    if (
      table === "tracking_job_markets" &&
      (this.mode === "exchange" || this.mode === "commit" || this.mode === "tokenContext")
    ) {
      return [
        {
          id: jobMarketId,
          workspace_id: workspaceId,
          market_key: "us",
          name: "US Job Market",
          system: true,
          created_by_member_id: null,
          created_at: "2026-07-06T12:00:00.000Z",
          updated_at: "2026-07-06T12:00:00.000Z",
          deleted_at: null
        }
      ] as T[];
    }
    if (table === "bid_records" && this.mode === "tokenContext") {
      return [
        {
          job_market_id: jobMarketId
        }
      ] as T[];
    }

    return [];
  }

  async insert<T>(table: string, rows: Record<string, unknown>[]): Promise<T[]> {
    this.inserts.push({ table, rows });
    if (table === "extension_connection_codes") {
      return [
        {
          id: codeId,
          ...rows[0],
          created_at: "2026-07-06T12:00:00.000Z",
          consumed_at: null
        }
      ] as T[];
    }
    if (table === "extension_tokens") {
      return [
        {
          id: tokenId,
          ...rows[0],
          last_used_at: null,
          revoked_at: null,
          created_at: "2026-07-06T12:01:00.000Z"
        }
      ] as T[];
    }
    if (table === "apply_assistant_sessions") {
      return [
        {
          ...rows[0],
          id: sessionId,
          created_at: "2026-07-06T12:02:00.000Z",
          updated_at: "2026-07-06T12:02:00.000Z"
        }
      ] as T[];
    }
    if (table === "bid_records") {
      return [
        {
          ...rows[0],
          created_at: "2026-07-06T12:03:00.000Z",
          updated_at: "2026-07-06T12:03:00.000Z",
          deleted_at: null
        }
      ] as T[];
    }

    return [] as T[];
  }

  async update<T>(
    table: string,
    values: Record<string, unknown>,
    filters: Record<string, string>
  ): Promise<T[]> {
    this.updates.push({ table, values, filters });
    if (table === "extension_connection_codes") {
      return [
        {
          id: codeId,
          workspace_id: workspaceId,
          member_id: memberId,
          code_hash: "stored-code-hash",
          scopes: ["apply_assistant:use", "application:create"],
          expires_at: "2099-01-01T00:00:00.000Z",
          consumed_at: values.consumed_at,
          created_at: "2026-07-06T12:00:00.000Z"
        }
      ] as T[];
    }
    if (table === "extension_tokens") {
      return [
        {
          id: tokenId,
          workspace_id: workspaceId,
          member_id: memberId,
          default_profile_id: profileId,
          default_job_market_id: jobMarketId,
          token_hash: "stored-token-hash",
          scopes: ["apply_assistant:use"],
          expires_at: "2099-01-01T00:00:00.000Z",
          last_used_at: null,
          revoked_at: values.revoked_at,
          created_at: "2026-07-06T12:01:00.000Z"
        }
      ] as T[];
    }
    if (table === "apply_assistant_sessions") {
      return [
        {
          id: sessionId,
          workspace_id: workspaceId,
          member_id: memberId,
          profile_id: profileId,
          job_market_id: null,
          page_url: sampleSnapshot.pageUrl,
          page_origin: sampleSnapshot.pageOrigin,
          page_title: sampleSnapshot.pageTitle,
          page_snapshot: values.page_snapshot,
          extracted_job: null,
          field_map: values.field_map,
          resume_versions: [],
          status: values.status,
          created_at: "2026-07-06T12:02:00.000Z",
          updated_at: values.updated_at
        }
      ] as T[];
    }

    return [] as T[];
  }
}

class FakeFieldMapProvider implements ApplyAssistantFieldMapProvider {
  calls = 0;
  lastInput: ApplyAssistantFieldMapProviderInput | null = null;

  constructor(private readonly draft: AiFieldMapDraft) {}

  async createFieldMap(input: ApplyAssistantFieldMapProviderInput): Promise<AiFieldMapDraft> {
    this.calls += 1;
    this.lastInput = input;
    return this.draft;
  }
}

class FakeExtractionProvider implements ApplyAssistantExtractionProvider {
  calls = 0;

  constructor(private readonly extractedJob: ExtractedJob) {}

  async extractJob(): Promise<ExtractedJob> {
    this.calls += 1;
    return this.extractedJob;
  }
}

class FakePageAnalysisProvider implements ApplyAssistantExtractionProvider {
  calls = 0;
  extractJobCalls = 0;
  lastInput: ApplyAssistantPageAnalysisProviderInput | null = null;

  constructor(
    private readonly extractedJob: ExtractedJob,
    private readonly fieldExtractionDraft: AiFieldMapDraft
  ) {}

  async extractJob(): Promise<ExtractedJob> {
    this.extractJobCalls += 1;
    return this.extractedJob;
  }

  async analyzePage(input: ApplyAssistantPageAnalysisProviderInput) {
    this.calls += 1;
    this.lastInput = input;
    return {
      extractedJob: this.extractedJob,
      fieldExtractionDraft: this.fieldExtractionDraft
    };
  }
}

const sampleSnapshot: PageSnapshot = {
  pageUrl: "https://jobs.example.com/frontend-engineer",
  pageOrigin: "https://jobs.example.com",
  pageTitle: "Senior Frontend Engineer - ExampleCo",
  capturedAt: "2026-07-06T15:00:00.000Z",
  visibleText:
    "ExampleCo is hiring a Senior Frontend Engineer. Requirements include React, TypeScript, accessibility, and API integration. You will build accessible product UI and integrate backend APIs.",
  jsonLdJobPostings: [
    {
      "@type": "JobPosting",
      title: "Senior Frontend Engineer",
      hiringOrganization: { name: "ExampleCo" },
      employmentType: "Full-time"
    }
  ],
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
      kind: "textarea",
      selector: 'textarea[name="why"]',
      label: "Why are you interested?",
      name: "why",
      required: true,
      options: []
    },
    {
      ref: "field-4",
      kind: "file",
      selector: 'input[name="resume"]',
      label: "Resume/CV - Attach",
      name: "resume",
      inputType: "file",
      required: true,
      options: []
    },
    {
      ref: "field-5",
      kind: "file",
      selector: 'input[name="cover_letter"]',
      label: "Cover Letter - Attach",
      name: "cover_letter",
      inputType: "file",
      required: false,
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

describe("ApplyAssistantService connection flow", () => {
  it("creates a one-time connection code for an active bidder", async () => {
    const supabase = new FakeSupabase("connect");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );

    const response = await service.createConnectionCode(
      "rg-team",
      { id: authUserId, email: "member@example.com" },
      {
        ttlMinutes: 10,
        scopes: ["apply_assistant:use", "application:create"]
      }
    );

    expect(response.codeId).toBe(codeId);
    expect(response.code).toHaveLength(43);
    expect(response.scopes).toEqual(["apply_assistant:use", "application:create"]);
    const insert = supabase.inserts.find((call) => call.table === "extension_connection_codes");
    expect(insert?.rows[0]).toMatchObject({
      workspace_id: workspaceId,
      member_id: memberId,
      scopes: ["apply_assistant:use", "application:create"]
    });
    expect(insert?.rows[0]?.code_hash).not.toBe(response.code);
  });

  it("exchanges a valid one-time code for an opaque extension token", async () => {
    const supabase = new FakeSupabase("exchange");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );

    const response = await service.exchangeConnectionCode("rg-team", {
      code: "abcdefghijklmnopqrstuvwxyz0123456789",
      profileId,
      jobMarketId
    });

    expect(response.tokenId).toBe(tokenId);
    expect(response.token).toHaveLength(64);
    expect(response.defaultProfileId).toBe(profileId);
    expect(response.defaultJobMarketId).toBe(jobMarketId);
    expect(response.scopes).toEqual(["apply_assistant:use", "application:create"]);
    expect(supabase.updates.some((call) => call.table === "extension_connection_codes")).toBe(true);
    const insert = supabase.inserts.find((call) => call.table === "extension_tokens");
    expect(insert?.rows[0]).toMatchObject({
      workspace_id: workspaceId,
      member_id: memberId,
      default_profile_id: profileId,
      default_job_market_id: jobMarketId,
      scopes: ["apply_assistant:use", "application:create"]
    });
    expect(insert?.rows[0]?.token_hash).not.toBe(response.token);
  });

  it("revokes only the current member's token in the current workspace", async () => {
    const supabase = new FakeSupabase("revoke");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );

    const response = await service.revokeToken("rg-team", tokenId, {
      id: authUserId,
      email: "member@example.com"
    });

    expect(response.ok).toBe(true);
    expect(response.tokenId).toBe(tokenId);
    expect(supabase.updates).toContainEqual(
      expect.objectContaining({
        table: "extension_tokens",
        filters: {
          id: `eq.${tokenId}`,
          workspace_id: `eq.${workspaceId}`,
          member_id: `eq.${memberId}`,
          revoked_at: "is.null"
        }
      })
    );
  });

  it("lists active extension token metadata without exposing token hashes", async () => {
    const supabase = new FakeSupabase("list");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );

    const response = await service.listTokens("rg-team", {
      id: authUserId,
      email: "member@example.com"
    });

    expect(response.tokens).toEqual([
      {
        tokenId,
        workspaceId,
        memberId,
        defaultProfileId: profileId,
        defaultJobMarketId: jobMarketId,
        scopes: ["apply_assistant:use", "application:create"],
        expiresAt: "2099-01-01T00:00:00.000Z",
        lastUsedAt: "2026-07-06T12:05:00.000Z",
        createdAt: "2026-07-06T12:01:00.000Z"
      }
    ]);
    expect(JSON.stringify(response)).not.toContain("stored-token-hash");
  });

  it("returns safe extension token context for extension first-run setup", async () => {
    const supabase = new FakeSupabase("tokenContext");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );

    const response = await service.extensionTokenContext("abcdefghijklmnopqrstuvwxyz0123456789");

    expect(response.workspace).toEqual({
      id: workspaceId,
      name: "RG Team",
      slug: "rg-team"
    });
    expect(response.token.defaultProfileId).toBe(profileId);
    expect(response.token.defaultJobMarketId).toBe(jobMarketId);
    expect(response.member).toEqual({
      id: memberId,
      authUserId,
      displayName: "Workspace Member",
      email: "member@example.com"
    });
    expect(response.profiles).toEqual([
      expect.objectContaining({
        id: profileId,
        name: "Ada Lovelace",
        email: "ada@example.com"
      })
    ]);
    expect(response.jobMarkets).toEqual([
      expect.objectContaining({
        id: jobMarketId,
        name: "US Job Market",
        system: true
      })
    ]);
    expect(JSON.stringify(response)).not.toContain("stored-token-hash");
  });

  it("requires an AI extraction provider when creating an apply session", async () => {
    const supabase = new FakeSupabase("session");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    await expect(
      service.createApplySession(context, {
        pageSnapshot: sampleSnapshot
      })
    ).rejects.toMatchObject({
      status: 501,
      code: "extraction_provider_required"
    });
    expect(supabase.inserts.some((call) => call.table === "apply_assistant_sessions")).toBe(false);
  });

  it("uses the configured AI extraction provider when creating an apply session", async () => {
    const supabase = new FakeSupabase("session");
    const provider = new FakeExtractionProvider({
      jobTitle: "Principal UI Engineer",
      company: "Gemini Extracted Co",
      location: "Remote",
      employmentType: "Full-time",
      requirements: ["React and TypeScript production experience"],
      responsibilities: ["Lead accessible application UI delivery"],
      skills: ["React", "TypeScript", "Accessibility"],
      jobDescriptionText:
        "Gemini Extracted Co is hiring a Principal UI Engineer to lead accessible application UI delivery with React and TypeScript across a distributed product team.",
      confidence: 0.91,
      warnings: []
    });
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { extractionProvider: provider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const response = await service.createApplySession(context, {
      pageSnapshot: sampleSnapshot
    });

    expect(provider.calls).toBe(1);
    expect(response.extractedJob?.jobTitle).toBe("Principal UI Engineer");
    expect(response.extractedJob?.company).toBe("Gemini Extracted Co");
    expect(response.extractedJob?.jobDescriptionText).toBe(sampleSnapshot.visibleText);
    const insert = supabase.inserts.find((call) => call.table === "apply_assistant_sessions");
    expect(insert?.rows[0]?.extracted_job).toMatchObject({
      jobTitle: "Principal UI Engineer",
      company: "Gemini Extracted Co"
    });
  });

  it("preserves the full JSON-LD job description instead of the AI summary", async () => {
    const sourceDescription = [
      "<h2>About the Role</h2>",
      "<p>Own cloud cost efficiency end-to-end and lead FinOps initiatives.</p>",
      "<h2>Responsibilities</h2>",
      "<ul><li>Design scalable Kubernetes infrastructure.</li><li>Improve reliability and incident management.</li></ul>",
      "<h2>Qualifications</h2>",
      "<p>Strong GCP, Linux, Python, distributed systems, and data security experience.</p>"
    ].join("");
    const snapshot: PageSnapshot = {
      ...sampleSnapshot,
      visibleText: `${sampleSnapshot.visibleText} Apply for this job First name Last name`,
      jsonLdJobPostings: [
        {
          "@type": "JobPosting",
          title: "Staff Software Engineer, Systems",
          description: sourceDescription
        }
      ]
    };
    const provider = new FakeExtractionProvider({
      jobTitle: "Staff Software Engineer, Systems",
      company: "Syllo",
      location: "Remote",
      requirements: ["GCP experience"],
      responsibilities: ["Lead FinOps initiatives"],
      skills: ["GCP", "Kubernetes"],
      jobDescriptionText: "Syllo is hiring a Staff Engineer to own cloud costs and FinOps.",
      confidence: 0.95,
      warnings: []
    });
    const supabase = new FakeSupabase("session");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { extractionProvider: provider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const response = await service.createApplySession(context, { pageSnapshot: snapshot });

    expect(response.extractedJob?.jobDescriptionText).toContain(
      "Staff Software Engineer, Systems\n\nRemote"
    );
    expect(response.extractedJob?.jobDescriptionText).toContain("Qualifications");
    expect(response.extractedJob?.jobDescriptionText).toContain("Strong GCP, Linux, Python");
    expect(response.extractedJob?.jobDescriptionText).not.toBe(
      "Syllo is hiring a Staff Engineer to own cloud costs and FinOps."
    );
  });

  it("stores initial field highlights from combined AI page analysis when creating a session", async () => {
    const supabase = new FakeSupabase("session");
    const provider = new FakePageAnalysisProvider(
      {
        jobTitle: "Principal UI Engineer",
        company: "Gemini Extracted Co",
        location: "Remote",
        employmentType: "Full-time",
        requirements: ["React and TypeScript production experience"],
        responsibilities: ["Lead accessible application UI delivery"],
        skills: ["React", "TypeScript", "Accessibility"],
        jobDescriptionText:
          "Gemini Extracted Co is hiring a Principal UI Engineer to lead accessible application UI delivery with React and TypeScript across a distributed product team.",
        confidence: 0.91,
        warnings: []
      },
      {
        fields: [
          {
            elementRef: "field-1",
            valueSource: "profile.firstName",
            confidence: 0.93
          },
          {
            elementRef: "field-4",
            valueSource: "generated.resumeFile",
            confidence: 0.94
          }
        ],
        actions: {
          submitButtonRef: "button-1"
        },
        warnings: []
      }
    );
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { extractionProvider: provider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const response = await service.createApplySession(context, {
      pageSnapshot: sampleSnapshot
    });

    expect(provider.calls).toBe(1);
    expect(provider.extractJobCalls).toBe(0);
    expect(response.extractedJob?.company).toBe("Gemini Extracted Co");
    expect(response.fieldMap?.fields).toHaveLength(sampleSnapshot.fields.length);
    expect(response.fieldMap?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementRef: "field-1",
          valueSource: "profile.firstName"
        }),
        expect.objectContaining({
          elementRef: "field-4",
          valueSource: "generated.resumeFile"
        }),
        expect.objectContaining({
          elementRef: "field-5",
          valueSource: "user.review"
        })
      ])
    );
    expect(response.fieldMap?.actions.submitButtonRef).toBe("button-1");
    const insert = supabase.inserts.find((call) => call.table === "apply_assistant_sessions");
    expect(insert?.rows[0]?.field_map).toMatchObject({
      actions: expect.objectContaining({ submitButtonRef: "button-1" })
    });
  });

  it("saves comprehensive Apply Assistant artifacts with a manual-style bid record", async () => {
    const reviewedFieldMap: FieldMap = {
      fields: [
        {
          elementRef: "field-1",
          label: "First name",
          valueSource: "profile.firstName",
          value: "Ada",
          confidence: 1,
          requiresUserReview: false
        }
      ],
      actions: { submitRequiresConfirmation: true },
      warnings: []
    };
    const supabase = new FakeSupabase("commit", reviewedFieldMap);
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const response = await service.commitBid(context, sessionId, {
      resumeVersionId: tailoredResume.id,
      fieldMap: reviewedFieldMap
    });

    expect(response).toMatchObject({ created: true, company: "ExampleCo" });
    const bidInsert = supabase.inserts.find((call) => call.table === "bid_records")?.rows[0];
    expect(bidInsert?.job_description).toBeTruthy();
    expect(bidInsert?.application_metadata).toMatchObject({
      source: "apply-assistant",
      pageSnapshot: sampleSnapshot,
      fieldMap: reviewedFieldMap,
      selectedResume: {
        resumeText: tailoredResume.resumeText,
        resumeHtml: tailoredResume.resumeHtml
      }
    });
    const profileInsert = supabase.inserts.find((call) => call.table === "bid_record_profiles")
      ?.rows[0];
    expect(profileInsert).toMatchObject({
      profile_id: profileId,
      resume: tailoredResume.resumeHtml,
      resume_html: tailoredResume.resumeHtml
    });
    expect(
      supabase.updates.find((call) => call.table === "apply_assistant_sessions")?.values.field_map
    ).toEqual(reviewedFieldMap);
  });

  it("requires an AI field extraction provider when requesting a field map", async () => {
    const supabase = new FakeSupabase("fieldMap");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret"
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    await expect(
      service.requestFieldMap(context, sessionId, {
        pageSnapshot: sampleSnapshot
      })
    ).rejects.toMatchObject({
      status: 501,
      code: "field_extraction_provider_required"
    });
    expect(supabase.updates.some((call) => call.table === "apply_assistant_sessions")).toBe(false);
  });

  it("extracts and stores another application step without generating autofill values", async () => {
    const nextStepSnapshot: PageSnapshot = {
      ...sampleSnapshot,
      pageUrl: "https://jobs.example.com/frontend-engineer/step-2",
      pageTitle: "Application questions",
      capturedAt: "2026-07-06T15:05:00.000Z",
      fields: [
        {
          ref: "field-1",
          kind: "textarea",
          selector: 'textarea[name="motivation"]',
          label: "Why are you interested?",
          name: "motivation",
          required: true,
          options: []
        }
      ],
      buttons: []
    };
    const extractionProvider = new FakeFieldMapProvider({
      fields: [
        {
          elementRef: "field-1",
          valueSource: "generated.answer",
          confidence: 0.9
        }
      ],
      actions: {},
      warnings: []
    });
    const supabase = new FakeSupabase("fieldMap");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { fieldExtractionProvider: extractionProvider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const fieldMap = await service.extractStep(context, sessionId, {
      pageSnapshot: nextStepSnapshot
    });

    expect(extractionProvider.calls).toBe(1);
    expect(fieldMap.fields).toEqual([
      expect.objectContaining({
        elementRef: "field-1",
        valueSource: "generated.answer",
        value: ""
      })
    ]);
    const update = supabase.updates.find((call) => call.table === "apply_assistant_sessions");
    expect(update?.values.page_snapshot).toEqual(nextStepSnapshot);
    expect(update?.values.step_snapshots).toEqual([sampleSnapshot, nextStepSnapshot]);
  });

  it("recognizes a contextual resume upload even when AI marks it for review", async () => {
    const resumeStepSnapshot: PageSnapshot = {
      ...sampleSnapshot,
      fields: [
        {
          ref: "resume-upload",
          kind: "file",
          selector: 'input[type="file"]',
          label: "Resume/CV",
          inputType: "file",
          required: true,
          options: []
        }
      ],
      buttons: []
    };
    const extractionProvider = new FakeFieldMapProvider({
      fields: [
        {
          elementRef: "resume-upload",
          valueSource: "user.review",
          confidence: 0.4
        }
      ],
      actions: {},
      warnings: []
    });
    const supabase = new FakeSupabase("fieldMap");
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { fieldExtractionProvider: extractionProvider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const fieldMap = await service.extractStep(context, sessionId, {
      pageSnapshot: resumeStepSnapshot
    });

    expect(fieldMap.fields).toEqual([
      expect.objectContaining({
        elementRef: "resume-upload",
        label: "Resume/CV",
        valueSource: "generated.resumeFile",
        value: "generated-resume.pdf",
        confidence: 0.98
      })
    ]);
  });

  it("requires an AI field autofill provider when requesting a field map", async () => {
    const supabase = new FakeSupabase("fieldMap");
    const extractionProvider = new FakeFieldMapProvider({
      fields: [],
      actions: {},
      warnings: []
    });
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { fieldExtractionProvider: extractionProvider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    await expect(
      service.requestFieldMap(context, sessionId, {
        pageSnapshot: sampleSnapshot
      })
    ).rejects.toMatchObject({
      status: 501,
      code: "field_autofill_provider_required"
    });
    expect(supabase.updates.some((call) => call.table === "apply_assistant_sessions")).toBe(false);
  });

  it("reuses the session field map instead of calling AI field extraction again", async () => {
    const initialFieldMap: FieldMap = {
      fields: [
        {
          elementRef: "field-1",
          label: "First name",
          valueSource: "profile.firstName",
          value: "",
          confidence: 0.93,
          requiresUserReview: true
        },
        {
          elementRef: "field-4",
          label: "Resume/CV - Attach",
          valueSource: "generated.resumeFile",
          value: "generated-resume.pdf",
          confidence: 0.94,
          requiresUserReview: true
        }
      ],
      actions: {
        submitButtonRef: "button-1",
        submitRequiresConfirmation: true
      },
      warnings: []
    };
    const supabase = new FakeSupabase("fieldMap", initialFieldMap, [tailoredResume]);
    const autofillProvider = new FakeFieldMapProvider({
      fields: [
        {
          elementRef: "field-1",
          valueSource: "profile.firstName",
          confidence: 0.96
        }
      ],
      actions: {
        submitButtonRef: "button-1"
      },
      warnings: []
    });
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { fieldAutofillProvider: autofillProvider }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );

    const fieldMap = await service.requestFieldMap(context, sessionId, {
      pageSnapshot: sampleSnapshot
    });

    expect(autofillProvider.calls).toBe(1);
    expect(autofillProvider.lastInput?.generatedResume).toEqual(tailoredResume);
    expect(autofillProvider.lastInput?.fieldExtractionDraft?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementRef: "field-1",
          valueSource: "profile.firstName"
        })
      ])
    );
    expect(fieldMap.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementRef: "field-1",
          valueSource: "profile.firstName",
          value: "Ada",
          requiresUserReview: false
        }),
        expect.objectContaining({
          elementRef: "field-4",
          valueSource: "generated.resumeFile"
        })
      ])
    );
    expect(fieldMap.actions.submitButtonRef).toBe("button-1");
  });

  it("validates AI field classifications without trusting unsafe output", async () => {
    const supabase = new FakeSupabase("fieldMap");
    const extractionDraft: AiFieldMapDraft = {
      fields: [
        {
          elementRef: "field-3",
          valueSource: "user.review",
          confidence: 0.88
        },
        {
          elementRef: "field-6",
          valueSource: "user.review",
          confidence: 0.89
        }
      ],
      actions: {
        submitButtonRef: "button-1"
      },
      warnings: []
    };
    const extractionProvider = new FakeFieldMapProvider(extractionDraft);
    const autofillProvider = new FakeFieldMapProvider({
      fields: [
        {
          elementRef: "field-3",
          valueSource: "profile.phoneNumber",
          confidence: 0.93
        },
        {
          elementRef: "field-6",
          valueSource: "profile.phoneNumber",
          confidence: 0.91
        },
        {
          elementRef: "missing-field",
          valueSource: "profile.email",
          confidence: 0.98
        }
      ],
      actions: {
        nextButtonRef: "missing-button",
        submitButtonRef: "button-1"
      },
      warnings: []
    });
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      {
        fieldAutofillProvider: autofillProvider,
        fieldExtractionProvider: extractionProvider
      }
    );
    const context = await service.requireExtensionContext(
      "rg-team",
      "abcdefghijklmnopqrstuvwxyz0123456789",
      "apply_assistant:use"
    );
    const snapshotWithAmbiguousContact: PageSnapshot = {
      ...sampleSnapshot,
      fields: [
        ...sampleSnapshot.fields,
        {
          ref: "field-6",
          kind: "input",
          selector: 'input[name="contact_number"]',
          label: "Primary contact number",
          name: "contact_number",
          inputType: "text",
          required: true,
          options: []
        }
      ]
    };

    const fieldMap = await service.requestFieldMap(context, sessionId, {
      pageSnapshot: snapshotWithAmbiguousContact
    });

    expect(extractionProvider.calls).toBe(1);
    expect(autofillProvider.calls).toBe(1);
    expect(autofillProvider.lastInput?.fieldExtractionDraft).toEqual(extractionDraft);
    expect(fieldMap.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementRef: "field-3",
          valueSource: "user.review",
          requiresUserReview: true
        }),
        expect.objectContaining({
          elementRef: "field-6",
          valueSource: "profile.phoneNumber",
          value: "555-0101",
          requiresUserReview: false
        })
      ])
    );
    expect(fieldMap.fields.some((field) => field.elementRef === "missing-field")).toBe(false);
    expect(fieldMap.actions.submitButtonRef).toBe("button-1");
    expect(fieldMap.actions.submitRequiresConfirmation).toBe(true);
    expect(fieldMap.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("AI mapped sensitive field field-3"),
        expect.stringContaining("AI field map referenced unknown field missing-field"),
        expect.stringContaining("AI field map referenced unknown next button missing-button")
      ])
    );
  });
});

describe("resume HTML sanitization", () => {
  it("formats stored resume dates as Month YYYY", () => {
    expect(formatResumeDates("2025-05-01 – 2026-08")).toBe("May 2025 – August 2026");
  });

  it("preserves safe template styling while removing active or external content", () => {
    const sanitized = sanitizeResumeHtml(
      '<section class="resume" style="font-family: Arial; color: #123456; background-image: url(https://evil.example/x)"><style>.resume{font-size:12px}</style><h1 onclick="alert(1)">Ada</h1><a href="https://evil.example">Profile</a></section>'
    );

    expect(sanitized).toContain('class="resume"');
    expect(sanitized).toContain('style="font-family: Arial; color: #123456"');
    expect(sanitized).not.toContain("background-image");
    expect(sanitized).not.toContain("<style");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("href");
  });
});
