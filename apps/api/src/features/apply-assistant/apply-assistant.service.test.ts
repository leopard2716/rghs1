import { describe, expect, it } from "vitest";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import type { AiFieldMapDraft, ApplyAssistantFieldMapProvider } from "./apply-assistant-ai";
import type { PageSnapshot } from "./apply-assistant.schemas";
import { ApplyAssistantService } from "./apply-assistant.service";

const workspaceId = "7dc5bfd2-452b-4625-9ea3-14f307db5feb";
const memberId = "64683d54-766c-4335-85d7-a3dd627d4282";
const authUserId = "7eef51d8-6d9e-4ed2-92c6-634bb80603df";
const roleId = "6c330b76-62a9-48af-a1d4-40338dd23a7f";
const codeId = "98a026f2-5ace-4ae7-bc75-c55e920733c2";
const tokenId = "7a9e0ea8-ec75-4ef5-9dac-506502a6ac8c";
const profileId = "8153792e-83a8-42ea-9bf0-8e16395e20ba";
const jobMarketId = "f8dcb88f-9146-45f1-b6df-a046ae58f7a8";
const sessionId = "22cb636d-8093-44ba-b44b-ef4ab8dcfd4c";

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
      | "tokenContext"
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
      (this.mode === "session" || this.mode === "fieldMap" || this.mode === "tokenContext")
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
          field_map: null,
          resume_versions: [],
          status: "draft",
          created_at: "2026-07-06T12:02:00.000Z",
          updated_at: "2026-07-06T12:02:00.000Z"
        }
      ] as T[];
    }
    if (
      table === "tracking_profiles" &&
      (this.mode === "exchange" || this.mode === "fieldMap" || this.mode === "tokenContext")
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
      (this.mode === "exchange" || this.mode === "tokenContext")
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
  constructor(private readonly draft: AiFieldMapDraft) {}

  async createFieldMap(): Promise<AiFieldMapDraft> {
    return this.draft;
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

  it("creates a schema-valid apply session from an extension page snapshot", async () => {
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

    const response = await service.createApplySession(context, {
      pageSnapshot: sampleSnapshot
    });

    expect(response.id).toBe(sessionId);
    expect(response.workspaceId).toBe(workspaceId);
    expect(response.status).toBe("draft");
    expect(response.extractedJob?.jobTitle).toBe("Senior Frontend Engineer");
    expect(response.extractedJob?.company).toBe("ExampleCo");
    expect(response.extractedJob?.skills).toContain("React");
    expect(supabase.inserts.some((call) => call.table === "apply_assistant_sessions")).toBe(true);
  });

  it("returns a conservative profile-backed field map for an apply session", async () => {
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

    const fieldMap = await service.requestFieldMap(context, sessionId, {
      pageSnapshot: sampleSnapshot
    });

    expect(fieldMap.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elementRef: "field-1",
          valueSource: "profile.firstName",
          value: "Ada",
          requiresUserReview: false
        }),
        expect.objectContaining({
          elementRef: "field-2",
          valueSource: "profile.email",
          value: "ada@example.com",
          requiresUserReview: false
        }),
        expect.objectContaining({
          elementRef: "field-3",
          valueSource: "user.review",
          requiresUserReview: true
        }),
        expect.objectContaining({
          elementRef: "field-4",
          valueSource: "generated.resumeFile",
          value: "generated-resume.pdf",
          requiresUserReview: true
        }),
        expect.objectContaining({
          elementRef: "field-5",
          valueSource: "generated.coverLetter",
          value: "generated-cover-letter.pdf",
          requiresUserReview: true
        })
      ])
    );
    expect(fieldMap.actions.submitButtonRef).toBe("button-1");
    expect(fieldMap.actions.submitRequiresConfirmation).toBe(true);
  });

  it("merges validated AI field classifications without trusting unsafe output", async () => {
    const supabase = new FakeSupabase("fieldMap");
    const provider = new FakeFieldMapProvider({
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
        submitButtonRef: "missing-button"
      },
      warnings: []
    });
    const service = new ApplyAssistantService(
      supabase as unknown as SupabaseRestClient,
      "test-secret",
      { fieldMapProvider: provider }
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
        expect.stringContaining("AI field map referenced unknown submit button missing-button")
      ])
    );
  });
});
