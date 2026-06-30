import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { authTokenFromHeader, getAuthUser, requireAal2 } from "../../auth/supabase-auth.service";
import type { ApiBindings, ApiContext, ApiVariables } from "../../app.types";
import { requireSupabaseConfig } from "../../config/env";
import { ApiError, jsonError } from "../../errors";
import { SupabaseRestClient } from "../../infrastructure/supabase-rest.client";
import {
  bidListQuery,
  bulkBidRecordInput,
  bidRecordInput,
  bidRecordParams,
  interviewListQuery,
  interviewRecordInput,
  interviewRecordParams,
  jobListQuery,
  jobRecordInput,
  jobRecordParams,
  paymentAnalysisQuery,
  paymentListQuery,
  paymentPayInput,
  paymentRecordInput,
  paymentRecordParams,
  trackingDashboardQuery,
  trackingJobMarketInput,
  trackingJobMarketParams,
  trackingProfileParams,
  trackingProfileRequestInput,
  trackingProfileRequestParams,
  trackingProfileRequestReviewInput,
  trackingProfileInput
} from "./tracking.schemas";
import { TrackingService } from "./tracking.service";

type ApiApp = Hono<{
  Bindings: ApiBindings;
  Variables: ApiVariables;
}>;

export function registerTrackingRoutes(app: ApiApp): void {
  app.get("/v1/workspaces/:slug/tracking/profiles", async (c) => {
    try {
      const { service, user } = await requestContext(c);
      return c.json(await service.listProfiles(c.req.param("slug"), user));
    } catch (error) {
      return trackingError(c, error);
    }
  });

  app.post(
    "/v1/workspaces/:slug/tracking/profiles",
    zValidator("json", trackingProfileInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the profile fields and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.createProfile(c.req.param("slug"), user, c.req.valid("json")),
          201
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.delete(
    "/v1/workspaces/:slug/tracking/profiles/:profileId",
    zValidator("param", trackingProfileParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.deleteProfile(c.req.param("slug"), c.req.valid("param").profileId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get("/v1/workspaces/:slug/tracking/profile-requests", async (c) => {
    try {
      const { service, user } = await requestContext(c);
      return c.json(await service.listProfileRequests(c.req.param("slug"), user));
    } catch (error) {
      return trackingError(c, error);
    }
  });

  app.post(
    "/v1/workspaces/:slug/tracking/profile-requests",
    zValidator("json", trackingProfileRequestInput),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.createProfileRequest(c.req.param("slug"), user, c.req.valid("json")),
          201
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.patch(
    "/v1/workspaces/:slug/tracking/profile-requests/:requestId",
    zValidator("param", trackingProfileRequestParams),
    zValidator("json", trackingProfileRequestReviewInput),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.reviewProfileRequest(
            c.req.param("slug"),
            c.req.valid("param").requestId,
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/job-markets",
    zValidator("json", trackingJobMarketInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the job-market name and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.createJobMarket(c.req.param("slug"), user, c.req.valid("json")),
          201
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/bids/bulk",
    zValidator("json", bulkBidRecordInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the mapped CSV rows and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.bulkCreateBids(c.req.param("slug"), user, c.req.valid("json")),
          201
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.put(
    "/v1/workspaces/:slug/tracking/bids/:bidId",
    zValidator("param", bidRecordParams),
    zValidator("json", bidRecordInput),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.updateBid(
            c.req.param("slug"),
            c.req.valid("param").bidId,
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.delete(
    "/v1/workspaces/:slug/tracking/job-markets/:marketId",
    zValidator("param", trackingJobMarketParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.deleteJobMarket(c.req.param("slug"), c.req.valid("param").marketId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/bids",
    zValidator("query", bidListQuery, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the tracking query and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.listBids(c.req.param("slug"), user, c.req.valid("query")));
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/bids/:bidId",
    zValidator("param", bidRecordParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.getBid(c.req.param("slug"), c.req.valid("param").bidId, user));
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/bids",
    zValidator("json", bidRecordInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the bid fields and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.createBid(c.req.param("slug"), user, c.req.valid("json")), 201);
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.put(
    "/v1/workspaces/:slug/tracking/interviews/:interviewId",
    zValidator("param", interviewRecordParams),
    zValidator("json", interviewRecordInput),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.updateInterview(
            c.req.param("slug"),
            c.req.valid("param").interviewId,
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.delete(
    "/v1/workspaces/:slug/tracking/bids/:bidId",
    zValidator("param", bidRecordParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.deleteBid(c.req.param("slug"), c.req.valid("param").bidId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/interviews",
    zValidator("query", interviewListQuery, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the tracking query and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.listInterviews(c.req.param("slug"), user, c.req.valid("query"))
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/interviews/:interviewId",
    zValidator("param", interviewRecordParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.getInterview(c.req.param("slug"), c.req.valid("param").interviewId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/interviews",
    zValidator("json", interviewRecordInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the interview fields and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.createInterview(c.req.param("slug"), user, c.req.valid("json")),
          201
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.delete(
    "/v1/workspaces/:slug/tracking/interviews/:interviewId",
    zValidator("param", interviewRecordParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.deleteInterview(c.req.param("slug"), c.req.valid("param").interviewId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/jobs",
    zValidator("query", jobListQuery, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the job-record query and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.listJobs(c.req.param("slug"), user, c.req.valid("query")));
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/jobs/:jobRecordId",
    zValidator("param", jobRecordParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.getJob(c.req.param("slug"), c.req.valid("param").jobRecordId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/jobs",
    zValidator("json", jobRecordInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the job-record fields and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.createJob(c.req.param("slug"), user, c.req.valid("json")), 201);
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.put(
    "/v1/workspaces/:slug/tracking/jobs/:jobRecordId",
    zValidator("param", jobRecordParams),
    zValidator("json", jobRecordInput),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.updateJob(
            c.req.param("slug"),
            c.req.valid("param").jobRecordId,
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/payments",
    zValidator("query", paymentListQuery, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the payment query and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.listPayments(c.req.param("slug"), user, c.req.valid("query")));
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/payments/analysis",
    zValidator("query", paymentAnalysisQuery, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the payment analysis query and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.paymentAnalysis(c.req.param("slug"), user, c.req.valid("query"))
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/payments/pay-pending",
    zValidator("json", paymentPayInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Select pending payments to pay and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.payPendingPayments(c.req.param("slug"), user, c.req.valid("json"))
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/payments/:paymentRecordId",
    zValidator("param", paymentRecordParams),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.getPayment(c.req.param("slug"), c.req.valid("param").paymentRecordId, user)
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.post(
    "/v1/workspaces/:slug/tracking/payments",
    zValidator("json", paymentRecordInput, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the payment fields and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.createPayment(c.req.param("slug"), user, c.req.valid("json")),
          201
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.put(
    "/v1/workspaces/:slug/tracking/payments/:paymentRecordId",
    zValidator("param", paymentRecordParams),
    zValidator("json", paymentRecordInput),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(
          await service.updatePayment(
            c.req.param("slug"),
            c.req.valid("param").paymentRecordId,
            user,
            c.req.valid("json")
          )
        );
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );

  app.get(
    "/v1/workspaces/:slug/tracking/dashboard",
    zValidator("query", trackingDashboardQuery, (result, c) => {
      if (!result.success) {
        return jsonError(
          c,
          400,
          "Check the tracking query and try again.",
          "validation_failed",
          result.error.flatten()
        );
      }
    }),
    async (c) => {
      try {
        const { service, user } = await requestContext(c);
        return c.json(await service.dashboard(c.req.param("slug"), user, c.req.valid("query")));
      } catch (error) {
        return trackingError(c, error);
      }
    }
  );
}

async function requestContext(c: ApiContext) {
  const supabaseConfig = requireSupabaseConfig(c.env);
  const token = authTokenFromHeader(c.req.header("authorization"));
  if (!token) {
    throw new ApiError(401, "Authorization bearer token is required.", "auth_required");
  }

  requireAal2(token);
  const user = await getAuthUser(supabaseConfig, token);
  return {
    user,
    service: new TrackingService(new SupabaseRestClient(supabaseConfig))
  };
}

function trackingError(c: ApiContext, error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(c, error.status, error.message, error.code, error.details);
  }

  return jsonError(
    c,
    500,
    error instanceof Error ? error.message : "Tracking request failed.",
    "tracking_request_failed"
  );
}
