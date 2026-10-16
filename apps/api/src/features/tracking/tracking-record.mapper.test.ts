import { describe, expect, it } from "vitest";
import { TrackingRecordMapper } from "./tracking-record.mapper";
import type {
  BidRecordProfileRow,
  BidRecordRow,
  TrackingJobMarketRow,
  TrackingProfileRow
} from "./tracking.types";

const mapper = new TrackingRecordMapper();

describe("TrackingRecordMapper", () => {
  it("maps plaintext bid columns with tenant-local ownership", () => {
    const profile = mapper.profile({
      id: "profile-1",
      workspace_id: "workspace-1",
      name: "Joshua",
      country: "United States",
      created_by_member_id: "member-1",
      created_at: "2026-06-19T00:00:00.000Z",
      updated_at: "2026-06-19T00:00:00.000Z",
      deleted_at: null
    } satisfies TrackingProfileRow);
    const market = mapper.market({
      id: "market-1",
      workspace_id: "workspace-1",
      market_key: "us",
      name: "US Job Market",
      system: true,
      created_by_member_id: null,
      created_at: "2026-06-19T00:00:00.000Z",
      updated_at: "2026-06-19T00:00:00.000Z",
      deleted_at: null
    } satisfies TrackingJobMarketRow);
    const row = {
      id: "bid-1",
      workspace_id: "workspace-1",
      job_market_id: market.id,
      job_title: "Platform Engineer",
      company: "Acme",
      job_link: "https://example.com/job",
      bid_at: "2026-06-19T12:00:00.000Z",
      job_description: null,
      created_by_member_id: "member-1",
      created_at: "2026-06-19T12:00:00.000Z",
      updated_at: "2026-06-19T12:00:00.000Z",
      deleted_at: null
    } satisfies BidRecordRow;
    const bid = mapper.bid(
      row,
      [
        {
          workspace_id: "workspace-1",
          bid_id: "bid-1",
          profile_id: profile.id,
          resume: null,
          created_at: "2026-06-19T12:00:00.000Z"
        } satisfies BidRecordProfileRow
      ],
      mapper.lookups([profile], [market], [{ id: "member-1", name: "Noah Hall" }]),
      "member-1",
      true
    );

    const lookups = mapper.lookups([profile], [market], [{ id: "member-1", name: "Noah Hall" }]);
    const adminBid = mapper.bid(row, [], lookups, "admin-member", true, [], true);
    expect(adminBid).toMatchObject({
      canEdit: true,
      canDelete: true,
      createdByMemberId: "member-1",
      bidder: { id: "member-1" }
    });
    expect(mapper.bid(row, [], lookups, "another-bidder", true)).toMatchObject({
      canEdit: false,
      canDelete: false
    });
    expect(
      mapper.bid(
        { ...row, deleted_at: "2026-10-15T00:00:00Z" },
        [],
        lookups,
        "admin-member",
        true,
        [],
        true
      )
    ).toMatchObject({ canEdit: false, canDelete: false });
    expect(bid).toMatchObject({
      jobTitle: "Platform Engineer",
      company: "Acme",
      canEdit: true,
      canDelete: true,
      bidder: { id: "member-1", name: "Noah Hall" },
      profiles: [{ id: "profile-1", country: "United States", resume: null }]
    });
  });
});
