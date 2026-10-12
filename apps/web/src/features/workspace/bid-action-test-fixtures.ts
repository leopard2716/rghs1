import type { BidRecord, BidsResponse } from "../../services/tracking.service";
export const pendingBid: BidRecord = {
  id: "bid-1",
  createdByMemberId: "member-1",
  jobTitle: "Engineer",
  company: "Acme",
  jobLink: "https://example.com/job",
  bidAt: "2026-10-12T12:00:00Z",
  appliedAt: null,
  importedAt: null,
  jobDescription: null,
  profiles: [],
  referenceInterviews: [],
  bidder: { id: "member-1", name: "Bidder" },
  jobMarket: {
    id: "market",
    name: "US",
    system: false,
    createdAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    canDelete: false
  },
  createdAt: "2026-10-12T12:00:00Z",
  deletedAt: null,
  canEdit: true,
  canDelete: true
};
export const bidData: BidsResponse = {
  canCreate: true,
  canCreateInterview: false,
  profiles: [],
  filterProfiles: [],
  markets: [],
  filterMarkets: [],
  bids: [pendingBid, { ...pendingBid, id: "bid-2", company: "Other" }],
  suggestionBids: [pendingBid],
  pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 }
};
