import type {
  JobRecordListQuery,
  PaymentListQuery,
  TrackingListQuery
} from "../../services/tracking.service";

export const defaultTrackingListQuery: Required<
  Pick<TrackingListQuery, "page" | "pageSize" | "sortBy" | "sortDirection">
> = {
  page: 1,
  pageSize: 20,
  sortBy: "datetime",
  sortDirection: "desc"
};

export function trackingListQueryFromParams(params: URLSearchParams): TrackingListQuery {
  const sortBy = params.get("sortBy");
  const sortDirection = params.get("sortDirection");

  return {
    page: positiveInteger(params.get("page")) ?? defaultTrackingListQuery.page,
    pageSize: pageSize(params.get("pageSize")) ?? defaultTrackingListQuery.pageSize,
    search: optionalValue(params.get("search")),
    profileId: optionalValue(params.get("profileId")),
    jobMarketId: optionalValue(params.get("jobMarketId")),
    sortBy:
      sortBy === "company" || sortBy === "jobTitle" || sortBy === "datetime"
        ? sortBy
        : defaultTrackingListQuery.sortBy,
    sortDirection:
      sortDirection === "asc" || sortDirection === "desc"
        ? sortDirection
        : defaultTrackingListQuery.sortDirection
  };
}

export function jobListQueryFromParams(params: URLSearchParams): JobRecordListQuery {
  return {
    ...trackingListQueryFromParams(params),
    memberId: optionalValue(params.get("memberId"))
  };
}

export function updateTrackingListParams(
  params: URLSearchParams,
  change: Partial<TrackingListQuery | JobRecordListQuery>
): URLSearchParams {
  const next = new URLSearchParams(params);
  const query = { ...jobListQueryFromParams(params), ...change };

  setOptional(next, "search", query.search);
  setOptional(next, "profileId", query.profileId);
  setOptional(next, "jobMarketId", query.jobMarketId);
  setOptional(next, "memberId", query.memberId);
  setDefaulted(next, "sortBy", query.sortBy, defaultTrackingListQuery.sortBy);
  setDefaulted(next, "sortDirection", query.sortDirection, defaultTrackingListQuery.sortDirection);
  setDefaulted(next, "page", query.page, defaultTrackingListQuery.page);
  setDefaulted(next, "pageSize", query.pageSize, defaultTrackingListQuery.pageSize);

  return next;
}

export function clearTrackingModalParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("modal");
  next.delete("bidId");
  next.delete("interviewId");
  next.delete("jobRecordId");
  next.delete("paymentRecordId");
  return next;
}

export const defaultPaymentListQuery: Required<
  Pick<PaymentListQuery, "page" | "pageSize" | "sortBy" | "sortDirection">
> = {
  page: 1,
  pageSize: 20,
  sortBy: "datetime",
  sortDirection: "desc"
};

export function paymentListQueryFromParams(params: URLSearchParams): PaymentListQuery {
  const sortBy = params.get("sortBy");
  const sortDirection = params.get("sortDirection");
  const status = params.get("status");
  return {
    page: positiveInteger(params.get("page")) ?? defaultPaymentListQuery.page,
    pageSize: pageSize(params.get("pageSize")) ?? defaultPaymentListQuery.pageSize,
    sortBy: sortBy === "amount" || sortBy === "datetime" ? sortBy : defaultPaymentListQuery.sortBy,
    sortDirection:
      sortDirection === "asc" || sortDirection === "desc"
        ? sortDirection
        : defaultPaymentListQuery.sortDirection,
    jobRecordId: optionalValue(params.get("paymentJobId")),
    status: status === "pending" || status === "paid" ? status : undefined
  };
}

export function updatePaymentListParams(
  params: URLSearchParams,
  change: Partial<PaymentListQuery>
): URLSearchParams {
  const next = new URLSearchParams(params);
  const query = { ...paymentListQueryFromParams(params), ...change };

  next.delete("dateFrom");
  next.delete("dateTo");
  next.delete("amountMin");
  next.delete("amountMax");
  setOptional(next, "paymentJobId", query.jobRecordId);
  setOptional(next, "status", query.status);
  setDefaulted(next, "sortBy", query.sortBy, defaultPaymentListQuery.sortBy);
  setDefaulted(next, "sortDirection", query.sortDirection, defaultPaymentListQuery.sortDirection);
  setDefaulted(next, "page", query.page, defaultPaymentListQuery.page);
  setDefaulted(next, "pageSize", query.pageSize, defaultPaymentListQuery.pageSize);

  return next;
}

function optionalValue(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function positiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function pageSize(value: string | null): number | undefined {
  const parsed = positiveInteger(value);
  return parsed && parsed >= 10 && parsed <= 100 ? parsed : undefined;
}

function setOptional(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    params.delete(key);
    return;
  }
  params.set(key, String(value));
}

function setDefaulted(
  params: URLSearchParams,
  key: string,
  value: unknown,
  defaultValue: unknown
): void {
  if (value === undefined || value === defaultValue) {
    params.delete(key);
    return;
  }
  params.set(key, String(value));
}
