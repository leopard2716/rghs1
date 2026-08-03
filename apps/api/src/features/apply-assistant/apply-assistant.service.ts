import type { RichTextDocument, RichTextNode } from "@rghs1/domain";
import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { sortJobMarketsByUsage } from "../tracking/tracking-query";
import { TrackingRecordMapper } from "../tracking/tracking-record.mapper";
import type {
  BidRecordProfileRow,
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
  CommitBidInput,
  CommitBidResponse,
  ElementSnapshot,
  ExtensionScope,
  ExtractedJob,
  FieldMap,
  GeneratedResume,
  GenerateResumeInput,
  MappedField,
  ModifyResumeInput,
  PageSnapshot
} from "./apply-assistant.schemas";
import {
  applySessionResponseSchema,
  commitBidResponseSchema,
  extractedJobSchema,
  fieldMapSchema,
  generatedResumeSchema
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
import type {
  AiFieldMapDraft,
  ApplyAssistantExtractionProvider,
  ApplyAssistantFieldMapProvider,
  ApplyAssistantPageAnalysis,
  ApplyAssistantPageAnalysisProviderInput,
  ApplyAssistantResumeProvider
} from "./apply-assistant-ai";

const extensionTokenTtlDays = 30;
const minAutoFillConfidence = 0.75;

export type ExtensionContext = {
  workspace: Pick<WorkspaceRow, "id" | "name" | "slug" | "status" | "created_at">;
  member: WorkspaceMemberRow;
  token: ExtensionTokenRow;
};

export type ApplyAssistantServiceOptions = {
  extractionProvider?: ApplyAssistantExtractionProvider | null;
  fieldAutofillProvider?: ApplyAssistantFieldMapProvider | null;
  fieldExtractionProvider?: ApplyAssistantFieldMapProvider | null;
  resumeProvider?: ApplyAssistantResumeProvider | null;
};

type ProfileFieldSource = Exclude<
  MappedField["valueSource"],
  | "generated.resumeFile"
  | "generated.resumeText"
  | "generated.coverLetter"
  | "generated.answer"
  | "user.review"
>;

type InitialPageAnalysis = {
  extractedJob: ExtractedJob;
  fieldMap: FieldMap | null;
};

export class ApplyAssistantService {
  private readonly access: TrackingAccessService;
  private readonly records = new TrackingRecordMapper();
  private readonly extractionProvider: ApplyAssistantExtractionProvider | null;
  private readonly fieldAutofillProvider: ApplyAssistantFieldMapProvider | null;
  private readonly fieldExtractionProvider: ApplyAssistantFieldMapProvider | null;
  private readonly resumeProvider: ApplyAssistantResumeProvider | null;

  constructor(
    private readonly supabase: SupabaseRestClient,
    private readonly tokenSecret: string,
    options: ApplyAssistantServiceOptions = {}
  ) {
    this.access = new TrackingAccessService(supabase);
    this.extractionProvider = options.extractionProvider ?? null;
    this.fieldAutofillProvider = options.fieldAutofillProvider ?? null;
    this.fieldExtractionProvider = options.fieldExtractionProvider ?? null;
    this.resumeProvider = options.resumeProvider ?? null;
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

    const profile =
      profileId && this.extractionProvider && supportsPageAnalysis(this.extractionProvider)
        ? await this.profileById(context.workspace.id, profileId)
        : null;
    const initialAnalysis = await this.extractInitialPageAnalysis(input.pageSnapshot, profile);
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
          step_snapshots: [input.pageSnapshot],
          extracted_job: initialAnalysis.extractedJob,
          field_map: initialAnalysis.fieldMap,
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
      jobMarketId: session.job_market_id,
      initialMappedFieldCount: session.field_map?.fields.length ?? 0
    });

    return sessionResponse(session);
  }

  async extractStep(
    context: ExtensionContext,
    sessionId: string,
    input: ApplyAssistantFieldMapInput
  ): Promise<FieldMap> {
    const session = await this.requireOwnedSession(context, sessionId);
    const profile = session.profile_id
      ? await this.profileById(context.workspace.id, session.profile_id)
      : null;
    const extractionDraft = await this.createFieldExtractionDraft(
      input.pageSnapshot,
      profile,
      session.extracted_job
    );
    const fieldMap = fieldMapFromAiDraft(extractionDraft, input.pageSnapshot, null);
    const stepSnapshots = appendStepSnapshot(session.step_snapshots, session.page_snapshot, input.pageSnapshot);
    const now = new Date().toISOString();
    const [updated] = await this.supabase.update<ApplyAssistantSessionRow>(
      "apply_assistant_sessions",
      {
        page_snapshot: input.pageSnapshot,
        step_snapshots: stepSnapshots,
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
      throw apiError(502, "Apply step extraction did not return a row.", "apply_step_extract_failed");
    }

    await this.auditExtension(context, "apply_assistant.step.extracted", session.id, {
      stepNumber: stepSnapshots.length,
      pageUrl: input.pageSnapshot.pageUrl,
      extractedFieldCount: fieldMap.fields.length
    });
    return fieldMapSchema.parse(fieldMap);
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
    const fieldMap = await this.createAiFieldMap(
      input.pageSnapshot,
      profile,
      session.extracted_job,
      reusableFieldMap(session.field_map, input.pageSnapshot),
      session.resume_versions.at(-1)
    );
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

  private async createAiFieldMap(
    snapshot: PageSnapshot,
    profile: TrackingProfileRow | null,
    extractedJob: ExtractedJob | null,
    initialFieldMap: FieldMap | null = null,
    generatedResume?: GeneratedResume
  ): Promise<FieldMap> {
    if (!initialFieldMap && !this.fieldExtractionProvider) {
      throw apiError(
        501,
        "AI field extraction provider is not configured.",
        "field_extraction_provider_required"
      );
    }

    if (!this.fieldAutofillProvider) {
      throw apiError(
        501,
        "AI field autofill provider is not configured.",
        "field_autofill_provider_required"
      );
    }

    const extractionDraft = initialFieldMap
      ? fieldMapToAiDraft(initialFieldMap)
      : await this.createFieldExtractionDraft(snapshot, profile, extractedJob);

    try {
      const autofillDraft = await this.fieldAutofillProvider.createFieldMap({
        snapshot,
        profile,
        extractedJob,
        generatedResume,
        fieldExtractionDraft: extractionDraft
      });
      return mergeAiFieldMaps(
        fieldMapFromAiDraft(extractionDraft, snapshot, null),
        fieldMapFromAiDraft(autofillDraft, snapshot, profile)
      );
    } catch (error) {
      throw apiError(
        502,
        `AI field autofill failed: ${errorMessage(error)}`,
        "field_autofill_provider_failed"
      );
    }
  }

  async generateResume(
    context: ExtensionContext,
    sessionId: string,
    input: GenerateResumeInput
  ): Promise<GeneratedResume> {
    const session = await this.requireOwnedSession(context, sessionId);
    const profile = await this.requireSessionProfile(context.workspace.id, session);
    const extractedJob = requireSessionExtractedJob(session);
    const resume = await this.createResumeVersion(profile, extractedJob, input.refinementNote);
    return this.saveResumeVersion(context, session, resume);
  }

  async modifyResume(
    context: ExtensionContext,
    sessionId: string,
    resumeVersionId: string,
    input: ModifyResumeInput
  ): Promise<GeneratedResume> {
    const session = await this.requireOwnedSession(context, sessionId);
    const profile = await this.requireSessionProfile(context.workspace.id, session);
    const extractedJob = requireSessionExtractedJob(session);
    const existingResume = session.resume_versions.find((resume) => resume.id === resumeVersionId);
    if (!existingResume) {
      throw apiError(404, "Resume version was not found.", "resume_version_not_found");
    }

    const resume = await this.createResumeVersion(
      profile,
      extractedJob,
      input.refinementNote,
      existingResume
    );
    return this.saveResumeVersion(context, session, resume);
  }

  async commitBid(
    context: ExtensionContext,
    sessionId: string,
    input: CommitBidInput
  ): Promise<CommitBidResponse> {
    const session = await this.requireOwnedSession(context, sessionId);
    if (!context.token.scopes.includes("application:create")) {
      throw apiError(
        403,
        "Extension token does not allow bid creation.",
        "extension_scope_required"
      );
    }

    const profileId = session.profile_id ?? context.token.default_profile_id;
    const jobMarketId = session.job_market_id ?? context.token.default_job_market_id;
    if (!profileId) {
      throw apiError(400, "A profile is required before saving the bid.", "profile_required");
    }
    if (!jobMarketId) {
      throw apiError(400, "A job market is required before saving the bid.", "job_market_required");
    }

    await Promise.all([
      this.access.requireProfiles(context.workspace.id, [profileId]),
      this.access.requireMarket(context.workspace.id, jobMarketId)
    ]);

    const extractedJob = requireSessionExtractedJob(session);
    const selectedResume = selectedResumeVersion(session.resume_versions, input.resumeVersionId);
    const reviewedFieldMap = input.fieldMap ?? session.field_map;
    const existingBid = await this.existingBidForSession(context, session);
    const bid = existingBid
      ? await this.updateCommittedBid(
          context,
          existingBid,
          jobMarketId,
          extractedJob,
          session,
          selectedResume,
          reviewedFieldMap
        )
      : await this.createCommittedBid(
          context,
          session,
          jobMarketId,
          extractedJob,
          selectedResume,
          reviewedFieldMap
        );
    await this.upsertCommittedBidProfile(context, bid.id, profileId, selectedResume);

    const now = new Date().toISOString();
    await this.supabase.update<ApplyAssistantSessionRow>(
      "apply_assistant_sessions",
      {
        status: "committed",
        field_map: reviewedFieldMap,
        updated_at: now
      },
      {
        id: `eq.${session.id}`,
        workspace_id: `eq.${context.workspace.id}`,
        member_id: `eq.${context.member.id}`
      }
    );

    await this.auditExtension(context, "apply_assistant.bid.committed", session.id, {
      bidId: bid.id,
      profileId,
      jobMarketId,
      created: !existingBid
    });

    return commitBidResponseSchema.parse({
      sessionId: session.id,
      bidId: bid.id,
      status: "committed",
      created: !existingBid,
      jobTitle: bid.job_title,
      company: bid.company,
      jobLink: bid.job_link
    });
  }

  private async extractInitialPageAnalysis(
    snapshot: PageSnapshot,
    profile: TrackingProfileRow | null
  ): Promise<InitialPageAnalysis> {
    if (!this.extractionProvider) {
      throw apiError(
        501,
        "AI job extraction provider is not configured.",
        "extraction_provider_required"
      );
    }

    try {
      if (supportsPageAnalysis(this.extractionProvider)) {
        const analysis = await this.extractionProvider.analyzePage({ snapshot, profile });
        return {
          extractedJob: preserveSourceJobDescription(analysis.extractedJob, snapshot),
          fieldMap: fieldMapFromAiDraft(analysis.fieldExtractionDraft, snapshot, null)
        };
      }

      return {
        extractedJob: preserveSourceJobDescription(
          await this.extractionProvider.extractJob({ snapshot }),
          snapshot
        ),
        fieldMap: null
      };
    } catch (error) {
      throw apiError(
        502,
        `AI job extraction failed: ${errorMessage(error)}`,
        "extraction_provider_failed"
      );
    }
  }

  private async createFieldExtractionDraft(
    snapshot: PageSnapshot,
    profile: TrackingProfileRow | null,
    extractedJob: ExtractedJob | null
  ): Promise<AiFieldMapDraft> {
    if (!this.fieldExtractionProvider) {
      throw apiError(
        501,
        "AI field extraction provider is not configured.",
        "field_extraction_provider_required"
      );
    }

    try {
      return await this.fieldExtractionProvider.createFieldMap({
        snapshot,
        profile,
        extractedJob
      });
    } catch (error) {
      throw apiError(
        502,
        `AI field extraction failed: ${errorMessage(error)}`,
        "field_extraction_provider_failed"
      );
    }
  }

  private async createResumeVersion(
    profile: TrackingProfileRow,
    extractedJob: ExtractedJob,
    refinementNote?: string,
    existingResume?: GeneratedResume
  ): Promise<GeneratedResume> {
    let resume: GeneratedResume;
    try {
      resume = this.resumeProvider
        ? await this.resumeProvider.generateResume({
            profile,
            extractedJob,
            existingResume,
            refinementNote
          })
        : deterministicResume(profile, extractedJob, refinementNote, existingResume);
    } catch (error) {
      throw apiError(
        502,
        `AI resume generation failed: ${errorMessage(error)}`,
        "resume_generation_failed"
      );
    }

    return sanitizeGeneratedResume({
      ...resume,
      id: crypto.randomUUID()
    });
  }

  private async saveResumeVersion(
    context: ExtensionContext,
    session: ApplyAssistantSessionRow,
    resume: GeneratedResume
  ): Promise<GeneratedResume> {
    const resumeVersions = [...session.resume_versions, resume].slice(-25);
    const now = new Date().toISOString();
    const [updated] = await this.supabase.update<ApplyAssistantSessionRow>(
      "apply_assistant_sessions",
      {
        resume_versions: resumeVersions,
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
      throw apiError(502, "Resume version update did not return a row.", "resume_update_failed");
    }

    await this.auditExtension(context, "apply_assistant.resume.generated", session.id, {
      resumeVersionId: resume.id,
      warningCount: resume.warnings.length,
      missingEvidenceCount: resume.missingEvidence.length
    });

    return resume;
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

  private async requireSessionProfile(
    workspaceId: string,
    session: ApplyAssistantSessionRow
  ): Promise<TrackingProfileRow> {
    if (!session.profile_id) {
      throw apiError(
        400,
        "Select a tracking profile before generating a resume.",
        "profile_required"
      );
    }

    const profile = await this.profileById(workspaceId, session.profile_id);
    if (!profile) {
      throw apiError(404, "Tracking profile was not found.", "profile_not_found");
    }

    return profile;
  }

  private async existingBidForSession(
    context: ExtensionContext,
    session: ApplyAssistantSessionRow
  ): Promise<BidRecordRow | null> {
    const [existing] = await this.supabase.select<BidRecordRow>(
      "bid_records",
      "id,workspace_id,job_market_id,job_title,company,job_link,bid_at,job_description,application_metadata,created_by_member_id,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${context.workspace.id}`,
        created_by_member_id: `eq.${context.member.id}`,
        job_link: `eq.${session.page_url}`,
        deleted_at: "is.null"
      },
      { order: "created_at.desc", limit: 1 }
    );

    return existing ?? null;
  }

  private async createCommittedBid(
    context: ExtensionContext,
    session: ApplyAssistantSessionRow,
    jobMarketId: string,
    extractedJob: ExtractedJob,
    resume: GeneratedResume | null,
    fieldMap: FieldMap | null
  ): Promise<BidRecordRow> {
    const [bid] = await this.supabase.insert<BidRecordRow>("bid_records", [
      {
        id: crypto.randomUUID(),
        workspace_id: context.workspace.id,
        job_market_id: jobMarketId,
        job_title: extractedJob.jobTitle,
        company: extractedJob.company,
        job_link: session.page_url,
        bid_at: new Date().toISOString(),
        job_description: richTextFromJobDescription(
          extractedJob,
          sourceJobDescriptionRichHtml(jobDescriptionSnapshot(session), extractedJob)
        ),
        application_metadata: bidApplicationMetadata(session, extractedJob, resume, fieldMap),
        created_by_member_id: context.member.id
      }
    ]);
    if (!bid) {
      throw apiError(502, "Bid creation did not return a row.", "bid_record_create_failed");
    }

    return bid;
  }

  private async updateCommittedBid(
    context: ExtensionContext,
    existingBid: BidRecordRow,
    jobMarketId: string,
    extractedJob: ExtractedJob,
    session: ApplyAssistantSessionRow,
    resume: GeneratedResume | null,
    fieldMap: FieldMap | null
  ): Promise<BidRecordRow> {
    const [updated] = await this.supabase.update<BidRecordRow>(
      "bid_records",
      {
        job_market_id: jobMarketId,
        job_title: extractedJob.jobTitle,
        company: extractedJob.company,
        job_description: richTextFromJobDescription(
          extractedJob,
          sourceJobDescriptionRichHtml(jobDescriptionSnapshot(session), extractedJob)
        ),
        application_metadata: bidApplicationMetadata(session, extractedJob, resume, fieldMap),
        updated_at: new Date().toISOString()
      },
      {
        id: `eq.${existingBid.id}`,
        workspace_id: `eq.${context.workspace.id}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      }
    );
    if (!updated) {
      throw apiError(502, "Bid update did not return a row.", "bid_record_update_failed");
    }

    return updated;
  }

  private async upsertCommittedBidProfile(
    context: ExtensionContext,
    bidId: string,
    profileId: string,
    resume: GeneratedResume | null
  ): Promise<void> {
    const [existing] = await this.supabase.select<BidRecordProfileRow>(
      "bid_record_profiles",
      "workspace_id,bid_id,profile_id,resume,resume_html,created_at",
      {
        workspace_id: `eq.${context.workspace.id}`,
        bid_id: `eq.${bidId}`,
        profile_id: `eq.${profileId}`
      }
    );
    // The existing bid editor reads `resume`. Keep the complete HTML there as well
    // as in the typed `resume_html` column so Apply Assistant records remain fully
    // editable through the same UI as manually-created bid records.
    const resumeHtml = resume?.resumeHtml ?? null;
    if (existing) {
      await this.supabase.update(
        "bid_record_profiles",
        { resume: resumeHtml, resume_html: resumeHtml },
        {
          workspace_id: `eq.${context.workspace.id}`,
          bid_id: `eq.${bidId}`,
          profile_id: `eq.${profileId}`
        }
      );
      return;
    }

    await this.supabase.insert("bid_record_profiles", [
      {
        workspace_id: context.workspace.id,
        bid_id: bidId,
        profile_id: profileId,
        resume: resumeHtml,
        resume_html: resumeHtml
      }
    ]);
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

function bidApplicationMetadata(
  session: ApplyAssistantSessionRow,
  extractedJob: ExtractedJob,
  resume: GeneratedResume | null,
  fieldMap: FieldMap | null
): Record<string, unknown> {
  return {
    source: "apply-assistant",
    capturedAt: new Date().toISOString(),
    page: {
      url: session.page_url,
      origin: session.page_origin,
      title: session.page_title
    },
    pageSnapshot: session.page_snapshot,
    pageSnapshots: session.step_snapshots ?? (session.page_snapshot ? [session.page_snapshot] : []),
    extractedJob,
    fieldMap,
    selectedResume: resume
      ? {
          id: resume.id,
          resumeText: resume.resumeText,
          resumeHtml: resume.resumeHtml,
          changes: resume.changes,
          missingEvidence: resume.missingEvidence,
          warnings: resume.warnings,
          quality: resume.quality
        }
      : null
  };
}

function appendStepSnapshot(
  stored: PageSnapshot[] | undefined,
  current: PageSnapshot | null,
  next: PageSnapshot
): PageSnapshot[] {
  const snapshots = stored?.length ? [...stored] : current ? [current] : [];
  const previous = snapshots.at(-1);
  if (previous?.capturedAt === next.capturedAt) {
    snapshots[snapshots.length - 1] = next;
  } else {
    snapshots.push(next);
  }
  return snapshots.slice(-50);
}

function jobDescriptionSnapshot(session: ApplyAssistantSessionRow): PageSnapshot | null {
  return (
    session.step_snapshots?.find(
      (snapshot) =>
        Boolean(snapshot.jobContentHtml) ||
        snapshot.jsonLdJobPostings.some((posting) => typeof posting.description === "string")
    ) ?? session.page_snapshot
  );
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

function supportsPageAnalysis(
  provider: ApplyAssistantExtractionProvider
): provider is ApplyAssistantExtractionProvider & {
  analyzePage(input: ApplyAssistantPageAnalysisProviderInput): Promise<ApplyAssistantPageAnalysis>;
} {
  return typeof provider.analyzePage === "function";
}

function reusableFieldMap(fieldMap: FieldMap | null, snapshot: PageSnapshot): FieldMap | null {
  if (!fieldMap) {
    return null;
  }

  const fieldRefs = new Set(snapshot.fields.map((field) => field.ref));
  const buttonRefs = new Set(snapshot.buttons.map((button) => button.ref));
  const hasFieldOverlap = fieldMap.fields.some((field) => fieldRefs.has(field.elementRef));
  const hasActionOverlap =
    Boolean(fieldMap.actions.nextButtonRef && buttonRefs.has(fieldMap.actions.nextButtonRef)) ||
    Boolean(fieldMap.actions.submitButtonRef && buttonRefs.has(fieldMap.actions.submitButtonRef));

  return hasFieldOverlap || hasActionOverlap ? fieldMap : null;
}

function fieldMapToAiDraft(fieldMap: FieldMap): AiFieldMapDraft {
  return {
    fields: fieldMap.fields.map((field) => ({
      elementRef: field.elementRef,
      valueSource: field.valueSource,
      value: field.value,
      confidence: field.confidence,
      requiresUserReview: field.requiresUserReview
    })),
    actions: {
      ...(fieldMap.actions.nextButtonRef ? { nextButtonRef: fieldMap.actions.nextButtonRef } : {}),
      ...(fieldMap.actions.submitButtonRef
        ? { submitButtonRef: fieldMap.actions.submitButtonRef }
        : {})
    },
    warnings: fieldMap.warnings
  };
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

function requireSessionExtractedJob(session: ApplyAssistantSessionRow): ExtractedJob {
  if (!session.extracted_job) {
    throw apiError(
      400,
      "Create or refresh the apply session before this action.",
      "extracted_job_required"
    );
  }

  return extractedJobSchema.parse(session.extracted_job);
}

function selectedResumeVersion(
  resumeVersions: GeneratedResume[],
  requestedId: string | undefined
): GeneratedResume | null {
  if (!resumeVersions.length) {
    return null;
  }
  if (!requestedId) {
    return resumeVersions.at(-1) ?? null;
  }

  const resume = resumeVersions.find((version) => version.id === requestedId);
  if (!resume) {
    throw apiError(404, "Resume version was not found.", "resume_version_not_found");
  }

  return resume;
}

function deterministicResume(
  profile: TrackingProfileRow,
  extractedJob: ExtractedJob,
  refinementNote: string | undefined,
  existingResume: GeneratedResume | undefined
): GeneratedResume {
  if (existingResume && refinementNote) {
    return generatedResumeSchema.parse({
      resumeHtml: existingResume.resumeHtml,
      resumeText: `${existingResume.resumeText}\n\nRefinement note: ${refinementNote}`,
      changes: [`Recorded refinement note: ${refinementNote}`],
      missingEvidence: existingResume.missingEvidence,
      warnings: [
        ...existingResume.warnings,
        "OpenAI resume provider is not configured; existing resume content was not rewritten."
      ],
      quality: existingResume.quality
    });
  }

  const name =
    [profile.first_name, profile.middle_name, profile.last_name]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" ") || profile.name;
  const contact = [profile.email, profile.phone_number, profile.linkedin_url]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" | ");
  const education = [
    profile.education_degree,
    profile.education_major,
    profile.education_university,
    profile.education_location
  ]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
  const experience = profileCareerText(profile.career_experiences);
  const skills = extractedJob.skills.slice(0, 12);
  const resumeText = [
    name,
    contact,
    "",
    `Target role: ${extractedJob.jobTitle} at ${extractedJob.company}`,
    "",
    "Profile",
    profile.resume_tailoring_note ||
      `Candidate profile prepared for ${extractedJob.jobTitle}. Review and tailor before submission.`,
    "",
    education ? `Education\n${education}` : "",
    experience ? `Experience\n${experience}` : "",
    skills.length ? `Relevant keywords\n${skills.join(", ")}` : "",
    refinementNote ? `User note\n${refinementNote}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const resumeHtml =
    profile.resume_html_template?.trim() ||
    [
      "<section>",
      `<h1>${escapeHtml(name)}</h1>`,
      contact ? `<p>${escapeHtml(contact)}</p>` : "",
      `<h2>Target Role</h2><p>${escapeHtml(extractedJob.jobTitle)} at ${escapeHtml(
        extractedJob.company
      )}</p>`,
      "<h2>Profile</h2>",
      `<p>${escapeHtml(
        profile.resume_tailoring_note ||
          `Prepared for ${extractedJob.jobTitle}. Review before submission.`
      )}</p>`,
      education ? `<h2>Education</h2><p>${escapeHtml(education)}</p>` : "",
      experience ? `<h2>Experience</h2><p>${escapeHtml(experience)}</p>` : "",
      skills.length ? `<h2>Relevant Keywords</h2><p>${escapeHtml(skills.join(", "))}</p>` : "",
      "</section>"
    ].join("");

  return generatedResumeSchema.parse({
    resumeHtml,
    resumeText,
    changes: ["Created a deterministic resume draft from the selected profile."],
    missingEvidence: extractedJob.skills.filter((skill) => !resumeText.includes(skill)),
    warnings: ["OpenAI resume provider is not configured; review this fallback draft carefully."],
    quality: {
      jdCoverage: skills.length ? 0.45 : 0.25,
      fabricationRisk: "low",
      atsReadability: "fair"
    }
  });
}

function sanitizeGeneratedResume(resume: GeneratedResume): GeneratedResume {
  return generatedResumeSchema.parse({
    ...resume,
    resumeHtml: formatResumeDates(sanitizeResumeHtml(resume.resumeHtml)),
    resumeText: formatResumeDates(compactWhitespace(resume.resumeText)),
    changes: uniqueWarnings(resume.changes),
    missingEvidence: uniqueWarnings(resume.missingEvidence),
    warnings: uniqueWarnings(resume.warnings)
  });
}

export function formatResumeDates(value: string): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  return value.replace(
    /\b(\d{4})-(0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?\b/g,
    (_match, year, month) => {
      return `${months[Number(month) - 1]} ${year}`;
    }
  );
}

export function sanitizeResumeHtml(value: string): string {
  const withoutBlockedBlocks = value.replace(
    /<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|link|img)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ""
  );
  return withoutBlockedBlocks
    .replace(
      /<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|link|img)\b[^>]*\/?\s*>/gi,
      ""
    )
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+style\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (_match, _quotedValue, doubleQuoted, singleQuoted, bareValue) => {
        const style = sanitizeInlineStyle(doubleQuoted ?? singleQuoted ?? bareValue ?? "");
        return style ? ` style="${escapeHtmlAttribute(style)}"` : "";
      }
    )
    .replace(/\s+(href|src|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
}

const allowedResumeStyleProperties = new Set([
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "color",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "grid-template-columns",
  "justify-content",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-transform",
  "vertical-align",
  "white-space",
  "width"
]);

function sanitizeInlineStyle(value: string): string {
  return value
    .split(";")
    .flatMap((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex < 1) {
        return [];
      }
      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const propertyValue = declaration.slice(separatorIndex + 1).trim();
      if (
        !allowedResumeStyleProperties.has(property) ||
        !propertyValue ||
        /url\s*\(|expression\s*\(|@import|javascript:|data:/i.test(propertyValue)
      ) {
        return [];
      }
      return [`${property}: ${propertyValue}`];
    })
    .join("; ");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function richTextFromJobDescription(
  extractedJob: ExtractedJob,
  sourceHtml?: string
): RichTextDocument {
  const lines = sourceHtml
    ? structuredJobDescriptionLines(sourceHtml)
    : extractedJob.jobDescriptionText
        .split(/\r?\n/)
        .map((line) => compactWhitespace(line))
        .filter(Boolean)
        .slice(0, 1000)
        .map((line) => ({ line, explicitHeading: false, explicitBullet: false }));
  const content: RichTextNode[] = [];
  let bulletItems: RichTextNode[] = [];

  const flushBullets = () => {
    if (!bulletItems.length) {
      return;
    }
    content.push({ type: "bulletList", content: bulletItems });
    bulletItems = [];
  };

  for (const [index, structuredLine] of lines.entries()) {
    const line = structuredLine.line;
    const bullet = structuredLine.explicitBullet
      ? line
      : line.match(/^(?:[•*-]|\d+[.)])\s+(.+)$/)?.[1];
    if (bullet) {
      bulletItems.push({
        type: "listItem",
        content: [textBlock("paragraph", bullet, undefined, inlineRichText(bullet))]
      });
      continue;
    }

    flushBullets();
    const isTitleOrLocation =
      index < 2 &&
      (normalizeForMatch(line) === normalizeForMatch(extractedJob.jobTitle) ||
        normalizeForMatch(line) === normalizeForMatch(extractedJob.location ?? ""));
    content.push(
      (isTitleOrLocation && !structuredLine.explicitHeading) ||
      (!structuredLine.explicitHeading && !isJobDescriptionHeading(line))
        ? textBlock("paragraph", line, undefined, inlineRichText(line))
        : textBlock("heading", line, { level: 3 }, inlineRichText(line))
    );
  }
  flushBullets();

  return {
    type: "doc",
    content
  };
}

function textBlock(
  type: "paragraph" | "heading",
  text: string,
  attrs?: { level: 2 | 3 },
  content: RichTextNode[] = [{ type: "text", text }]
): RichTextNode {
  return {
    type,
    ...(attrs ? { attrs } : {}),
    content
  };
}

const boldStart = "\ue000";
const boldEnd = "\ue001";
const italicStart = "\ue002";
const italicEnd = "\ue003";
const headingStart = "\ue010";
const bulletStart = "\ue011";

function structuredJobDescriptionLines(html: string): Array<{
  line: string;
  explicitHeading: boolean;
  explicitBullet: boolean;
}> {
  const marked = decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(
        /<\s*(script|style|noscript|iframe|object|embed|form|button)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
        ""
      )
      .replace(/<\s*(?:strong|b)\b[^>]*>/gi, boldStart)
      .replace(/<\s*\/\s*(?:strong|b)\s*>/gi, boldEnd)
      .replace(/<\s*(?:em|i)\b[^>]*>/gi, italicStart)
      .replace(/<\s*\/\s*(?:em|i)\s*>/gi, italicEnd)
      .replace(/<\s*h[1-6]\b[^>]*>/gi, `\n${headingStart}`)
      .replace(/<\s*\/\s*h[1-6]\s*>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, `\n${bulletStart}`)
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/?\s*(?:p|div|section|article|ul|ol|dl|dt|dd|tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );

  return marked
    .split(/\r?\n/)
    .map((rawLine) => {
      const explicitHeading = rawLine.includes(headingStart);
      const explicitBullet = rawLine.includes(bulletStart);
      const line = compactWhitespace(
        rawLine.replaceAll(headingStart, "").replaceAll(bulletStart, "")
      );
      return { line, explicitHeading, explicitBullet };
    })
    .filter((item) => Boolean(plainStyledText(item.line)))
    .slice(0, 1000);
}

function inlineRichText(value: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  let bold = false;
  let italic = false;
  for (const token of value.split(/([\ue000-\ue003])/)) {
    if (token === boldStart) {
      bold = true;
    } else if (token === boldEnd) {
      bold = false;
    } else if (token === italicStart) {
      italic = true;
    } else if (token === italicEnd) {
      italic = false;
    } else if (token) {
      const marks: Array<{ type: "bold" | "italic" }> = [];
      if (bold) marks.push({ type: "bold" });
      if (italic) marks.push({ type: "italic" });
      nodes.push({ type: "text", text: token, ...(marks.length ? { marks } : {}) });
    }
  }
  return nodes;
}

function plainStyledText(value: string): string {
  return value.replace(/[\ue000-\ue003]/g, "").trim();
}

function isJobDescriptionHeading(line: string): boolean {
  const normalized = plainStyledText(line).replace(/:$/, "").trim();
  if (normalized.length > 100 || /[.!?]$/.test(normalized)) {
    return false;
  }
  return /^(?:about(?:\s+the)?\s+(?:company|team|role|job|position|opportunity|us|[\w&.' -]+)|responsibilities|what you(?:'|’)ll do|the role|qualifications|requirements|what we(?:'|’)re looking for|preferred qualifications|nice to have|skills|benefits|compensation|salary|pay range|location|equal opportunity|why join us)$/i.test(
    normalized
  );
}

function preserveSourceJobDescription(
  extractedJob: ExtractedJob,
  snapshot: PageSnapshot
): ExtractedJob {
  const sourceDescription = sourceJobDescription(snapshot, extractedJob);
  if (sourceDescription.length < 50) {
    return extractedJob;
  }

  return extractedJobSchema.parse({
    ...extractedJob,
    jobDescriptionText: sourceDescription.slice(0, 50000)
  });
}

function sourceJobDescription(snapshot: PageSnapshot, extractedJob: ExtractedJob): string {
  const sourceMarkup = sourceJobDescriptionMarkup(snapshot);
  if (sourceMarkup) {
    const description = plainTextFromHtml(sourceMarkup.html);
    if (description.length >= 50) {
      return [
        ...(sourceMarkup.includesHeader
          ? [extractedJob.jobTitle, extractedJob.location]
          : []),
        description
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join("\n\n")
        .slice(0, 50000);
    }
  }

  const visibleText = trimApplicationForm(snapshot.visibleText);
  return visibleText.length >= 50 ? visibleText : extractedJob.jobDescriptionText;
}

function sourceJobDescriptionMarkup(
  snapshot: PageSnapshot
): { html: string; includesHeader: boolean } | null {
  if (snapshot.jobContentHtml?.trim()) {
    return { html: snapshot.jobContentHtml, includesHeader: false };
  }
  const posting = snapshot.jsonLdJobPostings.find(
    (value) => typeof value.description === "string" && value.description.trim().length >= 50
  );
  return posting && typeof posting.description === "string"
    ? { html: posting.description, includesHeader: true }
    : null;
}

function sourceJobDescriptionRichHtml(
  snapshot: PageSnapshot | null,
  extractedJob: ExtractedJob
): string | undefined {
  if (!snapshot) {
    return undefined;
  }
  const source = sourceJobDescriptionMarkup(snapshot);
  if (!source) {
    return undefined;
  }
  if (!source.includesHeader) {
    return source.html;
  }
  const header = [extractedJob.jobTitle, extractedJob.location]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join("");
  return `${header}${source.html}`;
}

function trimApplicationForm(text: string): string {
  const markers = [
    /\bapply for this job\b/i,
    /\bsubmit (?:your )?application\b/i,
    /\bjob application\b/i
  ];
  const boundary = markers
    .map((marker) => text.search(marker))
    .filter((index) => index >= 300)
    .sort((left, right) => left - right)[0];
  return (boundary === undefined ? text : text.slice(0, boundary)).trim().slice(0, 50000);
}

function plainTextFromHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "\n• ")
      .replace(/<\/(?:p|div|section|article|h[1-6]|li|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x")) {
      return safeCodePoint(token.slice(2), 16, entity);
    }
    if (token.startsWith("#")) {
      return safeCodePoint(token.slice(1), 10, entity);
    }
    return namedEntities[token.toLowerCase()] ?? entity;
  });
}

function safeCodePoint(value: string, radix: number, fallback: string): string {
  const codePoint = Number.parseInt(value, radix);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

function profileCareerText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return "";
      }
      return [
        stringValue(item.companyName),
        stringValue(item.jobTitle),
        stringValue(item.companyLocation),
        [stringValue(item.dateFrom), stringValue(item.dateTo)].filter(Boolean).join(" - "),
        stringValue(item.description)
      ]
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean)
    .join("\n");
}

function fieldMapFromAiDraft(
  draft: AiFieldMapDraft,
  snapshot: PageSnapshot,
  profile: TrackingProfileRow | null
): FieldMap {
  const fieldsByRef = new Map(snapshot.fields.map((field) => [field.ref, field]));
  const buttonRefs = new Set(snapshot.buttons.map((button) => button.ref));
  const warnings: string[] = [...draft.warnings];
  const mappedRefs = new Set<string>();
  const fields: MappedField[] = [];
  for (const draftField of draft.fields) {
    const field = fieldsByRef.get(draftField.elementRef);
    if (!field) {
      warnings.push(`AI field map referenced unknown field ${draftField.elementRef}.`);
      continue;
    }
    if (mappedRefs.has(field.ref)) {
      continue;
    }

    const mappedField = mappedFieldFromAiDraftField(field, draftField, profile, warnings);
    fields.push(mappedField);
    mappedRefs.add(mappedField.elementRef);
  }
  for (const field of snapshot.fields) {
    if (!mappedRefs.has(field.ref)) {
      fields.push(reviewField(field));
    }
  }
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

  if (field.kind === "file" && isResumeUploadField(field)) {
    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.resumeFile",
      value: "generated-resume.pdf",
      confidence: Math.max(confidence, 0.98),
      requiresUserReview: true
    };
  }

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
      value: field.kind === "file" ? "generated-cover-letter.pdf" : (draftField.value ?? ""),
      confidence,
      requiresUserReview:
        field.kind === "file" || !draftField.value || draftField.requiresUserReview === true
    };
  }

  if (draftField.valueSource === "generated.answer") {
    const value = cleanText(draftField.value) ?? "";
    if (!value || isUnsafeGeneratedAnswerField(fieldMatchText(field))) {
      warnings.push(`AI generated answer for ${field.ref} requires review.`);
      return {
        ...reviewField(field),
        valueSource: "generated.answer",
        value,
        confidence: Math.min(confidence, 0.55)
      };
    }

    return {
      elementRef: field.ref,
      label: field.label,
      valueSource: "generated.answer",
      value,
      confidence,
      requiresUserReview:
        Boolean(field.disabled || field.readOnly) ||
        confidence < minAutoFillConfidence ||
        hasOptions(field) ||
        draftField.requiresUserReview === true
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

function mergeAiFieldMaps(fieldExtractionMap: FieldMap, autofillMap: FieldMap): FieldMap {
  const autofillFieldsByRef = new Map(autofillMap.fields.map((field) => [field.elementRef, field]));
  const fields = fieldExtractionMap.fields.map((extractedField) => {
    const autofillField = autofillFieldsByRef.get(extractedField.elementRef);
    if (autofillField && shouldUseAutofillField(autofillField)) {
      return autofillField;
    }

    return extractedField;
  });

  const nextButtonRef =
    fieldExtractionMap.actions.nextButtonRef ?? autofillMap.actions.nextButtonRef;
  const submitButtonRef =
    fieldExtractionMap.actions.submitButtonRef ?? autofillMap.actions.submitButtonRef;

  return fieldMapSchema.parse({
    fields,
    actions: {
      ...(nextButtonRef ? { nextButtonRef } : {}),
      ...(submitButtonRef ? { submitButtonRef } : {}),
      submitRequiresConfirmation: true
    },
    warnings: uniqueWarnings([...fieldExtractionMap.warnings, ...autofillMap.warnings])
  });
}

function shouldUseAutofillField(field: MappedField): boolean {
  return field.valueSource !== "user.review";
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

function hasOptions(field: ElementSnapshot): boolean {
  return field.kind === "select" || field.kind === "combobox" || field.kind === "listbox";
}

function selectCompatibleValue(field: ElementSnapshot, value: string): string {
  const normalized = normalizeForMatch(value);
  const match = field.options.find((option) => normalizeForMatch(option) === normalized);
  return match ?? "";
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

function isUnsafeGeneratedAnswerField(text: string): boolean {
  return /\b(visa|sponsor|sponsorship|authorization|authorized|citizen|disability|veteran|race|ethnicity|gender|pronoun|salary|compensation|background|criminal|felony|clearance|legal|eligible|eligibility)\b/.test(
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

function isResumeUploadField(field: ElementSnapshot): boolean {
  const text = fieldMatchText(field);
  return (
    /\b(resume|curriculum vitae|cv)\b/.test(text) &&
    !/\bcover letter\b/.test(text)
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? cleanText(value) : undefined;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
