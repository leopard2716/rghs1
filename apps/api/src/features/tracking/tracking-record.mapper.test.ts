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
    const bid = mapper.bid(
      {
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
      } satisfies BidRecordRow,
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

    expect(bid).toMatchObject({
      jobTitle: "Platform Engineer",
      company: "Acme",
      canEdit: true,
      canDelete: true,
      bidder: { id: "member-1", name: "Noah Hall" },
      profiles: [{ id: "profile-1", resume: null }]
    });
  });
});
