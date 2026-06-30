import type { InterviewStep, RichTextDocument } from "@rghs1/domain";
import type { AuthSession } from "./auth.service";
import { apiBaseUrl, authenticatedApiFetch, parseJson } from "./http";

export type TrackingProfile = {
  id: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
};

export type TrackingBidProfile = TrackingProfile & {
  resume: string | null;
};

export type TrackingJobMarket = {
  id: string;
  name: string;
  system: boolean;
  createdAt: string;
  deletedAt: string | null;
  canDelete: boolean;
};

export type TrackingMemberSummary = {
  id: string;
  name: string;
};

export type BidInterviewReference = {
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
  interviewer: TrackingMemberSummary | null;
  notes: string | null;
  createdAt: string;
};

export type BidRecord = {
  id: string;
  createdByMemberId: string | null;
  jobTitle: string;
  company: string;
  jobLink: string;
  bidAt: string;
  jobDescription: RichTextDocument | string | null;
  jobMarket: TrackingJobMarket;
  profiles: TrackingBidProfile[];
  referenceInterviews: BidInterviewReference[];
  bidder: TrackingMemberSummary | null;
  createdAt: string;
  deletedAt: string | null;
  canDelete: boolean;
  canEdit: boolean;
};

export type InterviewRecord = {
  id: string;
  createdByMemberId: string | null;
  bidId: string;
  profileId: string;
  jobTitle: string;
  company: string;
  jobMarket: TrackingJobMarket;
  bidder: TrackingMemberSummary | null;
  interviewer: TrackingMemberSummary | null;
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

export type JobRateBreakdown = {
  bidder: number;
  caller: number;
  worker: number;
  discount: number;
};

export type PaymentAmountBreakdown = {
  bidder: number;
  caller: number;
  worker: number;
  paymentManager: number;
};

export type JobRecord = {
  id: string;
  createdByMemberId: string | null;
  bidId: string;
  jobTitle: string;
  company: string;
  jobMarket: TrackingJobMarket;
  bidDeleted: boolean;
  bidder: TrackingMemberSummary | null;
  caller: TrackingMemberSummary | null;
  worker: TrackingMemberSummary | null;
  rates: JobRateBreakdown;
  createdAt: string;
  deletedAt: string | null;
  canEdit: boolean;
};

export type PaymentRecord = {
  id: string;
  createdByMemberId: string | null;
  jobRecordId: string;
  jobTitle: string;
  company: string;
  jobMarket: TrackingJobMarket;
  bidder: TrackingMemberSummary | null;
  caller: TrackingMemberSummary | null;
  worker: TrackingMemberSummary | null;
  paymentManager: TrackingMemberSummary | null;
  amounts: PaymentAmountBreakdown;
  paymentAmount: number;
  status: "pending" | "paid";
  createdBy: TrackingMemberSummary | null;
  paidBy: TrackingMemberSummary | null;
  createdAt: string;
  paidAt: string | null;
  canEdit: boolean;
};

export type TrackingProfileRequest = {
  id: string;
  name: string;
  status: "pending" | "approved" | "denied";
  requester: TrackingMemberSummary | null;
  requestedByCurrentMember: boolean;
  resolvedProfileId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TrackingListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "company" | "jobTitle" | "datetime";
  sortDirection?: "asc" | "desc";
  profileId?: string;
  jobMarketId?: string;
};

export type JobRecordListQuery = TrackingListQuery & {
  memberId?: string;
};

export type PaymentListQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: "datetime" | "amount";
  sortDirection?: "asc" | "desc";
  jobRecordId?: string;
  status?: "pending" | "paid";
};

export type PaymentAnalysisQuery = {
  status?: "pending" | "paid";
  dateFrom?: string;
  dateTo?: string;
};

export type ProfilesResponse = {
  canCreate: boolean;
  canDelete: boolean;
  canManageMarkets: boolean;
  profiles: TrackingProfile[];
  markets: TrackingJobMarket[];
};

