import { describe, expect, it } from "vitest";
import {
  bidListQuery,
  bulkBidRecordInput,
  bidRecordInput,
  bidRecordParams,
  interviewRecordInput,
  interviewRecordParams,
  jobRecordInput,
  paymentAnalysisQuery,
  paymentListQuery,
  paymentPayInput,
  paymentRecordInput,
  trackingDashboardQuery,
  trackingJobMarketInput,
  trackingProfileParams,
  trackingProfileRequestInput,
  trackingProfileRequestReviewInput,
  trackingProfileInput
} from "./tracking.schemas";

const profileId = "36d3bc70-8739-49c3-bf51-fe4ed570cc8b";
const secondProfileId = "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9";
const marketId = "21d18b42-b50c-44f8-baf1-f4a297fbd790";
const memberId = "fb48a37c-6f8c-45ee-8ea5-82efe277f246";
const secondMemberId = "e4ba0761-6845-43d7-970a-98be7a1b44a2";
const thirdMemberId = "fe9ef742-0577-4f6d-84d5-d1c9decd3117";

describe("tracking schemas", () => {
  it("accepts optional multiline resumes for selected profiles", () => {
    const result = bidRecordInput.safeParse({
      jobTitle: "Platform Engineer",
      company: "Example Company",
      jobLink: "https://example.com/jobs/platform",
      bidAt: "2026-06-18T18:30:00.000Z",
      jobMarketId: marketId,
      jobDescription: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Requirements" }]
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "TypeScript" }]
                  }
                ]
              }
            ]
          }
        ]
      },
      profileIds: [profileId, secondProfileId],
      profileResumes: [
        { profileId, resume: "Platform resume\nTypeScript experience" },
        { profileId: secondProfileId, resume: "Backend resume\nAPI experience" }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("accepts a bid without a job description or resumes", () => {
    const result = bidRecordInput.safeParse({
      jobTitle: "Platform Engineer",
      company: "Example Company",
      jobLink: "https://example.com/jobs/platform",
      bidAt: "2026-06-18T18:30:00.000Z",
      jobMarketId: marketId,
      profileIds: [profileId, secondProfileId]
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profileResumes).toEqual([]);
      expect(result.data.jobDescription).toBeUndefined();
    }
  });

  it("accepts a resume for only some selected profiles", () => {
    const result = bidRecordInput.safeParse({
      jobTitle: "Platform Engineer",
      company: "Example Company",
      jobLink: "https://example.com/jobs/platform",
      bidAt: "2026-06-18T18:30:00.000Z",
      jobMarketId: marketId,
      profileIds: [profileId, secondProfileId],
      profileResumes: [{ profileId, resume: "Platform resume" }]
    });

    expect(result.success).toBe(true);
  });

  it("rejects Markdown source as a new job description", () => {
    expect(
      bidRecordInput.safeParse({
        jobTitle: "Platform Engineer",
        company: "Example Company",
        jobLink: "https://example.com/jobs/platform",
        bidAt: "2026-06-18T18:30:00.000Z",
        jobMarketId: marketId,
        jobDescription: "## Requirements\n- TypeScript",
        profileIds: [profileId],
        profileResumes: [{ profileId, resume: "Resume content" }]
      }).success
    ).toBe(false);
  });

  it("deduplicates repeated bid profiles", () => {
    const result = bidRecordInput.parse({
      jobTitle: "Platform Engineer",
      company: "Example Company",
      jobLink: "https://example.com/jobs/platform",
      bidAt: "2026-06-18T18:30:00.000Z",
      jobMarketId: marketId,
      profileIds: [profileId, profileId],
      profileResumes: [{ profileId, resume: "Resume content" }]
    });

    expect(result.profileIds).toEqual([profileId]);
  });

  it("requires at least one profile and HTTP(S) links", () => {
    const result = bidRecordInput.safeParse({
      jobTitle: "Platform Engineer",
      company: "Example Company",
      jobLink: "javascript:alert(1)",
      bidAt: "2026-06-18T18:30:00.000Z",
      jobMarketId: marketId,
      profileIds: [],
      profileResumes: []
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate profile resumes", () => {
    expect(
      bidRecordInput.safeParse({
        jobTitle: "Platform Engineer",
        company: "Example Company",
        jobLink: "https://example.com/jobs/platform",
        bidAt: "2026-06-18T18:30:00.000Z",
        jobMarketId: marketId,
        profileIds: [profileId, secondProfileId],
        profileResumes: [
          { profileId, resume: "First resume" },
          { profileId, resume: "Duplicate resume" }
        ]
      }).success
    ).toBe(false);
  });

  it("rejects a resume for a profile not selected on the bid", () => {
    expect(
      bidRecordInput.safeParse({
        jobTitle: "Platform Engineer",
        company: "Example Company",
        jobLink: "https://example.com/jobs/platform",
        bidAt: "2026-06-18T18:30:00.000Z",
        jobMarketId: marketId,
        profileIds: [profileId],
        profileResumes: [{ profileId: secondProfileId, resume: "Unrelated resume" }]
      }).success
    ).toBe(false);
  });

  it("requires the interview bid and profile relation identifiers", () => {
    expect(
      interviewRecordInput.safeParse({
        bidId: "not-a-uuid",
        profileId,
        step: "Tech Interview 1 (Behavioral)",
        startAt: "2026-06-19T18:30:00.000Z",
        endAt: "2026-06-19T19:30:00.000Z",
        timeZone: "America/Chicago",
        interviewLink: "https://meet.example.com/interview",
        notes: "Prepare system-design examples."
      }).success
    ).toBe(false);
  });

  it("accepts a predefined interview step and zoned time range", () => {
    expect(
      interviewRecordInput.safeParse({
        bidId: "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9",
        profileId,
        step: "HR Interview",
        startAt: "2026-06-19T18:30:00.000Z",
        endAt: "2026-06-19T19:30:00.000Z",
        timeZone: "America/Chicago",
        interviewLink: "https://meet.example.com/interview"
      }).success
    ).toBe(true);
  });

  it("rejects an invalid step, timezone, or reversed range", () => {
    expect(
      interviewRecordInput.safeParse({
        bidId: "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9",
        profileId,
        step: "Custom round",
        startAt: "2026-06-19T19:30:00.000Z",
        endAt: "2026-06-19T18:30:00.000Z",
        timeZone: "Not/A_Zone",
        interviewLink: "https://meet.example.com/interview"
      }).success
    ).toBe(false);
  });

  it("validates job record rate totals and payment amounts", () => {
    expect(
      jobRecordInput.safeParse({
        bidId: "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9",
        bidderMemberId: memberId,
        callerMemberId: secondMemberId,
        workerMemberId: thirdMemberId,
        bidderRate: 20,
        callerRate: 20,
        workerRate: 55,
        discountRate: 5
      }).success
    ).toBe(true);
    expect(
      jobRecordInput.safeParse({
        bidId: "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9",
        bidderMemberId: memberId,
        callerMemberId: secondMemberId,
        workerMemberId: thirdMemberId,
        bidderRate: 20,
        callerRate: 20,
        workerRate: 55,
        discountRate: 4
      }).success
    ).toBe(false);
    expect(
      paymentRecordInput.safeParse({
        jobRecordId: "36d3bc70-8739-49c3-bf51-fe4ed570cc8b",
        paymentAmount: 1250.5
      }).success
    ).toBe(true);
    expect(
      paymentRecordInput.safeParse({
        jobRecordId: "36d3bc70-8739-49c3-bf51-fe4ed570cc8b",
        paymentAmount: 0
      }).success
    ).toBe(false);
  });

  it("validates payment analysis mode and date ranges", () => {
    expect(paymentAnalysisQuery.parse({})).toMatchObject({ status: "pending" });
    expect(
      paymentAnalysisQuery.safeParse({
        status: "paid",
        dateFrom: "2026-06-01T00:00:00.000Z",
        dateTo: "2026-07-01T00:00:00.000Z"
      }).success
    ).toBe(true);
    expect(
      paymentAnalysisQuery.safeParse({
        status: "paid",
        dateFrom: "2026-07-01T00:00:00.000Z",
        dateTo: "2026-06-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("accepts payment list status filters while ignoring removed range filters", () => {
    const parsed = paymentListQuery.parse({
      status: "paid",
      dateFrom: "2026-06-01T00:00:00.000Z",
      dateTo: "2026-07-01T00:00:00.000Z",
      amountMin: "100",
      amountMax: "500"
    });

    expect(parsed).toMatchObject({ status: "paid" });
    expect("dateFrom" in parsed).toBe(false);
    expect("amountMin" in parsed).toBe(false);
  });

  it("requires selected payment ids for marking payments paid", () => {
    expect(paymentPayInput.safeParse({ paymentRecordIds: [memberId] }).success).toBe(true);
    expect(paymentPayInput.safeParse({ paymentRecordIds: [] }).success).toBe(false);
    expect(paymentPayInput.safeParse({ paymentRecordIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("trims and validates profile names", () => {
    expect(trackingProfileInput.parse({ name: "  Alex Smith  " }).name).toBe("Alex Smith");
  });

  it("validates CSV profile requests and admin review decisions", () => {
    expect(trackingProfileRequestInput.parse({ name: "  Joshua  " }).name).toBe("Joshua");
    expect(trackingProfileRequestReviewInput.safeParse({ decision: "approved" }).success).toBe(
      true
    );
    expect(trackingProfileRequestReviewInput.safeParse({ decision: "ignored" }).success).toBe(
      false
    );
  });

  it("accepts mapped bulk bids beyond a single database batch", () => {
    const record = {
      jobTitle: "Platform Engineer",
      company: "Example Company",
      jobLink: "https://example.com/jobs/platform",
      bidAt: "2026-06-18T18:30:00.000Z",
      jobMarketId: marketId,
      profileIds: [profileId],
      profileResumes: [{ profileId, resume: "Resume content" }]
    };

    expect(bulkBidRecordInput.safeParse({ records: [record] }).success).toBe(true);
    expect(
      bulkBidRecordInput.safeParse({
        records: Array.from({ length: 501 }, () => record)
      }).success
    ).toBe(true);
  });

  it("trims custom job-market names", () => {
    expect(trackingJobMarketInput.parse({ name: "  Canada Market  " }).name).toBe("Canada Market");
  });

  it("coerces backend pagination and sorting query values", () => {
    expect(
      bidListQuery.parse({
        page: "2",
        pageSize: "50",
        sortBy: "company",
        sortDirection: "asc"
      })
    ).toMatchObject({
      page: 2,
      pageSize: 50,
      sortBy: "company",
      sortDirection: "asc"
    });
  });

  it("validates dashboard UTC ranges and timezone", () => {
    expect(
      trackingDashboardQuery.safeParse({
        from: "2026-06-01T05:00:00.000Z",
        to: "2026-07-01T05:00:00.000Z",
        todayFrom: "2026-06-18T05:00:00.000Z",
        todayTo: "2026-06-19T05:00:00.000Z",
        timeZone: "America/Chicago"
      }).success
    ).toBe(true);
  });

  it("requires UUID identifiers for tracking deletion routes", () => {
    expect(trackingProfileParams.safeParse({ profileId }).success).toBe(true);
    expect(
      bidRecordParams.safeParse({
        bidId: "6f20f129-5f73-4f1c-99a7-e381cb4b6ac9"
      }).success
    ).toBe(true);
    expect(interviewRecordParams.safeParse({ interviewId: "not-a-uuid" }).success).toBe(false);
  });
});
