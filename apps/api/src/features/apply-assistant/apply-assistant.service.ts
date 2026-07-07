import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { sortJobMarketsByUsage } from "../tracking/tracking-query";
import { TrackingRecordMapper } from "../tracking/tracking-record.mapper";
import type {
  BidRecordRow,
  TrackingJobMarketRow,
  TrackingProfileRow
} from "../tracking/tracking.types";
import { trackingJobMarketFields, trackingProfileFields } from "../tracking/tracking.types";
import { TrackingAccessService, type TrackingContext } from "../tracking/tracking-access.service";
import type { WorkspaceMemberRow, WorkspaceRow } from "../workspace/workspace-access.types";
import type {
  ApplyAssistantFieldMapInput,
  ApplyAssistantSessionInput,
  ApplyAssistantConnectInput,
  ApplyAssistantTokenInput,
  ElementSnapshot,
  ExtensionScope,
  ExtractedJob,
  FieldMap,
  MappedField,
  PageSnapshot
} from "./apply-assistant.schemas";
import {
  applySessionResponseSchema,
  extractedJobSchema,
  fieldMapSchema
} from "./apply-assistant.schemas";
import type {
  ApplyAssistantSessionRow,
  ExtensionConnectionCodeRow,
  ExtensionTokenRow
} from "./apply-assistant.types";
import {
  applyAssistantSessionFields,
  extensionConnectionCodeFields,
  extensionTokenFields
} from "./apply-assistant.types";
import type { AiFieldMapDraft, ApplyAssistantFieldMapProvider } from "./apply-assistant-ai";

const extensionTokenTtlDays = 30;
const minAutoFillConfidence = 0.75;

export type ExtensionContext = {
  workspace: Pick<WorkspaceRow, "id" | "name" | "slug" | "status" | "created_at">;
  member: WorkspaceMemberRow;
  token: ExtensionTokenRow;
};

export type ApplyAssistantServiceOptions = {
  fieldMapProvider?: ApplyAssistantFieldMapProvider | null;
};

type ProfileFieldSource = Exclude<
  MappedField["valueSource"],
  "generated.resumeFile" | "generated.resumeText" | "generated.coverLetter" | "user.review"
>;

export class ApplyAssistantService {
  private readonly access: TrackingAccessService;
  private readonly records = new TrackingRecordMapper();
  private readonly fieldMapProvider: ApplyAssistantFieldMapProvider | null;

  constructor(
    private readonly supabase: SupabaseRestClient,
    private readonly tokenSecret: string,
    options: ApplyAssistantServiceOptions = {}
  ) {
    this.access = new TrackingAccessService(supabase);
    this.fieldMapProvider = options.fieldMapProvider ?? null;
  }

  async createConnectionCode(slug: string, user: AuthUser, input: ApplyAssistantConnectInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireAnyRole(context, ["admin", "bidder"]);

    const code = randomOpaqueSecret(32);
    const codeHash = await this.hashSecret(code);
    const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000).toISOString();
    const [row] = await this.supabase.insert<ExtensionConnectionCodeRow>(
      "extension_connection_codes",
      [
        {
          workspace_id: context.workspace.id,
          member_id: context.member.id,
          code_hash: codeHash,
          scopes: input.scopes,
          expires_at: expiresAt
        }
      ]
    );

    if (!row) {
      throw apiError(
        502,
        "Extension connection code creation did not return a row.",
        "extension_connect_failed"
      );
    }

    await this.audit(context, "apply_assistant.connection_code.created", row.id, {
      scopes: row.scopes,
      expiresAt: row.expires_at
    });

