import type { RichTextDocument } from "@rghs1/domain";
import { apiError } from "../../errors";
import type {
  BidRecordProfileRow,
  BidRecordRow,
  InterviewRecordRow,
  JobRecordRow,
  PaymentRecordRow,
  TrackingJobMarketRow,
  TrackingProfileRow
} from "./tracking.types";

export type ProfileResponse = {
  id: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
};

export type JobMarketResponse = {
  id: string;
  name: string;
  system: boolean;
  createdAt: string;
  deletedAt: string | null;
  canDelete: boolean;
};

export type MemberSummary = {
  id: string;
  name: string;
};

export type BidProfileResponse = ProfileResponse & {
  resume: string | null;
};

export type BidInterviewReferenceResponse = {
  id: string;
  bidId: string;
  profileId: string;
  profileName: string;
  profileDeleted: boolean;
  step: string;
  startAt: string;
  endAt: string | null;
  timeZone: string | null;
  interviewLink: string;
  interviewer: MemberSummary | null;
  notes: string | null;
  createdAt: string;
};

export type BidResponse = {
  id: string;
  createdByMemberId: string | null;
  jobTitle: string;
  company: string;
  jobLink: string;
  bidAt: string;
  jobDescription: RichTextDocument | string | null;
  jobMarket: JobMarketResponse;
  profiles: BidProfileResponse[];
  referenceInterviews: BidInterviewReferenceResponse[];
  bidder: MemberSummary | null;
  createdAt: string;
  deletedAt: string | null;
  canDelete: boolean;
  canEdit: boolean;
};

export type InterviewResponse = {
  id: string;
  createdByMemberId: string | null;
  bidId: string;
  profileId: string;
  jobTitle: string;
  company: string;
  jobMarket: JobMarketResponse;
  bidder: MemberSummary | null;
  interviewer: MemberSummary | null;
  bidDeleted: boolean;
  profileName: string;
  profileDeleted: boolean;
  step: string;
  startAt: string;
  endAt: string | null;
  timeZone: string | null;
  interviewLink: string;
  notes: string | null;
  createdAt: string;
  canDelete: boolean;
  canEdit: boolean;
};

export type JobRateResponse = {
  bidder: number;
  caller: number;
  worker: number;
  discount: number;
};

export type PaymentAmountResponse = {
  bidder: number;
  caller: number;
  worker: number;
  paymentManager: number;
};

export type JobRecordResponse = {
  id: string;
  createdByMemberId: string | null;
  bidId: string;
  jobTitle: string;
  company: string;
  jobMarket: JobMarketResponse;
  bidDeleted: boolean;
  bidder: MemberSummary | null;
  caller: MemberSummary | null;
  worker: MemberSummary | null;
  rates: JobRateResponse;
  createdAt: string;
  deletedAt: string | null;
  canEdit: boolean;
};

export type PaymentRecordResponse = {
  id: string;
  createdByMemberId: string | null;
  jobRecordId: string;
  jobTitle: string;
  company: string;
  jobMarket: JobMarketResponse;
  bidder: MemberSummary | null;
  caller: MemberSummary | null;
  worker: MemberSummary | null;
  paymentManager: MemberSummary | null;
  amounts: PaymentAmountResponse;
  paymentAmount: number;
  status: "pending" | "paid";
  createdBy: MemberSummary | null;
  paidBy: MemberSummary | null;
  createdAt: string;
  paidAt: string | null;
  canEdit: boolean;
};

export type TrackingLookups = {
  profilesById: Map<string, ProfileResponse>;
  marketsById: Map<string, JobMarketResponse>;
  membersById: Map<string, MemberSummary>;
};

const systemMarketNames: Record<string, string> = {
  us: "US Job Market",
  eu: "EU Job Market",
  philippines: "Philippine Job Market",
  japan: "Japan Job Market"
};