export type BidsResponse = {
  canCreate: boolean;
  canCreateInterview: boolean;
  profiles: TrackingProfile[];
  filterProfiles: TrackingProfile[];
  markets: TrackingJobMarket[];
  filterMarkets: TrackingJobMarket[];
  bids: BidRecord[];
  suggestionBids: BidRecord[];
  pagination: Pagination;
};

export type InterviewsResponse = {
  canCreate: boolean;
  profiles: TrackingProfile[];
  filterProfiles: TrackingProfile[];
  markets: TrackingJobMarket[];
  filterMarkets: TrackingJobMarket[];
  bids: BidRecord[];
  interviews: InterviewRecord[];
  pagination: Pagination;
};

export type JobsResponse = {
  canCreate: boolean;
  bids: BidRecord[];
  members: TrackingMemberSummary[];
  filterMembers: TrackingMemberSummary[];
  markets: TrackingJobMarket[];
  filterMarkets: TrackingJobMarket[];
  jobs: JobRecord[];
  pagination: Pagination;
};

export type PaymentsResponse = {
  canCreate: boolean;
  canPay: boolean;
  jobRecords: JobRecord[];
  payments: PaymentRecord[];
  pagination: Pagination;
};

export type PaymentAnalysisResponse = {
  status: "pending" | "paid";
  dateFrom: string | null;
  dateTo: string | null;
  canPay: boolean;
  payments: PaymentRecord[];
  pendingPayments: PaymentRecord[];
  currentUserTotal: number;
  userTotals: Array<{
    member: TrackingMemberSummary;
    pendingAmount: number;
  }>;
};

export type TrackingDashboardQuery = {
  from: string;
  to: string;
  todayFrom: string;
  todayTo: string;
  timeZone: string;
  profileId?: string;
  jobMarketId?: string;
  bidderId?: string;
};

export type DashboardBreakdown = {
  key: string;
  label: string;
  value: number;
};

export type TrackingDashboardResponse = {
  range: {
    from: string;
    to: string;
    timeZone: string;
  };
  filters: {
    markets: TrackingJobMarket[];
    profiles: TrackingProfile[];
    bidders: TrackingMemberSummary[];
  };
  summary: {
    todayBids: number;
    todayInterviews: number;
    totalBids: number;
    totalInterviews: number;
    bidSharePercent: number;
    interviewSharePercent: number;
    interviewToBidPercent: number;
  };
  breakdowns: {
    bids: Record<"market" | "bidder" | "profile", DashboardBreakdown[]>;
    interviews: Record<"market" | "bidder" | "profile", DashboardBreakdown[]>;
  };
  trends: {
    bids: Array<{ date: string; value: number }>;
    interviews: Array<{ date: string; value: number }>;
  };
  recentActivity: Array<{
    id: string;
    type: "bid" | "interview";
    title: string;
    company: string;
    at: string;
    market: string;
  }>;
};

export type ProfileRequestsResponse = {
  canReview: boolean;
  requests: TrackingProfileRequest[];
};

function authHeaders(): HeadersInit {
  return {
    "content-type": "application/json"
  };
}

export async function fetchTrackingProfiles(
  session: AuthSession,
  slug: string
): Promise<ProfilesResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/profiles`,
    { headers: authHeaders() }
  );
  return parseJson<ProfilesResponse>(response);
}

export async function createTrackingProfile(
  session: AuthSession,
  slug: string,
  name: string
): Promise<{ profile: TrackingProfile }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/profiles`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name })
    }
  );
  return parseJson<{ profile: TrackingProfile }>(response);
}

export async function deleteTrackingProfile(
  session: AuthSession,
  slug: string,
  profileId: string
): Promise<{ ok: boolean; profileId: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/profiles/${profileId}`,
    {
      method: "DELETE",
      headers: authHeaders()
    }
  );
  return parseJson<{ ok: boolean; profileId: string }>(response);
}

export async function fetchTrackingProfileRequests(
  session: AuthSession,
  slug: string
): Promise<ProfileRequestsResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/profile-requests`,
    { headers: authHeaders() }
  );
  return parseJson<ProfileRequestsResponse>(response);
}

