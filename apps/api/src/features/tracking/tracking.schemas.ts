import { INTERVIEW_STEPS, isRichTextEmpty, richTextDocumentSchema } from "@rghs1/domain";
import { z } from "zod";

const webUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only HTTP or HTTPS links are allowed.");

export const trackingProfileInput = z.object({
  name: z.string().trim().min(2).max(120)
});

export const trackingProfileParams = z.object({
  profileId: z.string().uuid()
});

export const trackingProfileRequestInput = z.object({
  name: z.string().trim().min(2).max(120)
});

export const trackingProfileRequestParams = z.object({
  requestId: z.string().uuid()
});

export const trackingProfileRequestReviewInput = z.object({
  decision: z.enum(["approved", "denied"])
});

export const trackingJobMarketInput = z.object({
  name: z.string().trim().min(2).max(120)
});

export const trackingJobMarketParams = z.object({
  marketId: z.string().uuid()
});

export const bidRecordParams = z.object({
  bidId: z.string().uuid()
});

export const interviewRecordParams = z.object({
  interviewId: z.string().uuid()
});

export const jobRecordParams = z.object({
  jobRecordId: z.string().uuid()
});

export const paymentRecordParams = z.object({
  paymentRecordId: z.string().uuid()
});

export const bidRecordInput = z
  .object({
    jobTitle: z.string().trim().min(2).max(180),
    company: z.string().trim().min(2).max(180),
    jobLink: webUrl,
    bidAt: z.string().datetime(),
    jobMarketId: z.string().uuid(),
    jobDescription: richTextDocumentSchema
      .refine((document) => !isRichTextEmpty(document), {
        message: "Job description cannot be empty."
      })
      .optional(),
    profileIds: z
      .array(z.string().uuid())
      .min(1)
      .max(25)
      .transform((profileIds) => [...new Set(profileIds)]),
    profileResumes: z
      .array(
        z.object({
          profileId: z.string().uuid(),
          resume: z.string().trim().min(1).max(50000)
        })
      )
      .max(25)
      .default([])
  })
  .superRefine((input, context) => {
    const resumeProfileIds = input.profileResumes.map((item) => item.profileId);
    if (new Set(resumeProfileIds).size !== resumeProfileIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profileResumes"],
        message: "Each selected profile can have only one resume."
      });
    }

    const selected = new Set(input.profileIds);
    if (resumeProfileIds.some((profileId) => !selected.has(profileId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profileResumes"],
        message: "A resume can only be attached to a selected bid profile."
      });
    }
  });

export const interviewRecordInput = z
  .object({
    bidId: z.string().uuid(),
    profileId: z.string().uuid(),
    step: z.enum(INTERVIEW_STEPS),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timeZone: z.string().trim().min(1).max(100).refine(isTimeZone, {
      message: "Enter a valid IANA timezone."
    }),
    interviewLink: webUrl,
    notes: z.string().trim().max(20000).optional()
  })
  .superRefine((input, context) => {
    if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Interview end time must be after the start time."
      });
    }
  });

const paymentRate = z.coerce.number().min(0).max(100).multipleOf(0.01);

export const jobRecordInput = z
  .object({
    bidId: z.string().uuid(),
    bidderMemberId: z.string().uuid(),
    callerMemberId: z.string().uuid(),
    workerMemberId: z.string().uuid(),
    bidderRate: paymentRate,
    callerRate: paymentRate,
    workerRate: paymentRate,
    discountRate: paymentRate
  })
  .superRefine((input, context) => {
    const totalBasisPoints = [
      input.bidderRate,
      input.callerRate,
      input.workerRate,
      input.discountRate
    ].reduce((total, rate) => total + Math.round(rate * 100), 0);
    if (totalBasisPoints !== 10000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountRate"],
        message: "Bidder, caller, worker, and discount rates must total 100%."
      });
    }
  });

export const paymentRecordInput = z.object({
  jobRecordId: z.string().uuid(),
  paymentAmount: z.coerce.number().positive().max(999999999).multipleOf(0.01)
});

export const paymentPayInput = z.object({
  paymentRecordIds: z.array(z.string().uuid()).min(1)
});

export const bulkBidRecordInput = z.object({
  records: z.array(bidRecordInput).min(1)
});

const listQueryBase = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  profileId: z.string().uuid().optional(),
  jobMarketId: z.string().uuid().optional()
});

export const bidListQuery = listQueryBase.extend({
  sortBy: z.enum(["company", "jobTitle", "datetime"]).default("datetime")
});

export const interviewListQuery = listQueryBase.extend({
  sortBy: z.enum(["company", "jobTitle", "datetime"]).default("datetime")
});

export const jobListQuery = listQueryBase.extend({
  sortBy: z.enum(["company", "jobTitle", "datetime"]).default("datetime"),
  memberId: z.string().uuid().optional()
});

export const paymentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sortBy: z.enum(["datetime", "amount"]).default("datetime"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  jobRecordId: z.string().uuid().optional(),
  status: z.enum(["pending", "paid"]).optional()
});

export const paymentAnalysisQuery = z
  .object({
    status: z.enum(["pending", "paid"]).default("pending"),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional()
  })
  .superRefine((input, context) => {
    if (
      input.dateFrom &&
      input.dateTo &&
      new Date(input.dateTo).getTime() <= new Date(input.dateFrom).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "Payment analysis date range end must be after its start."
      });
    }
  });

export const trackingDashboardQuery = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    todayFrom: z.string().datetime(),
    todayTo: z.string().datetime(),
    timeZone: z.string().trim().min(1).max(100).refine(isTimeZone, {
      message: "Enter a valid IANA timezone."
    }),
    profileId: z.string().uuid().optional(),
    jobMarketId: z.string().uuid().optional(),
    bidderId: z.string().uuid().optional()
  })
  .superRefine((input, context) => {
    if (new Date(input.to).getTime() <= new Date(input.from).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Dashboard range end must be after its start."
      });
    }
    if (new Date(input.todayTo).getTime() <= new Date(input.todayFrom).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["todayTo"],
        message: "Today range end must be after its start."
      });
    }
  });

export type TrackingProfileInput = z.infer<typeof trackingProfileInput>;
export type TrackingProfileRequestInput = z.infer<typeof trackingProfileRequestInput>;
export type TrackingProfileRequestReviewInput = z.infer<typeof trackingProfileRequestReviewInput>;
export type TrackingJobMarketInput = z.infer<typeof trackingJobMarketInput>;
export type BidRecordInput = z.infer<typeof bidRecordInput>;
export type BulkBidRecordInput = z.infer<typeof bulkBidRecordInput>;
export type InterviewRecordInput = z.infer<typeof interviewRecordInput>;
export type JobRecordInput = z.infer<typeof jobRecordInput>;
export type PaymentRecordInput = z.infer<typeof paymentRecordInput>;
export type PaymentPayInput = z.infer<typeof paymentPayInput>;
export type BidListQuery = z.infer<typeof bidListQuery>;
export type InterviewListQuery = z.infer<typeof interviewListQuery>;
export type JobListQuery = z.infer<typeof jobListQuery>;
export type PaymentListQuery = z.infer<typeof paymentListQuery>;
export type PaymentAnalysisQuery = z.infer<typeof paymentAnalysisQuery>;
export type TrackingDashboardQuery = z.infer<typeof trackingDashboardQuery>;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