export class TrackingRecordMapper {
  profile(row: TrackingProfileRow): ProfileResponse {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      deletedAt: row.deleted_at
    };
  }

  market(row: TrackingJobMarketRow): JobMarketResponse {
    return {
      id: row.id,
      name: row.name || systemMarketNames[row.market_key ?? ""] || "Job Market",
      system: row.system,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      canDelete: !row.system && !row.deleted_at
    };
  }

  lookups(
    profiles: ProfileResponse[],
    markets: JobMarketResponse[],
    members: MemberSummary[]
  ): TrackingLookups {
    return {
      profilesById: new Map(profiles.map((profile) => [profile.id, profile])),
      marketsById: new Map(markets.map((market) => [market.id, market])),
      membersById: new Map(members.map((member) => [member.id, member]))
    };
  }

  bid(
    row: BidRecordRow,
    assignments: BidRecordProfileRow[],
    lookups: TrackingLookups,
    currentMemberId?: string,
    canManage = false,
    referenceInterviews: BidInterviewReferenceResponse[] = []
  ): BidResponse {
    const market = lookups.marketsById.get(row.job_market_id);
    if (!market) {
      throw apiError(
        500,
        "Bid job-market relationship is incomplete.",
        "bid_market_relationship_invalid"
      );
    }
    const profiles = assignments.map((assignment) => {
      const profile = lookups.profilesById.get(assignment.profile_id);
      if (!profile) {
        throw apiError(
          500,
          "Bid profile relationship is incomplete.",
          "bid_profile_relationship_invalid"
        );
      }
      return {
        ...profile,
        resume: assignment.resume
      };
    });
    const ownedByCurrentMember =
      Boolean(currentMemberId) && row.created_by_member_id === currentMemberId;

    return {
      id: row.id,
      createdByMemberId: row.created_by_member_id,
      jobTitle: row.job_title,
      company: row.company,
      jobLink: row.job_link,
      bidAt: row.bid_at,
      jobDescription: row.job_description,
      jobMarket: market,
      profiles,
      referenceInterviews,
      bidder: row.created_by_member_id
        ? (lookups.membersById.get(row.created_by_member_id) ?? null)
        : null,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      canDelete: canManage && ownedByCurrentMember && !row.deleted_at,
      canEdit:
        canManage &&
        ownedByCurrentMember &&
        !row.deleted_at &&
        !market.deletedAt &&
        profiles.every((profile) => !profile.deletedAt)
    };
  }

  interviews(
    rows: InterviewRecordRow[],
    bids: BidResponse[],
    profiles: ProfileResponse[],
    members: MemberSummary[],
    currentMemberId: string,
    canManage: boolean
  ): InterviewResponse[] {
    const bidsById = new Map(bids.map((bid) => [bid.id, bid]));
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const membersById = new Map(members.map((member) => [member.id, member]));

    return rows.map((row) => {
      const bid = bidsById.get(row.bid_id);
      const profile = profilesById.get(row.profile_id);
      if (!bid || !profile) {
        throw apiError(
          500,
          "Interview relationships are incomplete.",
          "interview_relationship_invalid"
        );
      }
      const ownedByCurrentMember = row.created_by_member_id === currentMemberId;
      return {
        id: row.id,
        createdByMemberId: row.created_by_member_id,
        bidId: row.bid_id,
        profileId: row.profile_id,
        jobTitle: bid.jobTitle,
        company: bid.company,
        jobMarket: bid.jobMarket,
        bidder: bid.bidder,
        interviewer: row.created_by_member_id
          ? (membersById.get(row.created_by_member_id) ?? null)
          : null,
        bidDeleted: Boolean(bid.deletedAt),
        profileName: profile.name,
        profileDeleted: Boolean(profile.deletedAt),
        step: row.step,
        startAt: row.start_at,
        endAt: row.end_at,
        timeZone: row.time_zone,
        interviewLink: row.interview_link,
        notes: row.notes,
        createdAt: row.created_at,
        canDelete: canManage && ownedByCurrentMember,
        canEdit: canManage && ownedByCurrentMember && !bid.deletedAt && !profile.deletedAt
      };
    });
  }

  bidInterviewReferences(
    rows: InterviewRecordRow[],
    profiles: ProfileResponse[],
    members: MemberSummary[]
  ): BidInterviewReferenceResponse[] {
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const membersById = new Map(members.map((member) => [member.id, member]));

    return rows.map((row) => {
      const profile = profilesById.get(row.profile_id);
      if (!profile) {
        throw apiError(
          500,
          "Interview profile relationship is incomplete.",
          "interview_profile_relationship_invalid"
        );
      }

      return {
        id: row.id,
        bidId: row.bid_id,
        profileId: row.profile_id,
        profileName: profile.name,
        profileDeleted: Boolean(profile.deletedAt),
        step: row.step,
        startAt: row.start_at,
        endAt: row.end_at,
        timeZone: row.time_zone,
        interviewLink: row.interview_link,
        interviewer: row.created_by_member_id
          ? (membersById.get(row.created_by_member_id) ?? null)
          : null,
        notes: row.notes,
        createdAt: row.created_at
      };
    });
  }

  jobs(
    rows: JobRecordRow[],
    bids: BidResponse[],
    members: MemberSummary[],
    currentMemberId: string,
    canManage: boolean
  ): JobRecordResponse[] {
    const bidsById = new Map(bids.map((bid) => [bid.id, bid]));
    const membersById = new Map(members.map((member) => [member.id, member]));

    return rows.map((row) => {
      const bid = bidsById.get(row.bid_id);
      if (!bid) {
        throw apiError(500, "Job record bid relationship is incomplete.", "job_bid_invalid");
      }
      const ownedByCurrentMember = row.created_by_member_id === currentMemberId;
      return {
        id: row.id,
        createdByMemberId: row.created_by_member_id,
        bidId: row.bid_id,
        jobTitle: bid.jobTitle,
        company: bid.company,
        jobMarket: bid.jobMarket,
        bidDeleted: Boolean(bid.deletedAt),
        bidder: membersById.get(row.bidder_member_id) ?? null,
        caller: membersById.get(row.caller_member_id) ?? null,
        worker: membersById.get(row.worker_member_id) ?? null,
        rates: {
          bidder: Number(row.bidder_rate),
          caller: Number(row.caller_rate),
          worker: Number(row.worker_rate),
          discount: Number(row.discount_rate)
        },
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
        canEdit: canManage && ownedByCurrentMember && !row.deleted_at && !bid.deletedAt
      };
    });
  }

  payments(
    rows: PaymentRecordRow[],
    jobs: JobRecordResponse[],
    members: MemberSummary[],
    currentMemberId: string,
    canManage: boolean
  ): PaymentRecordResponse[] {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const membersById = new Map(members.map((member) => [member.id, member]));

    return rows.map((row) => {
      const job = jobsById.get(row.job_record_id);
      if (!job) {
        throw apiError(500, "Payment job relationship is incomplete.", "payment_job_invalid");
      }
      const ownedByCurrentMember = row.created_by_member_id === currentMemberId;
      return {
        id: row.id,
        createdByMemberId: row.created_by_member_id,
        jobRecordId: row.job_record_id,
        jobTitle: job.jobTitle,
        company: job.company,
        jobMarket: job.jobMarket,
        bidder: membersById.get(row.bidder_member_id) ?? job.bidder,
        caller: membersById.get(row.caller_member_id) ?? job.caller,
        worker: membersById.get(row.worker_member_id) ?? job.worker,
        paymentManager: membersById.get(row.payment_manager_member_id) ?? null,
        amounts: {
          bidder: Number(row.bidder_amount),
          caller: Number(row.caller_amount),
          worker: Number(row.worker_amount),
          paymentManager: Number(row.payment_manager_amount)
        },
        paymentAmount: Number(row.payment_amount),
        status: row.status,
        createdBy: row.created_by_member_id
          ? (membersById.get(row.created_by_member_id) ?? null)
          : null,
        paidBy: row.paid_by_member_id ? (membersById.get(row.paid_by_member_id) ?? null) : null,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        canEdit: canManage && ownedByCurrentMember && row.status === "pending"
      };
    });
  }
}
