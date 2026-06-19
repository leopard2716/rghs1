import { apiError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import type {
  WorkspaceMemberRoleRow,
  WorkspaceMemberRow,
  WorkspaceRoleRow,
  WorkspaceRow
} from "../workspace/workspace-access.types";
import type { InterviewRecordInput } from "./tracking.schemas";
import type { BidRecordProfileRow, BidRecordRow, InterviewRecordRow } from "./tracking.types";
import { bidRecordFields, bidRecordProfileFields, interviewRecordFields } from "./tracking.types";

export type TrackingContext = {
  workspace: WorkspaceRow;
  member: WorkspaceMemberRow;
  roleKeys: string[];
};

export class TrackingAccessService {
  constructor(private readonly supabase: SupabaseRestClient) {}

  async requireContext(slug: string, authUserId: string): Promise<TrackingContext> {
    const [workspace] = await this.supabase.select<WorkspaceRow>(
      "workspaces",
      "id,name,slug,status,created_at",
      {
        slug: `eq.${slug}`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );
    if (!workspace) {
      throw apiError(404, "Workspace was not found.", "workspace_not_found");
    }

    const [member] = await this.supabase.select<WorkspaceMemberRow>(
      "workspace_members",
      "id,workspace_id,auth_user_id,display_name,email,status,created_at,updated_at,deleted_at",
      {
        workspace_id: `eq.${workspace.id}`,
        auth_user_id: `eq.${authUserId}`,
        status: "eq.active",
        deleted_at: "is.null"
      }
    );
    if (!member) {
      throw apiError(403, "Active workspace membership is required.", "workspace_access_required");
    }

    const [roles, memberRoles] = await Promise.all([
      this.supabase.select<WorkspaceRoleRow>(
        "workspace_roles",
        "id,workspace_id,name,key,system,deleted_at",
        {
          workspace_id: `eq.${workspace.id}`,
          deleted_at: "is.null"
        }
      ),
      this.supabase.select<WorkspaceMemberRoleRow>(
        "workspace_member_roles",
        "workspace_id,member_id,role_id",
        {
          workspace_id: `eq.${workspace.id}`,
          member_id: `eq.${member.id}`
        }
      )
    ]);
    const memberRoleIds = new Set(memberRoles.map((role) => role.role_id));
    return {
      workspace,
      member,
      roleKeys: roles.filter((role) => memberRoleIds.has(role.id)).map((role) => role.key)
    };
  }

  requireRole(context: TrackingContext, roleKey: "admin" | "bidder" | "interviewer"): void {
    if (!context.roleKeys.includes(roleKey)) {
      throw apiError(
        403,
        `The ${roleKey} workspace role is required.`,
        `workspace_${roleKey}_required`
      );
    }
  }

  async requireProfiles(workspaceId: string, profileIds: string[]): Promise<void> {
    const profiles = await this.supabase.select<{ id: string }>("tracking_profiles", "id", {
      workspace_id: `eq.${workspaceId}`,
      id: `in.(${profileIds.join(",")})`,
      deleted_at: "is.null"
    });
    if (profiles.length !== profileIds.length) {
      throw apiError(
        400,
        "One or more profiles do not belong to this workspace.",
        "bid_profiles_invalid"
      );
    }
  }

  async requireMarket(workspaceId: string, marketId: string): Promise<void> {
    const markets = await this.supabase.select<{ id: string }>("tracking_job_markets", "id", {
      workspace_id: `eq.${workspaceId}`,
      id: `eq.${marketId}`,
      deleted_at: "is.null"
    });
    if (!markets.length) {
      throw apiError(400, "Select an active job market from this workspace.", "job_market_invalid");
    }
  }

  async requireOwnedBid(
    context: TrackingContext,
    bidId: string,
    action: "edit" | "delete"
  ): Promise<BidRecordRow> {
    const [bid] = await this.supabase.select<BidRecordRow>("bid_records", bidRecordFields, {
      workspace_id: `eq.${context.workspace.id}`,
      id: `eq.${bidId}`,
      deleted_at: "is.null"
    });
    if (!bid) {
      throw apiError(404, "Bid was not found.", "bid_record_not_found");
    }
    if (bid.created_by_member_id !== context.member.id) {
      throw apiError(
        403,
        `Only the workspace member who created this bid can ${action} it.`,
        "bid_record_owner_required"
      );
    }
    return bid;
  }

  async requireOwnedInterview(
    context: TrackingContext,
    interviewId: string,
    action: "edit" | "delete"
  ): Promise<InterviewRecordRow> {
    const [interview] = await this.supabase.select<InterviewRecordRow>(
      "interview_records",
      interviewRecordFields,
      {
        workspace_id: `eq.${context.workspace.id}`,
        id: `eq.${interviewId}`,
        deleted_at: "is.null"
      }
    );
    if (!interview) {
      throw apiError(404, "Interview was not found.", "interview_record_not_found");
    }
    if (interview.created_by_member_id !== context.member.id) {
      throw apiError(
        403,
        `Only the workspace member who created this interview can ${action} it.`,
        "interview_record_owner_required"
      );
    }
    return interview;
  }

  async requireInterviewRelation(workspaceId: string, input: InterviewRecordInput): Promise<void> {
    const [assignments, bids, profiles] = await Promise.all([
      this.supabase.select<BidRecordProfileRow>("bid_record_profiles", bidRecordProfileFields, {
        workspace_id: `eq.${workspaceId}`,
        bid_id: `eq.${input.bidId}`,
        profile_id: `eq.${input.profileId}`
      }),
      this.supabase.select<{ id: string }>("bid_records", "id", {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${input.bidId}`,
        deleted_at: "is.null"
      }),
      this.supabase.select<{ id: string }>("tracking_profiles", "id", {
        workspace_id: `eq.${workspaceId}`,
        id: `eq.${input.profileId}`,
        deleted_at: "is.null"
      })
    ]);
    if (assignments.length === 0 || bids.length === 0 || profiles.length === 0) {
      throw apiError(
        400,
        "Interview requires an active bid and one of its active profiles.",
        "interview_profile_not_on_bid"
      );
    }
  }
}