    return {
      codeId: row.id,
      code,
      workspaceId: row.workspace_id,
      memberId: row.member_id,
      scopes: row.scopes,
      expiresAt: row.expires_at
    };
  }

  async exchangeConnectionCode(slug: string, input: ApplyAssistantTokenInput) {
    const now = new Date().toISOString();
    const codeHash = await this.hashSecret(input.code);
    const [codeRow] = await this.supabase.select<ExtensionConnectionCodeRow>(
      "extension_connection_codes",
      extensionConnectionCodeFields,
      {
        code_hash: `eq.${codeHash}`,
        consumed_at: "is.null",
        expires_at: `gt.${now}`
      }
    );

    if (!codeRow) {
      throw apiError(
        404,
        "Extension connection code is invalid or expired.",
        "extension_connect_code_invalid"
      );
    }

    const workspace = await this.requireActiveWorkspaceBySlug(slug);
    if (workspace.id !== codeRow.workspace_id) {
      throw apiError(
        404,
        "Extension connection code is invalid or expired.",
        "extension_connect_code_invalid"
      );
    }

    const member = await this.requireActiveWorkspaceMember(codeRow.workspace_id, codeRow.member_id);
    if (input.profileId) {
      await this.access.requireProfiles(workspace.id, [input.profileId]);
    }
    if (input.jobMarketId) {
      await this.access.requireMarket(workspace.id, input.jobMarketId);
    }

    const [consumed] = await this.supabase.update<ExtensionConnectionCodeRow>(
      "extension_connection_codes",
      { consumed_at: now },
      {
        id: `eq.${codeRow.id}`,
        consumed_at: "is.null"
      }
    );
    if (!consumed) {
      throw apiError(
        409,
        "Extension connection code was already used.",
        "extension_connect_code_used"
      );
    }

    const token = randomOpaqueSecret(48);
    const tokenHash = await this.hashSecret(token);
    const expiresAt = new Date(Date.now() + extensionTokenTtlDays * 24 * 60 * 60_000).toISOString();
    const [tokenRow] = await this.supabase.insert<ExtensionTokenRow>("extension_tokens", [
      {
        workspace_id: codeRow.workspace_id,
        member_id: codeRow.member_id,
        default_profile_id: input.profileId ?? null,
        default_job_market_id: input.jobMarketId ?? null,
        token_hash: tokenHash,
        scopes: codeRow.scopes,
        expires_at: expiresAt
      }
    ]);

    if (!tokenRow) {
      throw apiError(
        502,
        "Extension token creation did not return a row.",
        "extension_token_create_failed"
      );
    }

    await this.supabase.insert("audit_logs", [
      {
        workspace_id: tokenRow.workspace_id,
        actor_id: member.auth_user_id,
        actor_member_id: tokenRow.member_id,
        action: "apply_assistant.extension_token.created",
        target_type: "extension_token",
        target_id: tokenRow.id,
        metadata: {
          scopes: tokenRow.scopes,
          defaultProfileId: tokenRow.default_profile_id,
          defaultJobMarketId: tokenRow.default_job_market_id,
          expiresAt: tokenRow.expires_at
        }
      }
    ]);

    return {
      tokenId: tokenRow.id,
      token,
      workspaceId: tokenRow.workspace_id,
      memberId: tokenRow.member_id,
      defaultProfileId: tokenRow.default_profile_id,
      defaultJobMarketId: tokenRow.default_job_market_id,
      scopes: tokenRow.scopes,
      expiresAt: tokenRow.expires_at
    };
  }

  async listTokens(slug: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const now = new Date().toISOString();
    const rows = await this.supabase.select<ExtensionTokenRow>(
      "extension_tokens",
      extensionTokenFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        member_id: `eq.${context.member.id}`,
        revoked_at: "is.null",
        expires_at: `gt.${now}`
      },
      { order: "created_at.desc" }
    );

    return {
      tokens: rows.map((row) => ({
        tokenId: row.id,
        workspaceId: row.workspace_id,
        memberId: row.member_id,
        defaultProfileId: row.default_profile_id,
        defaultJobMarketId: row.default_job_market_id,
        scopes: row.scopes,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at
      }))
    };
  }

  async revokeToken(slug: string, tokenId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const now = new Date().toISOString();
    const [token] = await this.supabase.update<ExtensionTokenRow>(
      "extension_tokens",
      { revoked_at: now },
      {
        id: `eq.${tokenId}`,
        workspace_id: `eq.${context.workspace.id}`,
        member_id: `eq.${context.member.id}`,
        revoked_at: "is.null"
      }
    );

    if (!token) {
      throw apiError(404, "Extension token was not found.", "extension_token_not_found");
    }

    await this.audit(context, "apply_assistant.extension_token.revoked", token.id, {});

    return {
      ok: true,
      tokenId: token.id,
      revokedAt: token.revoked_at ?? now
    };
  }

  async requireExtensionContext(
    slug: string,
    tokenValue: string,
    requiredScope: ExtensionScope
  ): Promise<ExtensionContext> {
    const context = await this.requireExtensionContextByToken(tokenValue, requiredScope);
    if (context.workspace.slug !== slug) {
      throw apiError(
        403,
        "Extension token is not scoped to this workspace.",
        "workspace_scope_mismatch"
      );
    }

    return context;
  }

  async extensionTokenContext(tokenValue: string) {
    const context = await this.requireExtensionContextByToken(tokenValue, "apply_assistant:use");
    const [profiles, markets, memberBids] = await Promise.all([
      this.supabase.select<TrackingProfileRow>(
        "tracking_profiles",
        trackingProfileFields,
        {
          workspace_id: `eq.${context.workspace.id}`,
          deleted_at: "is.null"
        },
        { order: "name.asc,id.asc" }
      ),
      this.supabase.select<TrackingJobMarketRow>("tracking_job_markets", trackingJobMarketFields, {
        workspace_id: `eq.${context.workspace.id}`,
        deleted_at: "is.null"
      }),
      this.supabase.select<Pick<BidRecordRow, "job_market_id">>("bid_records", "job_market_id", {
        workspace_id: `eq.${context.workspace.id}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      })
    ]);
    const usageByMarketId = new Map<string, number>();
    for (const bid of memberBids) {
      if (bid.job_market_id) {
        usageByMarketId.set(bid.job_market_id, (usageByMarketId.get(bid.job_market_id) ?? 0) + 1);
      }
    }

    return {
      token: {
        tokenId: context.token.id,
        defaultProfileId: context.token.default_profile_id,
        defaultJobMarketId: context.token.default_job_market_id,
        scopes: context.token.scopes,
        expiresAt: context.token.expires_at,
        lastUsedAt: context.token.last_used_at,
        createdAt: context.token.created_at
      },
      workspace: {
        id: context.workspace.id,
        name: context.workspace.name,
        slug: context.workspace.slug
      },
      member: {
        id: context.member.id,
        authUserId: context.member.auth_user_id,
        email: context.member.email,
        displayName: context.member.display_name
      },
      profiles: profiles
        .map(profileSummary)
        .sort((left, right) => left.name.localeCompare(right.name)),
      jobMarkets: sortJobMarketsByUsage(markets, usageByMarketId).map((market) => {
        const mapped = this.records.market(market);
        return {
          id: mapped.id,
          name: mapped.name,
          system: mapped.system,
          createdAt: mapped.createdAt
        };
      })
    };
  }

  private async requireExtensionContextByToken(
    tokenValue: string,
    requiredScope: ExtensionScope
  ): Promise<ExtensionContext> {
    const now = new Date().toISOString();
    const tokenHash = await this.hashSecret(tokenValue);
    const [token] = await this.supabase.select<ExtensionTokenRow>(
      "extension_tokens",
      extensionTokenFields,
      {
        token_hash: `eq.${tokenHash}`,
        revoked_at: "is.null",
        expires_at: `gt.${now}`
      }
    );

    if (!token) {
      throw apiError(401, "Extension token is invalid or expired.", "extension_token_invalid");
    }
    if (!token.scopes.includes(requiredScope)) {
      throw apiError(
        403,
        "Extension token does not allow this action.",
        "extension_scope_required"
      );
    }

    const [workspace, member] = await Promise.all([
      this.requireActiveWorkspaceById(token.workspace_id),
      this.requireActiveWorkspaceMember(token.workspace_id, token.member_id)
    ]);
    await this.supabase.update<ExtensionTokenRow>(
      "extension_tokens",
      { last_used_at: now },
      {
        id: `eq.${token.id}`,
        revoked_at: "is.null"
      }
    );

    return {
      workspace,
      member,
      token
    };
  }

  async createApplySession(context: ExtensionContext, input: ApplyAssistantSessionInput) {
    const profileId = input.profileId ?? context.token.default_profile_id ?? undefined;
    const jobMarketId = input.jobMarketId ?? context.token.default_job_market_id ?? undefined;
    if (profileId) {
      await this.access.requireProfiles(context.workspace.id, [profileId]);
    }
    if (jobMarketId) {
      await this.access.requireMarket(context.workspace.id, jobMarketId);
    }

    const extractedJob = extractJob(input.pageSnapshot);
    const id = crypto.randomUUID();
    const [session] = await this.supabase.insert<ApplyAssistantSessionRow>(
      "apply_assistant_sessions",
      [
        {
          id,
          workspace_id: context.workspace.id,
          member_id: context.member.id,
          profile_id: profileId ?? null,
          job_market_id: jobMarketId ?? null,
          page_url: input.pageSnapshot.pageUrl,
          page_origin: input.pageSnapshot.pageOrigin,
          page_title: input.pageSnapshot.pageTitle,
          page_snapshot: input.pageSnapshot,
          extracted_job: extractedJob,
          field_map: null,
          resume_versions: [],
          status: "draft"
        }
      ]
    );

    if (!session) {
      throw apiError(
        502,
        "Apply session creation did not return a row.",
        "apply_session_create_failed"
      );
    }

    await this.auditExtension(context, "apply_assistant.session.created", session.id, {
      pageUrl: session.page_url,
      profileId: session.profile_id,
      jobMarketId: session.job_market_id
    });

    return sessionResponse(session);
  }

  async requestFieldMap(
    context: ExtensionContext,
    sessionId: string,
    input: ApplyAssistantFieldMapInput
  ) {
    const session = await this.requireOwnedSession(context, sessionId);
    const profile = session.profile_id
      ? await this.profileById(context.workspace.id, session.profile_id)
      : null;
    const deterministicFieldMap = createConservativeFieldMap(input.pageSnapshot, profile);
    const fieldMap = await this.enhanceFieldMap(input.pageSnapshot, profile, deterministicFieldMap);
    const now = new Date().toISOString();
    const [updated] = await this.supabase.update<ApplyAssistantSessionRow>(
      "apply_assistant_sessions",
      {
        page_snapshot: input.pageSnapshot,
        field_map: fieldMap,
        status: "reviewing",
        updated_at: now
      },
      {
        id: `eq.${session.id}`,
        workspace_id: `eq.${context.workspace.id}`,
        member_id: `eq.${context.member.id}`
      }
    );

    if (!updated) {
      throw apiError(
        502,
        "Apply session update did not return a row.",
        "apply_session_update_failed"
      );
    }

    await this.auditExtension(context, "apply_assistant.field_map.created", session.id, {
      mappedFieldCount: fieldMap.fields.length,
      warningCount: fieldMap.warnings.length
    });

    return fieldMapSchema.parse(fieldMap);
  }

  private async enhanceFieldMap(
    snapshot: PageSnapshot,
    profile: TrackingProfileRow | null,
    deterministicFieldMap: FieldMap
  ): Promise<FieldMap> {
    if (!this.fieldMapProvider) {
      return deterministicFieldMap;
    }

    try {
      const draft = await this.fieldMapProvider.createFieldMap({
        snapshot,
        deterministicFieldMap
      });
      const aiFieldMap = fieldMapFromAiDraft(draft, snapshot, profile);
      return mergeFieldMaps(deterministicFieldMap, aiFieldMap);
    } catch (error) {
      return fieldMapSchema.parse({
        ...deterministicFieldMap,
        warnings: appendWarning(
          deterministicFieldMap.warnings,
          `AI field analysis failed: ${errorMessage(error)}. Used deterministic mapping.`
        )
      });
    }
  }

  private async requireOwnedSession(
    context: ExtensionContext,
    sessionId: string
  ): Promise<ApplyAssistantSessionRow> {
    const [session] = await this.supabase.select<ApplyAssistantSessionRow>(
      "apply_assistant_sessions",
      applyAssistantSessionFields,
      {
        id: `eq.${sessionId}`,
        workspace_id: `eq.${context.workspace.id}`,
        member_id: `eq.${context.member.id}`
      }
    );
    if (!session) {
      throw apiError(404, "Apply session was not found.", "apply_session_not_found");
    }

    return session;
  }

  private async profileById(
    workspaceId: string,
    profileId: string
  ): Promise<TrackingProfileRow | null> {
    const [profile] = await this.supabase.select<TrackingProfileRow>(
      "tracking_profiles",
      trackingProfileFields,
      {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${profileId}`,
        deleted_at: "is.null"
      }
    );

    return profile ?? null;
  }

  private async requireActiveWorkspaceBySlug(
    slug: string
  ): Promise<Pick<WorkspaceRow, "id" | "name" | "slug" | "status" | "created_at">> {
    const [workspace] = await this.supabase.select<
      Pick<WorkspaceRow, "id" | "name" | "slug" | "status" | "created_at">
    >("workspaces", "id,name,slug,status,created_at", {
      slug: `eq.${slug}`,
      status: "eq.active",
      deleted_at: "is.null"
    });
    if (!workspace) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    return workspace;
  }

  private async requireActiveWorkspaceById(
    workspaceId: string
  ): Promise<Pick<WorkspaceRow, "id" | "name" | "slug" | "status" | "created_at">> {
    const [workspace] = await this.supabase.select<
      Pick<WorkspaceRow, "id" | "name" | "slug" | "status" | "created_at">
    >("workspaces", "id,name,slug,status,created_at", {
      id: `eq.${workspaceId}`,
      status: "eq.active",
      deleted_at: "is.null"
    });
    if (!workspace) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    return workspace;
  }

  private async requireActiveWorkspaceMember(
    workspaceId: string,
    memberId: string
  ): Promise<WorkspaceMemberRow> {
    const [workspace, member] = await Promise.all([
      this.supabase.select<{ id: string }>("workspaces", "id", {
        id: `eq.${workspaceId}`,
        status: "eq.active",
        deleted_at: "is.null"
      }),
      this.supabase.select<WorkspaceMemberRow>(
        "workspace_members",
        "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
        {
          id: `eq.${memberId}`,
          workspace_id: `eq.${workspaceId}`,
          status: "eq.active",
          deleted_at: "is.null"
        }
      )
    ]);

    if (!workspace[0] || !member[0]) {
      throw apiError(
        403,
        "Extension connection requires an active workspace membership.",
        "workspace_access_required"
      );
    }

    return member[0];
  }

  private async audit(
    context: TrackingContext,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: context.workspace.id,
        actor_id: context.member.auth_user_id,
        actor_member_id: context.member.id,
        action,
        target_type: "extension_token",
        target_id: targetId,
        metadata
      }
    ]);
  }

  private async auditExtension(
    context: ExtensionContext,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: context.workspace.id,
        actor_id: context.member.auth_user_id,
        actor_member_id: context.member.id,
        action,
        target_type: "apply_assistant_session",
        target_id: targetId,
        metadata
      }
    ]);
  }

  private async hashSecret(value: string): Promise<string> {
    const data = new TextEncoder().encode(`${value}.${this.tokenSecret}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return hex(digest);
  }
}

function sessionResponse(session: ApplyAssistantSessionRow) {
  return applySessionResponseSchema.parse({
    id: session.id,
    workspaceId: session.workspace_id,
    status: session.status,
    extractedJob: session.extracted_job ?? undefined,
    fieldMap: session.field_map ?? undefined,
    resumeVersions: session.resume_versions ?? []
  });
}

function profileSummary(profile: TrackingProfileRow) {
  return {
    id: profile.id,
    name: profile.name,
    firstName: profile.first_name ?? null,
    middleName: profile.middle_name ?? null,
    lastName: profile.last_name ?? null,
    email: profile.email ?? null,
    phoneNumber: profile.phone_number ?? null,
    street: profile.street ?? null,
    city: profile.city ?? null,
    state: profile.state ?? null,
    country: profile.country ?? null,
    postalCode: profile.postal_code ?? null,
    linkedinUrl: profile.linkedin_url ?? null
  };
}

function extractJob(snapshot: PageSnapshot): ExtractedJob {
  const text = compactWhitespace(snapshot.visibleText);
  if (text.length < 50) {
    throw apiError(
      400,
      "The active page does not include enough visible job text to create an apply session.",
      "job_text_too_short"
    );
  }

  const jobPosting = firstJobPosting(snapshot);
  const title = stringValue(jobPosting?.title) ?? titleFromPageTitle(snapshot.pageTitle);
  const company =
    stringValue(recordValue(jobPosting?.hiringOrganization, "name")) ??
    companyFromPageTitle(snapshot.pageTitle);
  const warnings: string[] = [];
  if (!title) {
    warnings.push("Job title was inferred from the page text and needs review.");
  }
  if (!company) {
    warnings.push("Company name was inferred from the page text and needs review.");
  }

  const extracted = {
    jobTitle: title ?? "Unknown role",
    company: company ?? "Unknown company",
    location: jobLocation(jobPosting),
    employmentType: employmentType(jobPosting),
    requirements: matchingSentences(text, /(require|qualification|must|experience|skill)/i),
    responsibilities: matchingSentences(text, /(responsibil|what you.?ll do|you will|build|own)/i),
    skills: detectedSkills(text),
    jobDescriptionText: text,
    confidence: extractionConfidence(Boolean(jobPosting), Boolean(title), Boolean(company), text),
    warnings
  };

  return extractedJobSchema.parse(extracted);
}

function firstJobPosting(snapshot: PageSnapshot): Record<string, unknown> | null {
  for (const item of snapshot.jsonLdJobPostings) {
    const type = item["@type"];
    if (
      type === "JobPosting" ||
      (Array.isArray(type) && type.includes("JobPosting")) ||
      stringValue(item.title)
    ) {
      return item;
    }
  }

  return null;
}

function titleFromPageTitle(pageTitle: string): string | undefined {
  const [first] = pageTitle.split(/\s[-|]\s/);
  return cleanText(first);
}

function companyFromPageTitle(pageTitle: string): string | undefined {
  const parts = pageTitle
    .split(/\s[-|]\s/)
    .map(cleanText)
    .filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : undefined;
}

function jobLocation(jobPosting: Record<string, unknown> | null): string | undefined {
  const location = jobPosting?.jobLocation;
  if (typeof location === "string") {
    return cleanText(location);
  }
  if (Array.isArray(location)) {
    return cleanText(location.map(locationText).filter(Boolean).join(", "));
  }

  return locationText(location);
}

function locationText(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const address = recordValue(value, "address");
  if (typeof address === "string") {
    return cleanText(address);
  }
  if (isRecord(address)) {
    return cleanText(
      [
        stringValue(address.addressLocality),
        stringValue(address.addressRegion),
        stringValue(address.addressCountry)
      ]
        .filter(Boolean)
        .join(", ")
    );
  }

  return stringValue(value.name);
}

function employmentType(jobPosting: Record<string, unknown> | null): string | undefined {
  const value = jobPosting?.employmentType;
  if (Array.isArray(value)) {
    return cleanText(value.map(stringValue).filter(Boolean).join(", "));
  }

  return stringValue(value);
}

function matchingSentences(text: string, pattern: RegExp): string[] {
  return text
    .split(/[.!?]\s+/)
    .map(cleanText)
    .filter((sentence): sentence is string => Boolean(sentence && pattern.test(sentence)))
    .slice(0, 8);
}

function detectedSkills(text: string): string[] {
  const skills = [
    "React",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "Python",
    "Java",
    "SQL",
    "PostgreSQL",
    "AWS",
    "GCP",
    "Azure",
    "Docker",
    "Kubernetes",
    "GraphQL",
    "REST",
    "Accessibility",
    "Testing",
    "CI/CD",
    "Machine Learning"
  ];
  const normalized = ` ${normalizeForMatch(text)} `;
  return skills.filter((skill) => normalized.includes(` ${normalizeForMatch(skill)} `));
}

function extractionConfidence(
  hasJsonLd: boolean,
  hasTitle: boolean,
  hasCompany: boolean,
  text: string
): number {
  const score =
    0.55 +
    (hasJsonLd ? 0.12 : 0) +
    (hasTitle ? 0.12 : 0) +
    (hasCompany ? 0.12 : 0) +
    (text.length >= 300 ? 0.07 : 0);
  return Math.min(0.94, Number(score.toFixed(2)));
}

function createConservativeFieldMap(
  snapshot: PageSnapshot,
  profile: TrackingProfileRow | null
): FieldMap {
  const warnings: string[] = [];
  if (!profile) {
    warnings.push("No tracking profile was selected; detected fields require user review.");
  }

  const fields = snapshot.fields
    .map((field) => mapSnapshotField(field, profile, warnings))
    .filter((field): field is MappedField => Boolean(field));
  const fieldMap = {
    fields,
    actions: detectedActions(snapshot.buttons),
    warnings
  };

  return fieldMapSchema.parse(fieldMap);
}

function fieldMapFromAiDraft(
  draft: AiFieldMapDraft,
  snapshot: PageSnapshot,
  profile: TrackingProfileRow | null
): FieldMap {
  const fieldsByRef = new Map(snapshot.fields.map((field) => [field.ref, field]));
  const buttonRefs = new Set(snapshot.buttons.map((button) => button.ref));
  const warnings: string[] = [...draft.warnings];
  const fields = draft.fields
    .map((draftField) => {
      const field = fieldsByRef.get(draftField.elementRef);
      if (!field) {
        warnings.push(`AI field map referenced unknown field ${draftField.elementRef}.`);
        return null;
      }

      return mappedFieldFromAiDraftField(field, draftField, profile, warnings);
    })
    .filter((field): field is MappedField => Boolean(field));
  const nextButtonRef =
    draft.actions.nextButtonRef && buttonRefs.has(draft.actions.nextButtonRef)
      ? draft.actions.nextButtonRef
      : undefined;
  const submitButtonRef =
    draft.actions.submitButtonRef && buttonRefs.has(draft.actions.submitButtonRef)
      ? draft.actions.submitButtonRef
      : undefined;

  if (draft.actions.nextButtonRef && !nextButtonRef) {
    warnings.push(`AI field map referenced unknown next button ${draft.actions.nextButtonRef}.`);
  }
  if (draft.actions.submitButtonRef && !submitButtonRef) {
    warnings.push(
      `AI field map referenced unknown submit button ${draft.actions.submitButtonRef}.`
    );
  }

  return fieldMapSchema.parse({
    fields,
    actions: {
      ...(nextButtonRef ? { nextButtonRef } : {}),
      ...(submitButtonRef ? { submitButtonRef } : {}),
      submitRequiresConfirmation: true
    },
    warnings: uniqueWarnings(warnings)
  });
}

function mappedFieldFromAiDraftField(
  field: ElementSnapshot,
  draftField: AiFieldMapDraft["fields"][number],
  profile: TrackingProfileRow | null,
  warnings: string[]
): MappedField {
  const confidence = Number(draftField.confidence.toFixed(2));

  if (draftField.valueSource === "user.review") {
    return reviewField(field);
  }

  if (draftField.valueSource === "generated.resumeFile") {
    if (field.kind !== "file") {
      warnings.push(`AI mapped resume file to non-file field ${field.ref}; review required.`);
      return reviewField(field);
    }

    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.resumeFile",
      value: "generated-resume.pdf",
      confidence,
      requiresUserReview: true
    };
  }

  if (draftField.valueSource === "generated.resumeText") {
    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.resumeText",
      value: "",
      confidence: Math.min(confidence, 0.55),
      requiresUserReview: true
    };
  }

  if (draftField.valueSource === "generated.coverLetter") {
    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.coverLetter",
      value: field.kind === "file" ? "generated-cover-letter.pdf" : "",
      confidence,
      requiresUserReview: true
    };
  }

  if (isProfileFieldSource(draftField.valueSource)) {
    if (isSensitiveOrScreening(fieldMatchText(field))) {
      warnings.push(`AI mapped sensitive field ${field.ref} to profile data; review required.`);
      return reviewField(field);
    }

    const value = profile ? profileValue(profile, draftField.valueSource) : "";
    const adjustedValue = value && hasOptions(field) ? selectCompatibleValue(field, value) : value;
    const adjustedConfidence = adjustedValue ? confidence : 0.35;
    if (value && !adjustedValue) {
      warnings.push(
        `Review ${field.label || field.ref}; AI-selected profile value was not found in options.`
      );
    }

    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: draftField.valueSource,
      value: adjustedValue,
      confidence: adjustedConfidence,
      requiresUserReview:
        Boolean(field.disabled || field.readOnly) ||
        !adjustedValue ||
        adjustedConfidence < minAutoFillConfidence ||
        hasOptions(field) ||
        draftField.requiresUserReview === true
    };
  }

  return reviewField(field);
}

function mergeFieldMaps(deterministicFieldMap: FieldMap, aiFieldMap: FieldMap): FieldMap {
  const fieldsByRef = new Map(
    deterministicFieldMap.fields.map((field) => [field.elementRef, field])
  );
  for (const aiField of aiFieldMap.fields) {
    const existing = fieldsByRef.get(aiField.elementRef);
    if (!existing || shouldUseAiField(existing, aiField)) {
      fieldsByRef.set(aiField.elementRef, aiField);
    }
  }

  const nextButtonRef =
    deterministicFieldMap.actions.nextButtonRef ?? aiFieldMap.actions.nextButtonRef;
  const submitButtonRef =
    deterministicFieldMap.actions.submitButtonRef ?? aiFieldMap.actions.submitButtonRef;

  return fieldMapSchema.parse({
    fields: Array.from(fieldsByRef.values()),
    actions: {
      ...(nextButtonRef ? { nextButtonRef } : {}),
      ...(submitButtonRef ? { submitButtonRef } : {}),
      submitRequiresConfirmation: true
    },
    warnings: uniqueWarnings([...deterministicFieldMap.warnings, ...aiFieldMap.warnings])
  });
}

function shouldUseAiField(existing: MappedField, candidate: MappedField): boolean {
  if (candidate.valueSource === "user.review") {
    return false;
  }

  if (
    existing.valueSource === "generated.resumeFile" ||
    existing.valueSource === "generated.coverLetter"
  ) {
    return false;
  }

  if (existing.valueSource === "user.review") {
    return true;
  }

  return (
    existing.valueSource === candidate.valueSource && !existing.value && Boolean(candidate.value)
  );
}

function mapSnapshotField(
  field: ElementSnapshot,
  profile: TrackingProfileRow | null,
  warnings: string[]
): MappedField | null {
  const text = fieldMatchText(field);
  if (/\b(resume|cv|curriculum vitae)\b/.test(text)) {
    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.resumeFile",
      value: "generated-resume.pdf",
      confidence: field.kind === "file" ? 0.84 : 0.5,
      requiresUserReview: true
    };
  }

  if (/\bcover letter\b/.test(text)) {
    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.coverLetter",
      value: field.kind === "file" ? "generated-cover-letter.pdf" : "",
      confidence: field.kind === "file" || field.kind === "textarea" ? 0.78 : 0.55,
      requiresUserReview: true
    };
  }

  if (isSensitiveOrScreening(text)) {
    return reviewField(field);
  }

  const source = profileSourceForField(text);
  if (source) {
    const value = profile ? profileValue(profile, source) : "";
    const adjustedValue = value && hasOptions(field) ? selectCompatibleValue(field, value) : value;
    const confidence = value ? profileFieldConfidence(field, source, adjustedValue) : 0.35;
    const requiresUserReview =
      !adjustedValue || confidence < minAutoFillConfidence || hasOptions(field);
    if (value && !adjustedValue) {
      warnings.push(
        `Review ${field.label || field.ref}; profile value was not found in select options.`
      );
    }

    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: source,
      value: adjustedValue,
      confidence,
      requiresUserReview
    };
  }

  if (field.required || field.kind === "textarea" || text.includes("?")) {
    return reviewField(field);
  }

  return null;
}

function profileSourceForField(text: string): ProfileFieldSource | null {
  if (/\b(e-?mail|email address)\b/.test(text)) return "profile.email";
  if (/\b(phone|mobile|cell|telephone)\b/.test(text)) return "profile.phoneNumber";
  if (/\blinkedin\b/.test(text)) return "profile.linkedinUrl";
  if (/\b(first|given)\b.*\bname\b|\bname\b.*\b(first|given)\b/.test(text)) {
    return "profile.firstName";
  }
  if (/\bmiddle\b.*\bname\b|\bname\b.*\bmiddle\b/.test(text)) return "profile.middleName";
  if (/\b(last|family|surname)\b.*\bname\b|\bname\b.*\b(last|family|surname)\b/.test(text)) {
    return "profile.lastName";
  }
  if (/\b(street|address line 1|address1|address)\b/.test(text)) return "profile.street";
  if (/\bcity\b/.test(text)) return "profile.city";
  if (/\b(state|province|region)\b/.test(text)) return "profile.state";
  if (/\b(country|nation|nationality)\b/.test(text)) return "profile.country";
  if (/\b(zip|postal)\b/.test(text)) return "profile.postalCode";
  return null;
}

function isProfileFieldSource(source: MappedField["valueSource"]): source is ProfileFieldSource {
  return source.startsWith("profile.");
}

function profileValue(profile: TrackingProfileRow, source: ProfileFieldSource): string {
  switch (source) {
    case "profile.firstName":
      return profile.first_name ?? "";
    case "profile.middleName":
      return profile.middle_name ?? "";
    case "profile.lastName":
      return profile.last_name ?? "";
    case "profile.email":
      return profile.email ?? "";
    case "profile.phoneNumber":
      return profile.phone_number ?? "";
    case "profile.street":
      return profile.street ?? "";
    case "profile.city":
      return profile.city ?? "";
    case "profile.state":
      return profile.state ?? "";
    case "profile.country":
      return profile.country ?? "";
    case "profile.postalCode":
      return profile.postal_code ?? "";
    case "profile.linkedinUrl":
      return profile.linkedin_url ?? "";
    default:
      return "";
  }
}

function profileFieldConfidence(
  field: ElementSnapshot,
  source: ProfileFieldSource,
  value: string
): number {
  if (!value) {
    return 0.35;
  }
  if (field.kind === "select") {
    return 0.76;
  }
  if (source === "profile.email" && field.inputType === "email") {
    return 0.96;
  }
  if (source === "profile.phoneNumber" && field.inputType === "tel") {
    return 0.94;
  }
  if (source === "profile.country" && hasOptions(field)) {
    return 0.78;
  }

  return 0.9;
}

function hasOptions(field: ElementSnapshot): boolean {
  return field.kind === "select" || field.kind === "combobox" || field.kind === "listbox";
}

function selectCompatibleValue(field: ElementSnapshot, value: string): string {
  const normalized = normalizeForMatch(value);
  const match = field.options.find((option) => normalizeForMatch(option) === normalized);
  return match ?? "";
}

function detectedActions(buttons: ElementSnapshot[]): FieldMap["actions"] {
  const nextButtonRef = buttons.find((button) =>
    /\b(next|continue|save and continue)\b/.test(fieldMatchText(button))
  )?.ref;
  const submitButtonRef = buttons.find((button) =>
    /\b(submit|send application|apply)\b/.test(fieldMatchText(button))
  )?.ref;

  return {
    ...(nextButtonRef ? { nextButtonRef } : {}),
    ...(submitButtonRef ? { submitButtonRef } : {}),
    submitRequiresConfirmation: true
  };
}

function reviewField(field: ElementSnapshot): MappedField {
  return {
    elementRef: field.ref,
    label: field.label,
    valueSource: "user.review",
    value: "",
    confidence: 0.35,
    requiresUserReview: true
  };
}

function appendWarning(warnings: string[], warning: string): string[] {
  return uniqueWarnings([...warnings, warning]);
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))].slice(0, 50);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown error").slice(0, 300);
}

function isSensitiveOrScreening(text: string): boolean {
  return /\b(visa|sponsor|authorization|authorized|citizen|disability|veteran|race|ethnicity|gender|pronoun|salary|compensation|background|criminal|felony|why|explain|cover letter)\b/.test(
    text
  );
}

function fieldMatchText(field: ElementSnapshot): string {
  return normalizeForMatch(
    [field.label, field.name, field.placeholder, field.visibleText, field.inputType, field.ariaRole]
      .filter(Boolean)
      .join(" ")
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? cleanText(value) : undefined;
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string | undefined): string | undefined {
  const text = compactWhitespace(value ?? "");
  return text || undefined;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function randomOpaqueSecret(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