export async function createTrackingProfileRequest(
  session: AuthSession,
  slug: string,
  name: string
): Promise<{
  request: TrackingProfileRequest | null;
  existingProfile: TrackingProfile | null;
}> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/profile-requests`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name })
    }
  );
  return parseJson<{
    request: TrackingProfileRequest | null;
    existingProfile: TrackingProfile | null;
  }>(response);
}

export async function reviewTrackingProfileRequest(
  session: AuthSession,
  slug: string,
  requestId: string,
  decision: "approved" | "denied"
) {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/profile-requests/${requestId}`,
    {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ decision })
    }
  );
  return parseJson<{
    ok: boolean;
    requestId: string;
    status: "approved" | "denied";
    resolvedProfileId: string | null;
  }>(response);
}

export async function createTrackingJobMarket(
  session: AuthSession,
  slug: string,
  name: string
): Promise<{ market: TrackingJobMarket }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/job-markets`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name })
    }
  );
  return parseJson<{ market: TrackingJobMarket }>(response);
}

export async function deleteTrackingJobMarket(
  session: AuthSession,
  slug: string,
  marketId: string
): Promise<{ ok: boolean; marketId: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/job-markets/${marketId}`,
    {
      method: "DELETE",
      headers: authHeaders()
    }
  );
  return parseJson<{ ok: boolean; marketId: string }>(response);
}

export async function fetchBids(
  session: AuthSession,
  slug: string,
  query: TrackingListQuery = {}
): Promise<BidsResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/bids${queryString(query)}`,
    { headers: authHeaders() }
  );
  return parseJson<BidsResponse>(response);
}

export async function fetchBid(
  session: AuthSession,
  slug: string,
  bidId: string
): Promise<{ bid: BidRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/bids/${encodeURIComponent(bidId)}`,
    { headers: authHeaders() }
  );
  return parseJson<{ bid: BidRecord }>(response);
}

export async function createBid(
  session: AuthSession,
  slug: string,
  input: {
    jobTitle: string;
    company: string;
    jobLink: string;
    bidAt: string;
    jobMarketId: string;
    jobDescription?: RichTextDocument;
    profileIds: string[];
    profileResumes?: Array<{
      profileId: string;
      resume: string;
    }>;
  }
): Promise<{ bid: BidRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/bids`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ bid: BidRecord }>(response);
}

export async function bulkCreateBids(
  session: AuthSession,
  slug: string,
  records: Parameters<typeof createBid>[2][]
) {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/bids/bulk`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ records })
    }
  );
  return parseJson<{ imported: number }>(response);
}

export async function updateBid(
  session: AuthSession,
  slug: string,
  bidId: string,
  input: Parameters<typeof createBid>[2]
): Promise<{ bid: BidRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/bids/${bidId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ bid: BidRecord }>(response);
}

export async function deleteBid(
  session: AuthSession,
  slug: string,
  bidId: string
): Promise<{ ok: boolean; bidId: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/bids/${bidId}`,
    {
      method: "DELETE",
      headers: authHeaders()
    }
  );
  return parseJson<{ ok: boolean; bidId: string }>(response);
}

export async function fetchInterviews(
  session: AuthSession,
  slug: string,
  query: TrackingListQuery = {}
): Promise<InterviewsResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/interviews${queryString(query)}`,
    { headers: authHeaders() }
  );
  return parseJson<InterviewsResponse>(response);
}

export async function fetchInterview(
  session: AuthSession,
  slug: string,
  interviewId: string
): Promise<{ interview: InterviewRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/interviews/${encodeURIComponent(interviewId)}`,
    { headers: authHeaders() }
  );
  return parseJson<{ interview: InterviewRecord }>(response);
}

export async function createInterviewRecord(
  session: AuthSession,
  slug: string,
  input: {
    bidId: string;
    profileId: string;
    step: InterviewStep;
    startAt: string;
    endAt: string;
    timeZone: string;
    interviewLink: string;
    notes?: string;
  }
): Promise<{ id: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/interviews`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ id: string }>(response);
}

