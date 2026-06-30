import type { AuthUser } from "../../auth/auth.types";
import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import { NotificationService } from "../notifications/notification.service";
import type { WorkspaceMemberRow, WorkspaceRow } from "../workspace/workspace-access.types";
import type {
  BidListQuery,
  BulkBidRecordInput,
  BidRecordInput,
  InterviewListQuery,
  InterviewRecordInput,
  JobListQuery,
  JobRecordInput,
  PaymentAnalysisQuery,
  PaymentListQuery,
  PaymentPayInput,
  PaymentRecordInput,
  TrackingDashboardQuery,
  TrackingJobMarketInput,
  TrackingProfileRequestInput,
  TrackingProfileRequestReviewInput,
  TrackingProfileInput
} from "./tracking.schemas";
import {
  chunkValues,
  countBy,
  inDateRange,
  matchesJobSearch,
  normalizeSearch,
  paginate,
  paginationFor,
  sortJobMarketsByUsage,
  sortJobRecords,
  trendByDate
} from "./tracking-query";
import { TrackingListQueryBuilder } from "./tracking-list-query.builder";
import { TrackingAccessService, type TrackingContext } from "./tracking-access.service";
import {
  TrackingRecordMapper,
  type BidInterviewReferenceResponse,
  type BidResponse,
  type JobRecordResponse,
  type JobMarketResponse,
  type MemberSummary,
  type PaymentRecordResponse,
  type ProfileResponse
} from "./tracking-record.mapper";
import type {
  BidRecordProfileRow,
  BidRecordRow,
  InterviewRecordRow,
  JobRecordRow,
  PaymentRecordRow,
  TrackingJobMarketRow,
  TrackingProfileRequestRow,
  TrackingProfileRow
} from "./tracking.types";
import {
  bidRecordFields,
  bidRecordProfileFields,
  interviewRecordFields,
  jobRecordFields,
  paymentRecordFields,
  trackingJobMarketFields,
  trackingProfileFields,
  trackingProfileRequestFields
} from "./tracking.types";

export class TrackingService {
  private readonly notifications: NotificationService;
  private readonly listQueries = new TrackingListQueryBuilder();
  private readonly records = new TrackingRecordMapper();
  private readonly access: TrackingAccessService;

  constructor(private readonly supabase: SupabaseRestClient) {
    this.notifications = new NotificationService(supabase);
    this.access = new TrackingAccessService(supabase);
  }

  async listProfiles(slug: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [profiles, markets] = await Promise.all([
      this.loadProfiles(context.workspace.id),
      this.loadMarkets(context.workspace.id, false, context.member.id)
    ]);
    const canManage = context.roleKeys.includes("admin");

    return {
      workspace: workspaceResponse(context.workspace),
      canCreate: canManage,
      canDelete: canManage,
      canManageMarkets: canManage,
      profiles,
      markets
    };
  }

  async createProfile(slug: string, user: AuthUser, input: TrackingProfileInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const profile = await this.createProfileForContext(context, input);
    await this.audit(context, "tracking.profile.created", profile.id, {});
    return { profile };
  }

  private async createProfileForContext(
    context: TrackingContext,
    input: TrackingProfileInput
  ): Promise<ProfileResponse> {
    const id = crypto.randomUUID();
    const [profile] = await this.supabase.insert<TrackingProfileRow>("tracking_profiles", [
      {
        id,
        workspace_id: context.workspace.id,
        name: input.name,
        created_by_member_id: context.member.id
      }
    ]);
    if (!profile) {
      throw apiError(
        502,
        "Profile creation did not return a row.",
        "tracking_profile_create_failed"
      );
    }

    return this.records.profile(profile);
  }

  async deleteProfile(slug: string, profileId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const now = new Date().toISOString();
    const [profile] = await this.supabase.update<TrackingProfileRow>(
      "tracking_profiles",
      { deleted_at: now, updated_at: now },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${profileId}`,
        deleted_at: "is.null"
      }
    );
    if (!profile) {
      throw apiError(404, "Profile was not found.", "tracking_profile_not_found");
    }

    await this.audit(context, "tracking.profile.deleted", profile.id, {});
    return { ok: true, profileId: profile.id };
  }

  async listProfileRequests(slug: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const canReview = context.roleKeys.includes("admin");
    const filters: Record<string, string> = {
      workspace_id: `eq.${context.workspace.id}`
    };
    if (!canReview) {
      filters.requested_by_member_id = `eq.${context.member.id}`;
    }
    const [rows, members] = await Promise.all([
      this.supabase.select<TrackingProfileRequestRow>(
        "tracking_profile_requests",
        trackingProfileRequestFields,
        filters
      ),
      this.loadMembers(context.workspace.id)
    ]);
    const membersById = new Map(members.map((member) => [member.id, member]));
    const requests = rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      requester: membersById.get(row.requested_by_member_id) ?? null,
      requestedByCurrentMember: row.requested_by_member_id === context.member.id,
      resolvedProfileId: row.resolved_profile_id,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at
    }));
    return {
      canReview,
      requests: requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    };
  }

  async createProfileRequest(slug: string, user: AuthUser, input: TrackingProfileRequestInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    const [profiles, pendingRows] = await Promise.all([
      this.loadProfiles(context.workspace.id),
      this.supabase.select<TrackingProfileRequestRow>(
        "tracking_profile_requests",
        trackingProfileRequestFields,
        {
          workspace_id: `eq.${context.workspace.id}`,
          status: "eq.pending"
        }
      )
    ]);
    const normalizedName = normalizeName(input.name);
    const existingProfile = profiles.find(
      (profile) => normalizeName(profile.name) === normalizedName
    );
    if (existingProfile) {
      return {
        request: null,
        existingProfile
      };
    }
    for (const pending of pendingRows) {
      if (normalizeName(pending.name) === normalizedName) {
        throw apiError(
          409,
          "This profile is already waiting for workspace-admin review.",
          "tracking_profile_request_exists"
        );
      }
    }

    const id = crypto.randomUUID();
    const [request] = await this.supabase.insert<TrackingProfileRequestRow>(
      "tracking_profile_requests",
      [
        {
          id,
          workspace_id: context.workspace.id,
          name: input.name,
          requested_by_member_id: context.member.id,
          status: "pending"
        }
      ]
    );
    if (!request) {
      throw apiError(
        502,
        "Profile request creation did not return a row.",
        "tracking_profile_request_failed"
      );
    }
    await this.notifications.notifyWorkspace(
      context.workspace.id,
      user.id,
      {
        priority: "warning",
        eventType: "tracking.profile.requested",
        title: "Profile approval requested",
        message: `${context.member.display_name} requested the ${input.name} profile for CSV bid import.`,
        actionUrl: `/${context.workspace.slug}/dashboard`,
        entityType: "tracking_profile_request",
        entityId: request.id
      },
      { adminsOnly: true }
    );
    await this.audit(context, "tracking.profile.requested", request.id, {});
    return {
      request: {
        id: request.id,
        name: input.name,
        status: request.status,
        requester: {
          id: context.member.id,
          name: context.member.display_name
        },
        requestedByCurrentMember: true,
        resolvedProfileId: null,
        createdAt: request.created_at,
        reviewedAt: null
      },
      existingProfile: null
    };
  }

  async reviewProfileRequest(
    slug: string,
    requestId: string,
    user: AuthUser,
    input: TrackingProfileRequestReviewInput
  ) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const [request] = await this.supabase.select<TrackingProfileRequestRow>(
      "tracking_profile_requests",
      trackingProfileRequestFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${requestId}`,
        status: "eq.pending"
      }
    );
    if (!request) {
      throw apiError(404, "Pending profile request was not found.", "profile_request_not_found");
    }
    let resolvedProfileId: string | null = null;
    if (input.decision === "approved") {
      const profiles = await this.loadProfiles(context.workspace.id);
      const existing = profiles.find(
        (profile) => normalizeName(profile.name) === normalizeName(request.name)
      );
      if (existing) {
        resolvedProfileId = existing.id;
      } else {
        resolvedProfileId = (await this.createProfileForContext(context, { name: request.name }))
          .id;
      }
    }
    const now = new Date().toISOString();
    await this.supabase.update(
      "tracking_profile_requests",
      {
        status: input.decision,
        reviewed_by_member_id: context.member.id,
        resolved_profile_id: resolvedProfileId,
        reviewed_at: now,
        updated_at: now
      },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${request.id}`,
        status: "eq.pending"
      }
    );
    const requester = await this.memberById(context.workspace.id, request.requested_by_member_id);
    if (input.decision === "approved") {
      await this.notifications.notifyWorkspace(context.workspace.id, user.id, {
        priority: "success",
        eventType: "tracking.profile.approved",
        title: "Profile request approved",
        message: `${request.name} is now available for bids and CSV imports.`,
        actionUrl: `/${context.workspace.slug}/profiles`,
        entityType: "tracking_profile_request",
        entityId: request.id
      });
    } else if (requester) {
      await this.notifications.notifyWorkspace(
        context.workspace.id,
        user.id,
        {
          priority: "error",
          eventType: "tracking.profile.denied",
          title: "Profile request denied",
          message: `${request.name} was not approved by the workspace admin.`,
          actionUrl: `/${context.workspace.slug}/bids`,
          entityType: "tracking_profile_request",
          entityId: request.id
        },
        { recipientAuthUserIds: [requester.auth_user_id] }
      );
    }
    await this.audit(context, `tracking.profile_request.${input.decision}`, request.id, {
      resolvedProfileId
    });
    return {
      ok: true,
      requestId: request.id,
      status: input.decision,
      resolvedProfileId
    };
  }

  async createJobMarket(slug: string, user: AuthUser, input: TrackingJobMarketInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const existingMarkets = await this.loadMarkets(context.workspace.id);
    const normalizedName = input.name.toLocaleLowerCase();
    if (existingMarkets.some((market) => market.name.toLocaleLowerCase() === normalizedName)) {
      throw apiError(409, "A job market with this name already exists.", "job_market_exists");
    }

    const id = crypto.randomUUID();
    const [market] = await this.supabase.insert<TrackingJobMarketRow>("tracking_job_markets", [
      {
        id,
        workspace_id: context.workspace.id,
        market_key: null,
        name: input.name,
        system: false,
        created_by_member_id: context.member.id
      }
    ]);
    if (!market) {
      throw apiError(502, "Job market creation did not return a row.", "job_market_create_failed");
    }

    await this.audit(context, "tracking.job_market.created", market.id, {});
    return { market: this.records.market(market) };
  }

  async deleteJobMarket(slug: string, marketId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const now = new Date().toISOString();
    const [market] = await this.supabase.update<TrackingJobMarketRow>(
      "tracking_job_markets",
      { deleted_at: now, updated_at: now },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${marketId}`,
        system: "eq.false",
        deleted_at: "is.null"
      }
    );
    if (!market) {
      throw apiError(
        404,
        "Custom job market was not found. Built-in markets cannot be deleted.",
        "job_market_not_found"
      );
    }

    await this.audit(context, "tracking.job_market.deleted", market.id, {});
    return { ok: true, marketId: market.id };
  }

  async listBids(slug: string, user: AuthUser, query: BidListQuery) {
    const context = await this.access.requireContext(slug, user.id);
    const [allProfiles, allMarkets, members, profileAssignments] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true, context.member.id),
      this.loadMembers(context.workspace.id),
      query.profileId
        ? this.selectAllPages<BidRecordProfileRow>("bid_record_profiles", bidRecordProfileFields, {
            workspace_id: `eq.${context.workspace.id}`,
            profile_id: `eq.${query.profileId}`
          })
        : Promise.resolve([])
    ]);
    const profileBidIds = query.profileId
      ? [...new Set(profileAssignments.map((assignment) => assignment.bid_id))]
      : undefined;
    const emptyProfileFilter = Boolean(query.profileId && !profileBidIds?.length);
    const [pageResult, suggestionRows] = await Promise.all([
      emptyProfileFilter
        ? Promise.resolve({
            records: [] as BidRecordRow[],
            pagination: paginationFor(0, query.page, query.pageSize)
          })
        : profileBidIds
          ? this.profileFilteredBidPage(context.workspace.id, query, profileBidIds)
          : this.bidPage(context.workspace.id, query),
      this.supabase.select<BidRecordRow>(
        "bid_records",
        bidRecordFields,
        {
          workspace_id: `eq.${context.workspace.id}`,
          deleted_at: "is.null"
        },
        { order: "bid_at.desc,id.desc", limit: 100 }
      )
    ]);
    const { pagination, records: pageRows } = pageResult;
    const visibleIds = [...new Set([...pageRows, ...suggestionRows].map((row) => row.id))];
    const [assignments, referenceInterviewRows] = visibleIds.length
      ? await Promise.all([
          Promise.all(
            chunkValues(visibleIds, 100).map((bidIds) =>
              this.selectAllPages<BidRecordProfileRow>(
                "bid_record_profiles",
                bidRecordProfileFields,
                {
                  workspace_id: `eq.${context.workspace.id}`,
                  bid_id: `in.(${bidIds.join(",")})`
                }
              )
            )
          ).then((pages) => pages.flat()),
          this.loadInterviewsForBids(context.workspace.id, visibleIds)
        ])
      : ([[], []] as [BidRecordProfileRow[], InterviewRecordRow[]]);
    const assignmentsByBid = groupAssignmentsByBid(assignments);
    const referenceInterviewsByBid = this.referenceInterviewsByBid(
      referenceInterviewRows,
      allProfiles,
      members
    );
    const canManageBids = context.roleKeys.includes("bidder");
    const lookups = this.records.lookups(allProfiles, allMarkets, members);
    const responseFor = (row: BidRecordRow) =>
      this.records.bid(
        row,
        assignmentsByBid.get(row.id) ?? [],
        lookups,
        context.member.id,
        canManageBids,
        referenceInterviewsByBid.get(row.id) ?? []
      );

    return {
      workspace: workspaceResponse(context.workspace),
      canCreate: context.roleKeys.includes("bidder"),
      canCreateInterview: context.roleKeys.includes("interviewer"),
      profiles: allProfiles.filter((profile) => !profile.deletedAt),
      filterProfiles: allProfiles,
      markets: allMarkets.filter((market) => !market.deletedAt),
      filterMarkets: allMarkets,
      bids: pageRows.map(responseFor),
      pagination,
      suggestionBids: suggestionRows.map(responseFor)
    };
  }

  async createBid(slug: string, user: AuthUser, input: BidRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    const bid = await this.createBidForContext(context, input);
    await this.audit(context, "tracking.bid.created", bid.id, {
      profileCount: input.profileIds.length,
      jobMarketId: input.jobMarketId
    });
    return { bid };
  }

  async getBid(slug: string, bidId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [profiles, markets, members, rows, assignments, referenceInterviewRows] =
      await Promise.all([
        this.loadProfiles(context.workspace.id, true),
        this.loadMarkets(context.workspace.id, true, context.member.id),
        this.loadMembers(context.workspace.id),
        this.supabase.select<BidRecordRow>("bid_records", bidRecordFields, {
          workspace_id: `eq.${context.workspace.id}`,
          id: `eq.${bidId}`
        }),
        this.supabase.select<BidRecordProfileRow>("bid_record_profiles", bidRecordProfileFields, {
          workspace_id: `eq.${context.workspace.id}`,
          bid_id: `eq.${bidId}`
        }),
        this.loadInterviewsForBids(context.workspace.id, [bidId])
      ]);
    const [row] = rows;
    if (!row) {
      throw apiError(404, "Bid was not found.", "bid_record_not_found");
    }
    const referenceInterviewsByBid = this.referenceInterviewsByBid(
      referenceInterviewRows,
      profiles,
      members
    );

    return {
      bid: this.records.bid(
        row,
        assignments,
        this.records.lookups(profiles, markets, members),
        context.member.id,
        context.roleKeys.includes("bidder"),
        referenceInterviewsByBid.get(row.id) ?? []
      )
    };
  }

  async bulkCreateBids(slug: string, user: AuthUser, input: BulkBidRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    const profileIds = [...new Set(input.records.flatMap((record) => record.profileIds))];
    const marketIds = [...new Set(input.records.map((record) => record.jobMarketId))];
    await Promise.all([
      this.access.requireProfiles(context.workspace.id, profileIds),
      ...marketIds.map((marketId) => this.access.requireMarket(context.workspace.id, marketId))
    ]);
    const createdIds: string[] = [];
    const batchSize = 200;
    try {
      for (let offset = 0; offset < input.records.length; offset += batchSize) {
        const records = input.records.slice(offset, offset + batchSize);
        const prepared = records.map((record) => ({
          id: crypto.randomUUID(),
          record
        }));
        createdIds.push(...prepared.map((item) => item.id));
        const inserted = await this.supabase.insert<BidRecordRow>(
          "bid_records",
          prepared.map((item) => ({
            id: item.id,
            workspace_id: context.workspace.id,
            job_market_id: item.record.jobMarketId,
            job_title: item.record.jobTitle,
            company: item.record.company,
            job_link: item.record.jobLink,
            bid_at: item.record.bidAt,
            job_description: item.record.jobDescription ?? null,
            created_by_member_id: context.member.id
          }))
        );
        if (inserted.length !== prepared.length) {
          throw apiError(
            502,
            "Bulk bid creation returned an incomplete result.",
            "bulk_bid_create_incomplete"
          );
        }
        await this.supabase.insert(
          "bid_record_profiles",
          prepared.flatMap((item) =>
            item.record.profileIds.map((profileId) => {
              const resume =
                item.record.profileResumes.find(
                  (profileResume) => profileResume.profileId === profileId
                )?.resume ?? null;
              return {
                workspace_id: context.workspace.id,
                bid_id: item.id,
                profile_id: profileId,
                resume
              };
            })
          )
        );
      }
    } catch (error) {
      for (let offset = 0; offset < createdIds.length; offset += batchSize) {
        const ids = createdIds.slice(offset, offset + batchSize);
        await this.supabase
          .delete("bid_records", {
            workspace_id: `eq.${context.workspace.id}`,
            id: `in.(${ids.join(",")})`
          })
          .catch(() => undefined);
      }
      throw error;
    }
    await this.audit(context, "tracking.bid.bulk_created", createdIds[0] ?? crypto.randomUUID(), {
      count: createdIds.length
    });
    return { imported: createdIds.length };
  }

  async updateBid(slug: string, bidId: string, user: AuthUser, input: BidRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    await Promise.all([
      this.access.requireProfiles(context.workspace.id, input.profileIds),
      this.access.requireMarket(context.workspace.id, input.jobMarketId)
    ]);
    const [existing] = await this.supabase.select<BidRecordRow>("bid_records", bidRecordFields, {
      workspace_id: `eq.${context.workspace.id}`,
      id: `eq.${bidId}`,
      deleted_at: "is.null"
    });
    if (!existing) {
      throw apiError(404, "Bid was not found.", "bid_record_not_found");
    }
    if (existing.created_by_member_id !== context.member.id) {
      throw apiError(
        403,
        "Only the workspace member who created this bid can edit it.",
        "bid_record_owner_required"
      );
    }
    const interviews = await this.supabase.select<InterviewRecordRow>(
      "interview_records",
      interviewRecordFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        bid_id: `eq.${bidId}`,
        deleted_at: "is.null"
      }
    );
    const selectedProfiles = new Set(input.profileIds);
    const removedInterviewProfile = interviews.find(
      (interview) => !selectedProfiles.has(interview.profile_id)
    );
    if (removedInterviewProfile) {
      throw apiError(
        409,
        "A profile used by an existing interview cannot be removed from this bid.",
        "bid_profile_in_use"
      );
    }
    const assignments = await this.supabase.select<BidRecordProfileRow>(
      "bid_record_profiles",
      bidRecordProfileFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        bid_id: `eq.${bidId}`
      }
    );
    const currentProfileIds = new Set(assignments.map((item) => item.profile_id));
    const removeIds = [...currentProfileIds].filter((id) => !selectedProfiles.has(id));
    const addIds = input.profileIds.filter((id) => !currentProfileIds.has(id));
    if (removeIds.length) {
      await this.supabase.delete("bid_record_profiles", {
        workspace_id: `eq.${context.workspace.id}`,
        bid_id: `eq.${bidId}`,
        profile_id: `in.(${removeIds.join(",")})`
      });
    }
    if (addIds.length) {
      await this.supabase.insert(
        "bid_record_profiles",
        addIds.map((profileId) => {
          const resume =
            input.profileResumes.find((item) => item.profileId === profileId)?.resume ?? null;
          return {
            workspace_id: context.workspace.id,
            bid_id: bidId,
            profile_id: profileId,
            resume
          };
        })
      );
    }
    const resumeByProfileId = new Map(
      input.profileResumes.map((item) => [item.profileId, item.resume])
    );
    await Promise.all(
      input.profileIds
        .filter((profileId) => currentProfileIds.has(profileId))
        .map((profileId) =>
          this.supabase.update(
            "bid_record_profiles",
            { resume: resumeByProfileId.get(profileId) ?? null },
            {
              workspace_id: `eq.${context.workspace.id}`,
              bid_id: `eq.${bidId}`,
              profile_id: `eq.${profileId}`
            }
          )
        )
    );
    const now = new Date().toISOString();
    const [updated] = await this.supabase.update<BidRecordRow>(
      "bid_records",
      {
        job_market_id: input.jobMarketId,
        job_title: input.jobTitle,
        company: input.company,
        job_link: input.jobLink,
        bid_at: input.bidAt,
        job_description: input.jobDescription ?? null,
        updated_at: now
      },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${bidId}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      }
    );
    if (!updated) {
      throw apiError(502, "Bid update did not return a row.", "bid_record_update_failed");
    }
    await this.audit(context, "tracking.bid.updated", bidId, {});
    const [profiles, markets, members] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true),
      this.loadMembers(context.workspace.id)
    ]);
    const referenceInterviewsByBid = this.referenceInterviewsByBid(interviews, profiles, members);
    return {
      bid: this.records.bid(
        updated,
        input.profileIds.map((profileId) => ({
          workspace_id: context.workspace.id,
          bid_id: bidId,
          profile_id: profileId,
          resume: resumeByProfileId.get(profileId) ?? null,
          created_at: now
        })),
        this.records.lookups(profiles, markets, members),
        context.member.id,
        true,
        referenceInterviewsByBid.get(bidId) ?? []
      )
    };
  }

  private async createBidForContext(
    context: TrackingContext,
    input: BidRecordInput
  ): Promise<BidResponse> {
    await Promise.all([
      this.access.requireProfiles(context.workspace.id, input.profileIds),
      this.access.requireMarket(context.workspace.id, input.jobMarketId)
    ]);

    const id = crypto.randomUUID();
    const [bid] = await this.supabase.insert<BidRecordRow>("bid_records", [
      {
        id,
        workspace_id: context.workspace.id,
        job_market_id: input.jobMarketId,
        job_title: input.jobTitle,
        company: input.company,
        job_link: input.jobLink,
        bid_at: input.bidAt,
        job_description: input.jobDescription ?? null,
        created_by_member_id: context.member.id
      }
    ]);
    if (!bid) {
      throw apiError(502, "Bid creation did not return a row.", "bid_record_create_failed");
    }

    try {
      await this.supabase.insert(
        "bid_record_profiles",
        input.profileIds.map((profileId) => ({
          workspace_id: context.workspace.id,
          bid_id: bid.id,
          profile_id: profileId,
          resume: input.profileResumes.find((item) => item.profileId === profileId)?.resume ?? null
        }))
      );
    } catch (error) {
      await this.supabase
        .delete("bid_records", {
          workspace_id: `eq.${context.workspace.id}`,
          id: `eq.${bid.id}`
        })
        .catch(() => undefined);
      throw error;
    }

    const [profiles, markets, members] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true),
      this.loadMembers(context.workspace.id)
    ]);
    return this.records.bid(
      bid,
      input.profileIds.map((profileId) => ({
        workspace_id: context.workspace.id,
        bid_id: bid.id,
        profile_id: profileId,
        resume: input.profileResumes.find((item) => item.profileId === profileId)?.resume ?? null,
        created_at: bid.created_at
      })),
      this.records.lookups(profiles, markets, members),
      context.member.id,
      true
    );
  }

  async deleteBid(slug: string, bidId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "bidder");
    await this.access.requireOwnedBid(context, bidId, "delete");
    const now = new Date().toISOString();
    const [bid] = await this.supabase.update<BidRecordRow>(
      "bid_records",
      { deleted_at: now, updated_at: now },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${bidId}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      }
    );
    if (!bid) {
      throw apiError(
        404,
        "Bid was not found or was not created by this workspace member.",
        "bid_record_not_found"
      );
    }

    await this.audit(context, "tracking.bid.deleted", bid.id, {});
    return { ok: true, bidId: bid.id };
  }

  async listInterviews(slug: string, user: AuthUser, query: InterviewListQuery) {
    const context = await this.access.requireContext(slug, user.id);
    const [allProfiles, allMarkets, members, interviewRows] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true, context.member.id),
      this.loadMembers(context.workspace.id),
      this.loadInterviews(context.workspace.id)
    ]);
    const allBids = await this.loadBids(context.workspace.id, allProfiles, allMarkets, members, {
      includeDeleted: true
    });
    const interviews = this.records.interviews(
      interviewRows,
      allBids,
      allProfiles,
      members,
      context.member.id,
      context.roleKeys.includes("interviewer")
    );
    const search = normalizeSearch(query.search);
    const filtered = interviews.filter(
      (interview) =>
        matchesJobSearch(interview, search) &&
        (!query.profileId || interview.profileId === query.profileId) &&
        (!query.jobMarketId || interview.jobMarket.id === query.jobMarketId)
    );
    const sorted = sortJobRecords(
      filtered,
      query.sortBy,
      query.sortDirection,
      (interview) => interview.startAt
    );
    const result = paginate(sorted, query.page, query.pageSize);
    const selectableBids = allBids
      .filter((bid) => !bid.deletedAt)
      .map((bid) => ({
        ...bid,
        profiles: bid.profiles.filter((profile) => !profile.deletedAt)
      }))
      .filter((bid) => bid.profiles.length > 0);

    return {
      workspace: workspaceResponse(context.workspace),
      canCreate: context.roleKeys.includes("interviewer"),
      profiles: allProfiles.filter((profile) => !profile.deletedAt),
      filterProfiles: allProfiles,
      markets: allMarkets.filter((market) => !market.deletedAt),
      filterMarkets: allMarkets,
      bids: selectableBids,
      interviews: result.records,
      pagination: result.pagination
    };
  }

  async createInterview(slug: string, user: AuthUser, input: InterviewRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "interviewer");
    await this.access.requireInterviewRelation(context.workspace.id, input);

    const id = crypto.randomUUID();
    const [interview] = await this.supabase.insert<InterviewRecordRow>("interview_records", [
      {
        id,
        workspace_id: context.workspace.id,
        bid_id: input.bidId,
        profile_id: input.profileId,
        step: input.step,
        start_at: input.startAt,
        end_at: input.endAt,
        time_zone: input.timeZone,
        interview_link: input.interviewLink,
        notes: input.notes ?? null,
        created_by_member_id: context.member.id
      }
    ]);
    if (!interview) {
      throw apiError(
        502,
        "Interview creation did not return a row.",
        "interview_record_create_failed"
      );
    }

    await this.audit(context, "tracking.interview.created", interview.id, {
      bidId: input.bidId,
      profileId: input.profileId
    });
    return { id: interview.id };
  }

  async getInterview(slug: string, interviewId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [profiles, markets, members, rows] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true, context.member.id),
      this.loadMembers(context.workspace.id),
      this.supabase.select<InterviewRecordRow>("interview_records", interviewRecordFields, {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${interviewId}`,
        deleted_at: "is.null"
      })
    ]);
    const [row] = rows;
    if (!row) {
      throw apiError(404, "Interview was not found.", "interview_record_not_found");
    }
    const [bidRows, assignments] = await Promise.all([
      this.supabase.select<BidRecordRow>("bid_records", bidRecordFields, {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${row.bid_id}`
      }),
      this.supabase.select<BidRecordProfileRow>("bid_record_profiles", bidRecordProfileFields, {
        workspace_id: `eq.${context.workspace.id}`,
        bid_id: `eq.${row.bid_id}`
      })
    ]);
    const [bidRow] = bidRows;
    if (!bidRow) {
      throw apiError(500, "Interview bid relationship is incomplete.", "interview_bid_invalid");
    }
    const bids = [
      this.records.bid(
        bidRow,
        assignments,
        this.records.lookups(profiles, markets, members),
        context.member.id,
        context.roleKeys.includes("bidder")
      )
    ];
    const [interview] = this.records.interviews(
      [row],
      bids,
      profiles,
      members,
      context.member.id,
      context.roleKeys.includes("interviewer")
    );
    if (!interview) {
      throw apiError(404, "Interview was not found.", "interview_record_not_found");
    }
    return { interview };
  }

  async updateInterview(
    slug: string,
    interviewId: string,
    user: AuthUser,
    input: InterviewRecordInput
  ) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "interviewer");
    await this.access.requireOwnedInterview(context, interviewId, "edit");
    await this.access.requireInterviewRelation(context.workspace.id, input);
    const [interview] = await this.supabase.update<InterviewRecordRow>(
      "interview_records",
      {
        bid_id: input.bidId,
        profile_id: input.profileId,
        step: input.step,
        start_at: input.startAt,
        end_at: input.endAt,
        time_zone: input.timeZone,
        interview_link: input.interviewLink,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString()
      },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${interviewId}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      }
    );
    if (!interview) {
      throw apiError(
        404,
        "Interview was not found or was not created by this workspace member.",
        "interview_record_not_found"
      );
    }
    await this.audit(context, "tracking.interview.updated", interview.id, {});
    return { id: interview.id };
  }

  async deleteInterview(slug: string, interviewId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "interviewer");
    await this.access.requireOwnedInterview(context, interviewId, "delete");
    const now = new Date().toISOString();
    const [interview] = await this.supabase.update<InterviewRecordRow>(
      "interview_records",
      { deleted_at: now, updated_at: now },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${interviewId}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      }
    );
    if (!interview) {
      throw apiError(
        404,
        "Interview was not found or was not created by this workspace member.",
        "interview_record_not_found"
      );
    }

    await this.audit(context, "tracking.interview.deleted", interview.id, {});
    return { ok: true, interviewId: interview.id };
  }

  async listJobs(slug: string, user: AuthUser, query: JobListQuery) {
    const context = await this.access.requireContext(slug, user.id);
    const [jobRows, activeMembers, referenceData] = await Promise.all([
      this.loadJobs(context.workspace.id),
      this.loadActiveMembers(context.workspace.id),
      this.jobReferenceData(context)
    ]);
    const jobs = this.records.jobs(
      jobRows,
      referenceData.allBids,
      referenceData.members,
      context.member.id,
      context.roleKeys.includes("admin")
    );
    const search = normalizeSearch(query.search);
    const filtered = jobs.filter(
      (job) =>
        matchesJobSearch(job, search) &&
        (!query.jobMarketId || job.jobMarket.id === query.jobMarketId) &&
        (!query.memberId ||
          job.bidder?.id === query.memberId ||
          job.caller?.id === query.memberId ||
          job.worker?.id === query.memberId)
    );
    const sorted = sortJobRecords(
      filtered,
      query.sortBy,
      query.sortDirection,
      (job) => job.createdAt
    );
    const result = paginate(sorted, query.page, query.pageSize);
    const activeBids = referenceData.allBids.filter((bid) => !bid.deletedAt);

    return {
      workspace: workspaceResponse(context.workspace),
      canCreate: context.roleKeys.includes("admin"),
      bids: activeBids,
      members: activeMembers,
      filterMembers: referenceData.members,
      markets: referenceData.markets.filter((market) => !market.deletedAt),
      filterMarkets: referenceData.markets,
      jobs: result.records,
      pagination: result.pagination
    };
  }

  async createJob(slug: string, user: AuthUser, input: JobRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    await Promise.all([
      this.access.requireJobRelation(context.workspace.id, input),
      this.access.requireActiveMembers(context.workspace.id, [
        input.bidderMemberId,
        input.callerMemberId,
        input.workerMemberId
      ])
    ]);
    const id = crypto.randomUUID();
    const [job] = await this.supabase.insert<JobRecordRow>("job_records", [
      {
        id,
        workspace_id: context.workspace.id,
        bid_id: input.bidId,
        bidder_member_id: input.bidderMemberId,
        caller_member_id: input.callerMemberId,
        worker_member_id: input.workerMemberId,
        bidder_rate: input.bidderRate,
        caller_rate: input.callerRate,
        worker_rate: input.workerRate,
        discount_rate: input.discountRate,
        created_by_member_id: context.member.id
      }
    ]);
    if (!job) {
      throw apiError(502, "Job record creation did not return a row.", "job_record_create_failed");
    }
    await this.audit(context, "tracking.job.created", job.id, {
      bidId: input.bidId
    });
    return { job: await this.jobResponse(context, job) };
  }

  async getJob(slug: string, jobRecordId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [job] = await this.supabase.select<JobRecordRow>("job_records", jobRecordFields, {
      workspace_id: `eq.${context.workspace.id}`,
      id: `eq.${jobRecordId}`,
      deleted_at: "is.null"
    });
    if (!job) {
      throw apiError(404, "Job record was not found.", "job_record_not_found");
    }
    return { job: await this.jobResponse(context, job) };
  }

  async updateJob(slug: string, jobRecordId: string, user: AuthUser, input: JobRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    await this.access.requireOwnedJob(context, jobRecordId, "edit");
    await Promise.all([
      this.access.requireJobRelation(context.workspace.id, input),
      this.access.requireActiveMembers(context.workspace.id, [
        input.bidderMemberId,
        input.callerMemberId,
        input.workerMemberId
      ])
    ]);
    const [job] = await this.supabase.update<JobRecordRow>(
      "job_records",
      {
        bid_id: input.bidId,
        bidder_member_id: input.bidderMemberId,
        caller_member_id: input.callerMemberId,
        worker_member_id: input.workerMemberId,
        bidder_rate: input.bidderRate,
        caller_rate: input.callerRate,
        worker_rate: input.workerRate,
        discount_rate: input.discountRate,
        updated_at: new Date().toISOString()
      },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${jobRecordId}`,
        created_by_member_id: `eq.${context.member.id}`,
        deleted_at: "is.null"
      }
    );
    if (!job) {
      throw apiError(
        404,
        "Job record was not found or was not created by this workspace member.",
        "job_record_not_found"
      );
    }
    await this.refreshPendingPaymentAllocationsForJob(context, job);
    await this.audit(context, "tracking.job.updated", job.id, {});
    return { job: await this.jobResponse(context, job) };
  }

  async listPayments(slug: string, user: AuthUser, query: PaymentListQuery) {
    const context = await this.access.requireContext(slug, user.id);
    const canManagePayments = this.canManagePayments(context);
    const [paymentRows, jobRows, referenceData] = await Promise.all([
      this.loadPayments(context.workspace.id),
      this.loadJobs(context.workspace.id, true),
      this.jobReferenceData(context)
    ]);
    const allJobs = this.records.jobs(
      jobRows,
      referenceData.allBids,
      referenceData.members,
      context.member.id,
      context.roleKeys.includes("admin")
    );
    const allPayments = this.records.payments(
      paymentRows,
      allJobs,
      referenceData.members,
      context.member.id,
      this.canEditPayments(context)
    );
    const payments = allPayments.filter((payment) =>
      this.canViewPayment(payment, context, canManagePayments)
    );
    const visibleJobIds = new Set(payments.map((payment) => payment.jobRecordId));
    const visibleJobs = this.visiblePaymentJobs(allJobs, context, canManagePayments, visibleJobIds);
    const filtered = payments.filter(
      (payment) =>
        (!query.jobRecordId || payment.jobRecordId === query.jobRecordId) &&
        (!query.status || payment.status === query.status)
    );
    const sorted = sortPayments(filtered, query);
    const result = paginate(sorted, query.page, query.pageSize);

    return {
      workspace: workspaceResponse(context.workspace),
      canCreate: this.canEditPayments(context),
      canPay: context.roleKeys.includes("admin"),
      jobRecords: visibleJobs.filter((job) => !job.deletedAt && !job.bidDeleted),
      payments: result.records,
      pagination: result.pagination
    };
  }

  async createPayment(slug: string, user: AuthUser, input: PaymentRecordInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "payment_manager");
    const job = await this.access.requireActiveJobRecord(context.workspace.id, input.jobRecordId);
    const id = crypto.randomUUID();
    const allocation = paymentAllocationValues(job, input.paymentAmount, context.member.id);
    const [payment] = await this.supabase.insert<PaymentRecordRow>("payment_records", [
      {
        id,
        workspace_id: context.workspace.id,
        job_record_id: input.jobRecordId,
        payment_amount: input.paymentAmount,
        ...allocation,
        status: "pending",
        created_by_member_id: context.member.id
      }
    ]);
    if (!payment) {
      throw apiError(
        502,
        "Payment record creation did not return a row.",
        "payment_record_create_failed"
      );
    }
    await this.audit(context, "tracking.payment.created", payment.id, {
      jobRecordId: input.jobRecordId
    });
    return { payment: await this.paymentResponse(context, payment) };
  }

  async getPayment(slug: string, paymentRecordId: string, user: AuthUser) {
    const context = await this.access.requireContext(slug, user.id);
    const [payment] = await this.supabase.select<PaymentRecordRow>(
      "payment_records",
      paymentRecordFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${paymentRecordId}`,
        deleted_at: "is.null"
      }
    );
    if (!payment) {
      throw apiError(404, "Payment record was not found.", "payment_record_not_found");
    }
    const response = await this.paymentResponse(context, payment);
    if (!this.canViewPayment(response, context, this.canManagePayments(context))) {
      throw apiError(
        403,
        "This payment record is not related to your account.",
        "payment_forbidden"
      );
    }
    return { payment: response };
  }

  async updatePayment(
    slug: string,
    paymentRecordId: string,
    user: AuthUser,
    input: PaymentRecordInput
  ) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "payment_manager");
    const [, job] = await Promise.all([
      this.access.requireOwnedPendingPayment(context, paymentRecordId),
      this.access.requireActiveJobRecord(context.workspace.id, input.jobRecordId)
    ]);
    const allocation = paymentAllocationValues(job, input.paymentAmount, context.member.id);
    const [payment] = await this.supabase.update<PaymentRecordRow>(
      "payment_records",
      {
        job_record_id: input.jobRecordId,
        payment_amount: input.paymentAmount,
        ...allocation,
        updated_at: new Date().toISOString()
      },
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${paymentRecordId}`,
        created_by_member_id: `eq.${context.member.id}`,
        status: "eq.pending",
        deleted_at: "is.null"
      }
    );
    if (!payment) {
      throw apiError(
        404,
        "Pending payment record was not found or was not created by this workspace member.",
        "payment_record_not_found"
      );
    }
    await this.audit(context, "tracking.payment.updated", payment.id, {});
    return { payment: await this.paymentResponse(context, payment) };
  }

  async paymentAnalysis(slug: string, user: AuthUser, query: PaymentAnalysisQuery) {
    const context = await this.access.requireContext(slug, user.id);
    const canManagePayments = this.canManagePayments(context);
    const [paymentRows, jobRows, referenceData] = await Promise.all([
      this.loadPayments(context.workspace.id, false, query.status),
      this.loadJobs(context.workspace.id, true),
      this.jobReferenceData(context)
    ]);
    const allJobs = this.records.jobs(
      jobRows,
      referenceData.allBids,
      referenceData.members,
      context.member.id,
      context.roleKeys.includes("admin")
    );
    const allAnalyzedPayments = this.records.payments(
      paymentRows,
      allJobs,
      referenceData.members,
      context.member.id,
      this.canEditPayments(context)
    );
    const analyzedPayments = allAnalyzedPayments.filter(
      (payment) =>
        this.canViewPayment(payment, context, canManagePayments) &&
        paymentInAnalysisRange(payment, query)
    );
    const totals = paymentAllocationTotals(analyzedPayments);
    const currentUserTotal = currentMemberPaymentTotal(analyzedPayments, context, totals);

    return {
      workspace: workspaceResponse(context.workspace),
      status: query.status,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      canPay: query.status === "pending" && context.roleKeys.includes("admin"),
      payments: analyzedPayments,
      pendingPayments: query.status === "pending" ? analyzedPayments : [],
      currentUserTotal,
      userTotals: context.roleKeys.includes("admin")
        ? [...totals.values()].sort(
            (left, right) =>
              right.pendingAmount - left.pendingAmount ||
              left.member.name.localeCompare(right.member.name)
          )
        : []
    };
  }

  async payPendingPayments(slug: string, user: AuthUser, input: PaymentPayInput) {
    const context = await this.access.requireContext(slug, user.id);
    this.access.requireRole(context, "admin");
    const paymentRecordIds = [...new Set(input.paymentRecordIds)];
    const paymentRecordIdChunks = chunkValues(paymentRecordIds, 100);
    const pendingRows = (
      await Promise.all(
        paymentRecordIdChunks.map((paymentRecordIdChunk) =>
          this.supabase.select<PaymentRecordRow>("payment_records", paymentRecordFields, {
            workspace_id: `eq.${context.workspace.id}`,
            id: `in.(${paymentRecordIdChunk.join(",")})`,
            status: "eq.pending",
            deleted_at: "is.null"
          })
        )
      )
    ).flat();
    if (new Set(pendingRows.map((payment) => payment.id)).size !== paymentRecordIds.length) {
      throw apiError(
        409,
        "One or more selected payment records are no longer pending.",
        "payment_record_not_pending"
      );
    }

    const now = new Date().toISOString();
    const paid = (
      await Promise.all(
        paymentRecordIdChunks.map((paymentRecordIdChunk) =>
          this.supabase.update<PaymentRecordRow>(
            "payment_records",
            {
              status: "paid",
              paid_by_member_id: context.member.id,
              paid_at: now,
              updated_at: now
            },
            {
              workspace_id: `eq.${context.workspace.id}`,
              id: `in.(${paymentRecordIdChunk.join(",")})`,
              status: "eq.pending",
              deleted_at: "is.null"
            }
          )
        )
      )
    ).flat();
    if (paid.length) {
      await this.notifyPaidPaymentRecipients(context, paid);
      await this.audit(context, "tracking.payment.paid", paid[0]!.id, {
        count: paid.length
      });
    }
    return { paid: paid.length };
  }

  async dashboard(slug: string, user: AuthUser, query: TrackingDashboardQuery) {
    const context = await this.access.requireContext(slug, user.id);
    const [profiles, markets, members, interviewRows] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true, context.member.id),
      this.loadMembers(context.workspace.id),
      this.loadInterviews(context.workspace.id)
    ]);
    const allBids = await this.loadBids(context.workspace.id, profiles, markets, members, {
      includeDeleted: true
    });
    const activeBids = allBids.filter((bid) => !bid.deletedAt);
    const interviews = this.records.interviews(
      interviewRows,
      allBids,
      profiles,
      members,
      context.member.id,
      context.roleKeys.includes("interviewer")
    );
    const matchesFilters = (record: {
      jobMarket: JobMarketResponse;
      bidder: MemberSummary | null;
      profiles?: ProfileResponse[];
      profileId?: string;
    }) =>
      (!query.jobMarketId || record.jobMarket.id === query.jobMarketId) &&
      (!query.bidderId || record.bidder?.id === query.bidderId) &&
      (!query.profileId ||
        record.profileId === query.profileId ||
        record.profiles?.some((profile) => profile.id === query.profileId));
    const filteredBids = activeBids.filter(matchesFilters);
    const filteredInterviews = interviews.filter(matchesFilters);
    const rangedBids = filteredBids.filter((bid) => inDateRange(bid.bidAt, query.from, query.to));
    const rangedInterviews = filteredInterviews.filter((interview) =>
      inDateRange(interview.startAt, query.from, query.to)
    );
    const todayBids = filteredBids.filter((bid) =>
      inDateRange(bid.bidAt, query.todayFrom, query.todayTo)
    ).length;
    const todayInterviews = filteredInterviews.filter((interview) =>
      inDateRange(interview.startAt, query.todayFrom, query.todayTo)
    ).length;
    const totalEvents = rangedBids.length + rangedInterviews.length;
    const memberOptions = uniqueMembers(allBids.flatMap((bid) => (bid.bidder ? [bid.bidder] : [])));

    return {
      workspace: workspaceResponse(context.workspace),
      range: {
        from: query.from,
        to: query.to,
        timeZone: query.timeZone
      },
      filters: {
        markets,
        profiles,
        bidders: memberOptions
      },
      summary: {
        todayBids,
        todayInterviews,
        totalBids: rangedBids.length,
        totalInterviews: rangedInterviews.length,
        bidSharePercent: totalEvents
          ? Math.round((rangedBids.length / totalEvents) * 1000) / 10
          : 0,
        interviewSharePercent: totalEvents
          ? Math.round((rangedInterviews.length / totalEvents) * 1000) / 10
          : 0,
        interviewToBidPercent: rangedBids.length
          ? Math.round((rangedInterviews.length / rangedBids.length) * 1000) / 10
          : 0
      },
      breakdowns: {
        bids: {
          market: countBy(rangedBids, (bid) => ({
            key: bid.jobMarket.id,
            label: bid.jobMarket.name
          })),
          bidder: countBy(rangedBids, (bid) =>
            bid.bidder ? { key: bid.bidder.id, label: bid.bidder.name } : null
          ),
          profile: countBy(
            rangedBids.flatMap((bid) => bid.profiles.map((profile) => ({ bid, profile }))),
            ({ profile }) => ({ key: profile.id, label: profile.name })
          )
        },
        interviews: {
          market: countBy(rangedInterviews, (interview) => ({
            key: interview.jobMarket.id,
            label: interview.jobMarket.name
          })),
          bidder: countBy(rangedInterviews, (interview) =>
            interview.bidder ? { key: interview.bidder.id, label: interview.bidder.name } : null
          ),
          profile: countBy(rangedInterviews, (interview) => ({
            key: interview.profileId,
            label: interview.profileName
          }))
        }
      },
      trends: {
        bids: trendByDate(rangedBids, query.timeZone, (bid) => bid.bidAt),
        interviews: trendByDate(rangedInterviews, query.timeZone, (interview) => interview.startAt)
      },
      recentActivity: [
        ...rangedBids.map((bid) => ({
          id: `bid:${bid.id}`,
          type: "bid" as const,
          title: bid.jobTitle,
          company: bid.company,
          at: bid.bidAt,
          market: bid.jobMarket.name
        })),
        ...rangedInterviews.map((interview) => ({
          id: `interview:${interview.id}`,
          type: "interview" as const,
          title: interview.jobTitle,
          company: interview.company,
          at: interview.startAt,
          market: interview.jobMarket.name
        }))
      ]
        .sort((left, right) => right.at.localeCompare(left.at))
        .slice(0, 8)
    };
  }

  private async loadProfiles(workspaceId: string, includeDeleted = false) {
    const filters: Record<string, string> = { workspace_id: `eq.${workspaceId}` };
    if (!includeDeleted) {
      filters.deleted_at = "is.null";
    }
    const rows = await this.supabase.selectAll<TrackingProfileRow>(
      "tracking_profiles",
      trackingProfileFields,
      filters,
      { order: "id.asc" }
    );
    const profiles = rows.map((row) => this.records.profile(row));
    return profiles.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async loadMarkets(workspaceId: string, includeDeleted = false, currentMemberId?: string) {
    const filters: Record<string, string> = { workspace_id: `eq.${workspaceId}` };
    if (!includeDeleted) {
      filters.deleted_at = "is.null";
    }
    const [rows, memberBids] = await Promise.all([
      this.supabase.select<TrackingJobMarketRow>(
        "tracking_job_markets",
        trackingJobMarketFields,
        filters
      ),
      currentMemberId
        ? this.selectAllPages<Pick<BidRecordRow, "job_market_id">>("bid_records", "job_market_id", {
            workspace_id: `eq.${workspaceId}`,
            created_by_member_id: `eq.${currentMemberId}`,
            deleted_at: "is.null"
          })
        : Promise.resolve([])
    ]);
    const usageByMarketId = new Map<string, number>();
    for (const bid of memberBids) {
      usageByMarketId.set(bid.job_market_id, (usageByMarketId.get(bid.job_market_id) ?? 0) + 1);
    }
    return sortJobMarketsByUsage(rows, usageByMarketId).map((row) => this.records.market(row));
  }

  private async bidPage(workspaceId: string, query: BidListQuery) {
    const filters = this.listQueries.bidFilters(workspaceId, query);
    const requestedOffset = (query.page - 1) * query.pageSize;
    const pageResult = await this.supabase.selectPage<BidRecordRow>(
      "bid_records",
      bidRecordFields,
      filters,
      {
        limit: query.pageSize,
        offset: requestedOffset,
        order: this.listQueries.bidOrder(query)
      }
    );
    const pagination = paginationFor(pageResult.total, query.page, query.pageSize);
    if (pagination.page === query.page || pageResult.total === 0) {
      return { records: pageResult.records, pagination };
    }
    const corrected = await this.supabase.selectPage<BidRecordRow>(
      "bid_records",
      bidRecordFields,
      filters,
      {
        limit: query.pageSize,
        offset: (pagination.page - 1) * query.pageSize,
        order: this.listQueries.bidOrder(query)
      }
    );
    return { records: corrected.records, pagination };
  }

  private async profileFilteredBidPage(
    workspaceId: string,
    query: BidListQuery,
    profileBidIds: string[]
  ) {
    const rows = (
      await Promise.all(
        chunkValues(profileBidIds, 100).map((bidIds) =>
          this.supabase.select<BidRecordRow>(
            "bid_records",
            bidRecordFields,
            this.listQueries.bidFilters(workspaceId, query, bidIds)
          )
        )
      )
    ).flat();
    const sorted = sortBidRows(rows, query);
    return paginate(sorted, query.page, query.pageSize);
  }

  private async selectAllPages<T>(
    table: string,
    select: string,
    filters: Record<string, string>
  ): Promise<T[]> {
    const pageSize = 1000;
    const records: T[] = [];
    let offset = 0;
    let total = 0;

    do {
      const page = await this.supabase.selectPage<T>(table, select, filters, {
        limit: pageSize,
        offset
      });
      records.push(...page.records);
      total = page.total;
      if (!page.records.length) {
        break;
      }
      offset += page.records.length;
    } while (offset < total);

    return records;
  }

  private async loadMembers(workspaceId: string): Promise<MemberSummary[]> {
    const rows = await this.supabase.selectAll<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      { workspace_id: `eq.${workspaceId}` },
      { order: "id.asc" }
    );
    return rows.map((member) => ({
      id: member.id,
      name: member.display_name || member.email
    }));
  }

  private async loadActiveMembers(workspaceId: string): Promise<MemberSummary[]> {
    const rows = await this.supabase.selectAll<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspaceId}`,
        status: "eq.active",
        deleted_at: "is.null"
      },
      { order: "id.asc" }
    );
    return rows
      .map((member) => ({
        id: member.id,
        name: member.display_name || member.email
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private async memberById(workspaceId: string, memberId: string) {
    const [member] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${memberId}`
      }
    );
    return member ?? null;
  }

  private async loadBids(
    workspaceId: string,
    profiles: ProfileResponse[],
    markets: JobMarketResponse[],
    members: MemberSummary[],
    options: {
      includeDeleted?: boolean;
      currentMemberId?: string;
      canDelete?: boolean;
    } = {}
  ): Promise<BidResponse[]> {
    const bidFilters: Record<string, string> = { workspace_id: `eq.${workspaceId}` };
    if (!options.includeDeleted) {
      bidFilters.deleted_at = "is.null";
    }
    const [rows, assignments] = await Promise.all([
      this.supabase.selectAll<BidRecordRow>("bid_records", bidRecordFields, bidFilters, {
        order: "id.asc"
      }),
      this.selectAllPages<BidRecordProfileRow>("bid_record_profiles", bidRecordProfileFields, {
        workspace_id: `eq.${workspaceId}`
      })
    ]);
    const assignmentsByBid = groupAssignmentsByBid(assignments);
    const lookups = this.records.lookups(profiles, markets, members);

    return rows.map((row) =>
      this.records.bid(
        row,
        assignmentsByBid.get(row.id) ?? [],
        lookups,
        options.currentMemberId,
        options.canDelete
      )
    );
  }

  private async loadInterviews(workspaceId: string, includeDeleted = false) {
    const filters: Record<string, string> = {
      workspace_id: `eq.${workspaceId}`
    };
    if (!includeDeleted) {
      filters.deleted_at = "is.null";
    }
    return this.supabase.selectAll<InterviewRecordRow>(
      "interview_records",
      interviewRecordFields,
      filters,
      { order: "id.asc" }
    );
  }

  private async loadJobs(workspaceId: string, includeDeleted = false) {
    const filters: Record<string, string> = {
      workspace_id: `eq.${workspaceId}`
    };
    if (!includeDeleted) {
      filters.deleted_at = "is.null";
    }
    return this.supabase.selectAll<JobRecordRow>("job_records", jobRecordFields, filters, {
      order: "id.asc"
    });
  }

  private async loadPayments(
    workspaceId: string,
    includeDeleted = false,
    status?: PaymentRecordRow["status"]
  ) {
    const filters: Record<string, string> = {
      workspace_id: `eq.${workspaceId}`
    };
    if (!includeDeleted) {
      filters.deleted_at = "is.null";
    }
    if (status) {
      filters.status = `eq.${status}`;
    }
    return this.supabase.selectAll<PaymentRecordRow>(
      "payment_records",
      paymentRecordFields,
      filters,
      { order: "id.asc" }
    );
  }

  private async loadInterviewsForBids(workspaceId: string, bidIds: string[]) {
    if (!bidIds.length) {
      return [];
    }

    return (
      await Promise.all(
        chunkValues([...new Set(bidIds)], 100).map((ids) =>
          this.selectAllPages<InterviewRecordRow>("interview_records", interviewRecordFields, {
            workspace_id: `eq.${workspaceId}`,
            bid_id: `in.(${ids.join(",")})`,
            deleted_at: "is.null"
          })
        )
      )
    ).flat();
  }

  private referenceInterviewsByBid(
    rows: InterviewRecordRow[],
    profiles: ProfileResponse[],
    members: MemberSummary[]
  ): Map<string, BidInterviewReferenceResponse[]> {
    const grouped = new Map<string, BidInterviewReferenceResponse[]>();

    for (const reference of this.records.bidInterviewReferences(rows, profiles, members)) {
      const current = grouped.get(reference.bidId) ?? [];
      current.push(reference);
      grouped.set(reference.bidId, current);
    }

    for (const references of grouped.values()) {
      references.sort(
        (left, right) =>
          right.startAt.localeCompare(left.startAt) || right.id.localeCompare(left.id)
      );
    }

    return grouped;
  }

  private async jobReferenceData(context: TrackingContext) {
    const [profiles, markets, members] = await Promise.all([
      this.loadProfiles(context.workspace.id, true),
      this.loadMarkets(context.workspace.id, true, context.member.id),
      this.loadMembers(context.workspace.id)
    ]);
    const allBids = await this.loadBids(context.workspace.id, profiles, markets, members, {
      includeDeleted: true
    });
    return {
      profiles,
      markets,
      members,
      allBids
    };
  }

  private async jobResponse(
    context: TrackingContext,
    row: JobRecordRow
  ): Promise<JobRecordResponse> {
    const referenceData = await this.jobReferenceData(context);
    const [job] = this.records.jobs(
      [row],
      referenceData.allBids,
      referenceData.members,
      context.member.id,
      context.roleKeys.includes("admin")
    );
    if (!job) {
      throw apiError(404, "Job record was not found.", "job_record_not_found");
    }
    return job;
  }

  private async paymentResponse(
    context: TrackingContext,
    row: PaymentRecordRow
  ): Promise<PaymentRecordResponse> {
    const [jobRows, referenceData] = await Promise.all([
      this.loadJobs(context.workspace.id, true),
      this.jobReferenceData(context)
    ]);
    const jobs = this.records.jobs(
      jobRows,
      referenceData.allBids,
      referenceData.members,
      context.member.id,
      context.roleKeys.includes("admin")
    );
    const [payment] = this.records.payments(
      [row],
      jobs,
      referenceData.members,
      context.member.id,
      this.canEditPayments(context)
    );
    if (!payment) {
      throw apiError(404, "Payment record was not found.", "payment_record_not_found");
    }
    return payment;
  }

  private canManagePayments(context: TrackingContext): boolean {
    return context.roleKeys.includes("admin") || context.roleKeys.includes("payment_manager");
  }

  private canEditPayments(context: TrackingContext): boolean {
    return context.roleKeys.includes("payment_manager");
  }

  private visiblePaymentJobs(
    jobs: JobRecordResponse[],
    context: TrackingContext,
    canManagePayments: boolean,
    relatedJobIds = new Set<string>()
  ): JobRecordResponse[] {
    if (canManagePayments) {
      return jobs;
    }
    return jobs.filter(
      (job) => relatedJobIds.has(job.id) || paymentJobRelatedToMember(job, context.member.id)
    );
  }

  private canViewPayment(
    payment: PaymentRecordResponse,
    context: TrackingContext,
    canManagePayments: boolean
  ): boolean {
    return canManagePayments || paymentRelatedToMember(payment, context.member.id);
  }

  private async refreshPendingPaymentAllocationsForJob(
    context: TrackingContext,
    job: JobRecordRow
  ): Promise<void> {
    const payments = await this.selectAllPages<PaymentRecordRow>(
      "payment_records",
      paymentRecordFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        job_record_id: `eq.${job.id}`,
        status: "eq.pending",
        deleted_at: "is.null"
      }
    );
    if (!payments.length) {
      return;
    }

    const updatedAt = new Date().toISOString();
    await Promise.all(
      payments.map((payment) =>
        this.supabase.update<PaymentRecordRow>(
          "payment_records",
          {
            ...paymentAllocationValues(
              job,
              Number(payment.payment_amount),
              payment.payment_manager_member_id
            ),
            updated_at: updatedAt
          },
          {
            workspace_id: `eq.${context.workspace.id}`,
            id: `eq.${payment.id}`,
            status: "eq.pending",
            deleted_at: "is.null"
          }
        )
      )
    );
  }

  private async audit(
    context: TrackingContext,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>
  ) {
    await this.supabase.insert("audit_logs", [
      {
        workspace_id: context.workspace.id,
        actor_id: context.member.auth_user_id,
        actor_member_id: context.member.id,
        action,
        target_type: "tracking_record",
        target_id: targetId,
        metadata
      }
    ]);
    const notification = trackingNotification(action, context.member.display_name);
    if (notification) {
      await this.notifications.notifyWorkspace(context.workspace.id, context.member.auth_user_id, {
        ...notification,
        eventType: action,
        actionUrl: `/${context.workspace.slug}/${trackingActionPath(action)}`,
        entityType: "tracking_record",
        entityId: targetId,
        metadata
      });
    }
  }

  private async notifyPaidPaymentRecipients(
    context: TrackingContext,
    payments: PaymentRecordRow[]
  ) {
    const totals = paidPaymentMemberTotals(payments);
    if (!totals.size) {
      return;
    }
    const members = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `in.(${[...totals.keys()].join(",")})`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );
    await this.notifications.notifyWorkspaceRecipients(
      context.workspace.id,
      members.map((member) => {
        const amount = totals.get(member.id) ?? 0;
        return {
          recipientAuthUserId: member.auth_user_id,
          priority: "success" as const,
          eventType: "tracking.payment.paid_to_user",
          title: "Payment marked paid",
          message: `${context.member.display_name} marked ${formatCurrency(amount)} as paid to you.`,
          actionUrl: `/${context.workspace.slug}/payments`,
          entityType: "payment_record",
          entityId: payments.length === 1 ? payments[0]!.id : undefined,
          metadata: {
            amount,
            paymentRecordIds: payments.map((payment) => payment.id),
            paidByMemberId: context.member.id
          }
        };
      })
    );
  }
}

function workspaceResponse(workspace: WorkspaceRow) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug
  };
}

function uniqueMembers(members: MemberSummary[]) {
  return [...new Map(members.map((member) => [member.id, member])).values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

const farFutureIso = "9999-12-31T23:59:59.999Z";

function sortPayments(
  rows: PaymentRecordResponse[],
  query: PaymentListQuery
): PaymentRecordResponse[] {
  const direction = query.sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const comparison =
      query.sortBy === "amount"
        ? left.paymentAmount - right.paymentAmount
        : left.createdAt.localeCompare(right.createdAt);
    return comparison * direction || left.id.localeCompare(right.id) * direction;
  });
}

function paymentJobRelatedToMember(job: JobRecordResponse, memberId: string): boolean {
  return job.bidder?.id === memberId || job.caller?.id === memberId || job.worker?.id === memberId;
}

function paymentRelatedToMember(payment: PaymentRecordResponse, memberId: string): boolean {
  return (
    payment.bidder?.id === memberId ||
    payment.caller?.id === memberId ||
    payment.worker?.id === memberId ||
    payment.paymentManager?.id === memberId
  );
}

function paymentInAnalysisRange(
  payment: PaymentRecordResponse,
  query: PaymentAnalysisQuery
): boolean {
  if (query.status === "pending") {
    return true;
  }
  if (!payment.paidAt) {
    return false;
  }
  if (
    query.dateFrom &&
    !inDateRange(payment.paidAt, query.dateFrom, query.dateTo ?? farFutureIso)
  ) {
    return false;
  }
  if (query.dateTo && new Date(payment.paidAt).getTime() >= new Date(query.dateTo).getTime()) {
    return false;
  }
  return true;
}

function paymentAllocationTotals(payments: PaymentRecordResponse[]) {
  const totals = new Map<string, { member: MemberSummary; pendingAmount: number }>();
  for (const payment of payments) {
    addPaymentAllocation(totals, payment.bidder, payment.amounts.bidder);
    addPaymentAllocation(totals, payment.caller, payment.amounts.caller);
    addPaymentAllocation(totals, payment.worker, payment.amounts.worker);
    addPaymentAllocation(totals, payment.paymentManager, payment.amounts.paymentManager);
  }
  return totals;
}

function currentMemberPaymentTotal(
  payments: PaymentRecordResponse[],
  context: TrackingContext,
  totals: Map<string, { member: MemberSummary; pendingAmount: number }>
) {
  if (context.roleKeys.includes("payment_manager") && !context.roleKeys.includes("admin")) {
    return roundCurrency(
      payments.reduce(
        (total, payment) =>
          payment.paymentManager?.id === context.member.id
            ? total + payment.amounts.paymentManager
            : total,
        0
      )
    );
  }

  return totals.get(context.member.id)?.pendingAmount ?? 0;
}

function addPaymentAllocation(
  totals: Map<string, { member: MemberSummary; pendingAmount: number }>,
  member: MemberSummary | null,
  amount: number
) {
  if (!member || amount <= 0) {
    return;
  }
  const current = totals.get(member.id);
  totals.set(member.id, {
    member,
    pendingAmount: roundCurrency((current?.pendingAmount ?? 0) + amount)
  });
}

function paymentAllocationValues(
  job: JobRecordRow,
  paymentAmount: number,
  paymentManagerMemberId: string
) {
  const amounts = allocatePaymentAmounts(paymentAmount, {
    bidder: Number(job.bidder_rate),
    caller: Number(job.caller_rate),
    worker: Number(job.worker_rate),
    paymentManager: Number(job.discount_rate)
  });

  return {
    bidder_member_id: job.bidder_member_id,
    caller_member_id: job.caller_member_id,
    worker_member_id: job.worker_member_id,
    payment_manager_member_id: paymentManagerMemberId,
    bidder_amount: amounts.bidder,
    caller_amount: amounts.caller,
    worker_amount: amounts.worker,
    payment_manager_amount: amounts.paymentManager
  };
}

function allocatePaymentAmounts(
  paymentAmount: number,
  rates: { bidder: number; caller: number; worker: number; paymentManager: number }
) {
  const totalCents = Math.round(paymentAmount * 100);
  const entries = [
    { key: "bidder" as const, rate: rates.bidder },
    { key: "caller" as const, rate: rates.caller },
    { key: "worker" as const, rate: rates.worker },
    { key: "paymentManager" as const, rate: rates.paymentManager }
  ].map((entry, index) => {
    const rawCents = (totalCents * Math.round(entry.rate * 100)) / 10000;
    return {
      ...entry,
      index,
      cents: Math.floor(rawCents),
      remainder: rawCents - Math.floor(rawCents)
    };
  });
  let remainingCents = totalCents - entries.reduce((total, entry) => total + entry.cents, 0);
  for (const entry of [...entries].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index
  )) {
    if (remainingCents <= 0) {
      break;
    }
    entry.cents += 1;
    remainingCents -= 1;
  }

  return {
    bidder: entries[0]!.cents / 100,
    caller: entries[1]!.cents / 100,
    worker: entries[2]!.cents / 100,
    paymentManager: entries[3]!.cents / 100
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function paidPaymentMemberTotals(payments: PaymentRecordRow[]) {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    addPaidPaymentMemberTotal(totals, payment.bidder_member_id, payment.bidder_amount);
    addPaidPaymentMemberTotal(totals, payment.caller_member_id, payment.caller_amount);
    addPaidPaymentMemberTotal(totals, payment.worker_member_id, payment.worker_amount);
    addPaidPaymentMemberTotal(
      totals,
      payment.payment_manager_member_id,
      payment.payment_manager_amount
    );
  }
  return totals;
}

function addPaidPaymentMemberTotal(
  totals: Map<string, number>,
  memberId: string,
  amount: number | string
) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return;
  }
  totals.set(memberId, roundCurrency((totals.get(memberId) ?? 0) + numericAmount));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function groupAssignmentsByBid(
  assignments: BidRecordProfileRow[]
): Map<string, BidRecordProfileRow[]> {
  const assignmentsByBid = new Map<string, BidRecordProfileRow[]>();
  for (const assignment of assignments) {
    const current = assignmentsByBid.get(assignment.bid_id) ?? [];
    current.push(assignment);
    assignmentsByBid.set(assignment.bid_id, current);
  }
  return assignmentsByBid;
}

function sortBidRows(rows: BidRecordRow[], query: BidListQuery): BidRecordRow[] {
  const direction = query.sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue =
      query.sortBy === "company"
        ? left.company
        : query.sortBy === "jobTitle"
          ? left.job_title
          : left.bid_at;
    const rightValue =
      query.sortBy === "company"
        ? right.company
        : query.sortBy === "jobTitle"
          ? right.job_title
          : right.bid_at;
    return (
      leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" }) * direction ||
      left.id.localeCompare(right.id) * direction
    );
  });
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function trackingNotification(action: string, actorName: string) {
  if (action === "tracking.bid.created") {
    return {
      priority: "info" as const,
      title: "Bid added",
      message: `${actorName} added a bid record.`
    };
  }
  if (action === "tracking.bid.bulk_created") {
    return {
      priority: "success" as const,
      title: "Bulk bid import completed",
      message: `${actorName} imported multiple bid records.`
    };
  }
  if (action === "tracking.bid.updated") {
    return {
      priority: "info" as const,
      title: "Bid updated",
      message: `${actorName} updated a bid record.`
    };
  }
  if (action === "tracking.bid.deleted") {
    return {
      priority: "warning" as const,
      title: "Bid deleted",
      message: `${actorName} deleted a bid record.`
    };
  }
  if (action === "tracking.interview.created") {
    return {
      priority: "info" as const,
      title: "Interview added",
      message: `${actorName} scheduled an interview.`
    };
  }
  if (action === "tracking.interview.updated") {
    return {
      priority: "info" as const,
      title: "Interview updated",
      message: `${actorName} updated an interview.`
    };
  }
  if (action === "tracking.interview.deleted") {
    return {
      priority: "warning" as const,
      title: "Interview deleted",
      message: `${actorName} deleted an interview.`
    };
  }
  if (action === "tracking.job.created") {
    return {
      priority: "success" as const,
      title: "Job record added",
      message: `${actorName} added a job record.`
    };
  }
  if (action === "tracking.job.updated") {
    return {
      priority: "info" as const,
      title: "Job record updated",
      message: `${actorName} updated a job record.`
    };
  }
  if (action === "tracking.payment.created") {
    return {
      priority: "info" as const,
      title: "Payment record added",
      message: `${actorName} added a payment record.`
    };
  }
  if (action === "tracking.payment.updated") {
    return {
      priority: "info" as const,
      title: "Payment record updated",
      message: `${actorName} updated a payment record.`
    };
  }
  if (action === "tracking.profile.created" || action === "tracking.job_market.created") {
    return {
      priority: "success" as const,
      title: action.includes("profile") ? "Profile added" : "Job market added",
      message: `${actorName} updated workspace tracking configuration.`
    };
  }
  if (action === "tracking.profile.deleted" || action === "tracking.job_market.deleted") {
    return {
      priority: "warning" as const,
      title: action.includes("profile") ? "Profile deleted" : "Job market deleted",
      message: `${actorName} removed a workspace tracking option.`
    };
  }
  return null;
}

function trackingActionPath(action: string): string {
  if (action.includes("payment")) return "payments";
  if (action.includes(".job.")) return "jobs";
  if (action.includes("interview")) return "interviews";
  if (action.includes("profile") || action.includes("job_market")) return "profiles";
  return "bids";
}