export async function updateInterviewRecord(
  session: AuthSession,
  slug: string,
  interviewId: string,
  input: Parameters<typeof createInterviewRecord>[2]
): Promise<{ id: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/interviews/${interviewId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ id: string }>(response);
}

export async function deleteInterviewRecord(
  session: AuthSession,
  slug: string,
  interviewId: string
): Promise<{ ok: boolean; interviewId: string }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/interviews/${interviewId}`,
    {
      method: "DELETE",
      headers: authHeaders()
    }
  );
  return parseJson<{ ok: boolean; interviewId: string }>(response);
}

export async function fetchJobs(
  session: AuthSession,
  slug: string,
  query: JobRecordListQuery = {}
): Promise<JobsResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/jobs${queryString(query)}`,
    { headers: authHeaders() }
  );
  return parseJson<JobsResponse>(response);
}

export async function fetchJob(
  session: AuthSession,
  slug: string,
  jobRecordId: string
): Promise<{ job: JobRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/jobs/${encodeURIComponent(jobRecordId)}`,
    { headers: authHeaders() }
  );
  return parseJson<{ job: JobRecord }>(response);
}

export async function createJobRecord(
  session: AuthSession,
  slug: string,
  input: {
    bidId: string;
    bidderMemberId: string;
    callerMemberId: string;
    workerMemberId: string;
    bidderRate: number;
    callerRate: number;
    workerRate: number;
    discountRate: number;
  }
): Promise<{ job: JobRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/jobs`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ job: JobRecord }>(response);
}

export async function updateJobRecord(
  session: AuthSession,
  slug: string,
  jobRecordId: string,
  input: Parameters<typeof createJobRecord>[2]
): Promise<{ job: JobRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/jobs/${jobRecordId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ job: JobRecord }>(response);
}

export async function fetchPayments(
  session: AuthSession,
  slug: string,
  query: PaymentListQuery = {}
): Promise<PaymentsResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/payments${queryString(query)}`,
    { headers: authHeaders() }
  );
  return parseJson<PaymentsResponse>(response);
}

export async function fetchPayment(
  session: AuthSession,
  slug: string,
  paymentRecordId: string
): Promise<{ payment: PaymentRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/payments/${encodeURIComponent(paymentRecordId)}`,
    { headers: authHeaders() }
  );
  return parseJson<{ payment: PaymentRecord }>(response);
}

export async function createPaymentRecord(
  session: AuthSession,
  slug: string,
  input: {
    jobRecordId: string;
    paymentAmount: number;
  }
): Promise<{ payment: PaymentRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/payments`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ payment: PaymentRecord }>(response);
}

export async function updatePaymentRecord(
  session: AuthSession,
  slug: string,
  paymentRecordId: string,
  input: Parameters<typeof createPaymentRecord>[2]
): Promise<{ payment: PaymentRecord }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/payments/${paymentRecordId}`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(input)
    }
  );
  return parseJson<{ payment: PaymentRecord }>(response);
}

export async function fetchPaymentAnalysis(
  session: AuthSession,
  slug: string,
  query: PaymentAnalysisQuery = {}
): Promise<PaymentAnalysisResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/payments/analysis${queryString(query)}`,
    { headers: authHeaders() }
  );
  return parseJson<PaymentAnalysisResponse>(response);
}

export async function payPendingPayments(
  session: AuthSession,
  slug: string,
  paymentRecordIds: string[]
): Promise<{ paid: number }> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/payments/pay-pending`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ paymentRecordIds })
    }
  );
  return parseJson<{ paid: number }>(response);
}

export async function fetchTrackingDashboard(
  session: AuthSession,
  slug: string,
  query: TrackingDashboardQuery
): Promise<TrackingDashboardResponse> {
  const response = await authenticatedApiFetch(
    session,
    `${apiBaseUrl}/v1/workspaces/${slug}/tracking/dashboard${queryString(query)}`,
    { headers: authHeaders() }
  );
  return parseJson<TrackingDashboardResponse>(response);
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}
