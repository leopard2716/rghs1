import { apiError, upstreamErrorMessage } from "../errors";
import type { SupabaseConfig } from "../config/env";

export type SelectOptions = {
  order?: string;
  limit?: number;
  offset?: number;
};

export type PageResult<T> = {
  records: T[];
  total: number;
};

export class SupabaseRestClient {
  private static readonly requestTimeoutMs = 10_000;
  private static readonly selectAllPageSize = 1000;

  constructor(private readonly config: SupabaseConfig) {}

  async select<T>(
    table: string,
    select: string,
    filters: Record<string, string> = {},
    options: SelectOptions = {}
  ): Promise<T[]> {
    const params = this.selectParams(select, filters, options);

    const response = await this.request(
      `${this.config.url}/rest/v1/${table}?${params.toString()}`,
      { headers: this.headers() },
      "supabase_select_failed"
    );

    if (!response.ok) {
      throw await this.responseError(response, "supabase_select_failed");
    }

    return (await response.json()) as T[];
  }

  async selectAll<T>(
    table: string,
    select: string,
    filters: Record<string, string> = {},
    options: Pick<SelectOptions, "order"> = {}
  ): Promise<T[]> {
    const pageSize = SupabaseRestClient.selectAllPageSize;
    const firstPage = await this.selectPage<T>(table, select, filters, {
      limit: pageSize,
      offset: 0,
      order: options.order
    });
    const records = [...firstPage.records];

    for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
      const page = await this.selectPage<T>(table, select, filters, {
        limit: pageSize,
        offset,
        order: options.order
      });
      records.push(...page.records);
    }

    return records;
  }

  async selectPage<T>(
    table: string,
    select: string,
    filters: Record<string, string>,
    options: Required<Pick<SelectOptions, "limit" | "offset">> & Pick<SelectOptions, "order">
  ): Promise<PageResult<T>> {
    const params = this.selectParams(select, filters, options);
    const response = await this.request(
      `${this.config.url}/rest/v1/${table}?${params.toString()}`,
      {
        headers: this.headers({
          Prefer: "count=exact",
          Range: `${options.offset}-${options.offset + options.limit - 1}`,
          "Range-Unit": "items"
        })
      },
      "supabase_select_failed"
    );

    if (!response.ok) {
      throw await this.responseError(response, "supabase_select_failed");
    }

    return {
      records: (await response.json()) as T[],
      total: totalFromContentRange(response.headers.get("content-range"))
    };
  }

  async insert<T>(table: string, rows: Record<string, unknown>[]): Promise<T[]> {
    if (rows.length === 0) {
      return [];
    }

    const response = await this.request(
      `${this.config.url}/rest/v1/${table}?select=*`,
      {
        method: "POST",
        headers: this.headers({
          Prefer: "return=representation"
        }),
        body: JSON.stringify(rows)
      },
      "supabase_insert_failed"
    );

    if (!response.ok) {
      throw await this.responseError(response, "supabase_insert_failed");
    }

    return (await response.json()) as T[];
  }

  async update<T>(
    table: string,
    values: Record<string, unknown>,
    filters: Record<string, string>
  ): Promise<T[]> {
    const params = new URLSearchParams({ select: "*" });
    for (const [key, value] of Object.entries(filters)) {
      params.set(key, value);
    }

    const response = await this.request(
      `${this.config.url}/rest/v1/${table}?${params.toString()}`,
      {
        method: "PATCH",
        headers: this.headers({
          Prefer: "return=representation"
        }),
        body: JSON.stringify(values)
      },
      "supabase_update_failed"
    );

    if (!response.ok) {
      throw await this.responseError(response, "supabase_update_failed");
    }

    return (await response.json()) as T[];
  }

  async delete<T>(table: string, filters: Record<string, string>): Promise<T[]> {
    const params = new URLSearchParams({ select: "*" });
    for (const [key, value] of Object.entries(filters)) {
      params.set(key, value);
    }

    const response = await this.request(
      `${this.config.url}/rest/v1/${table}?${params.toString()}`,
      {
        method: "DELETE",
        headers: this.headers({
          Prefer: "return=representation"
        })
      },
      "supabase_delete_failed"
    );

    if (!response.ok) {
      throw await this.responseError(response, "supabase_delete_failed");
    }

    return (await response.json()) as T[];
  }

  private headers(extra?: HeadersInit): HeadersInit {
    return {
      apikey: this.config.serviceRoleKey,
      authorization: `Bearer ${this.config.serviceRoleKey}`,
      "content-type": "application/json",
      ...extra
    };
  }

  private selectParams(
    select: string,
    filters: Record<string, string>,
    options: SelectOptions
  ): URLSearchParams {
    const params = new URLSearchParams({ select });
    for (const [key, value] of Object.entries(filters)) {
      params.set(key, value);
    }
    if (options.order) {
      params.set("order", options.order);
    }
    if (options.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options.offset !== undefined) {
      params.set("offset", String(options.offset));
    }
    return params;
  }

  private async request(url: string, init: RequestInit, code: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SupabaseRestClient.requestTimeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw apiError(504, "The database request timed out.", "supabase_request_timeout");
      }
      throw apiError(
        502,
        "The API could not reach the database.",
        code,
        error instanceof Error ? { cause: error.message } : undefined
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async responseError(response: Response, code: string) {
    const message = await upstreamErrorMessage(response);
    if (
      message.includes("auth_user_id") ||
      message.includes("workspace_member_roles.workspace_id") ||
      message.includes("workspace_role_permissions.workspace_id") ||
      message.includes("workspace_member_onboarding.workspace_id")
    ) {
      return apiError(
        503,
        "Tenant identity isolation requires Supabase migration 0006_tenant_identity_and_relational_isolation.sql.",
        "tenant_identity_migration_required"
      );
    }

    if (
      message.includes("notifications") ||
      message.includes("tracking_profile_requests") ||
      message.includes("tracking-profile-request")
    ) {
      return apiError(
        503,
        "Realtime notifications and profile requests require Supabase migration 0010_realtime_notifications_and_profile_requests.sql.",
        "notification_migration_required"
      );
    }

    if (
      message.includes("tracking_profiles") ||
      message.includes("tracking_job_markets") ||
      message.includes("job_market_id") ||
      message.includes("job_title") ||
      message.includes("job_description") ||
      message.includes("bid_at") ||
      message.includes("start_at") ||
      message.includes("time_zone") ||
      message.includes("interview_link") ||
      message.includes("bid_records") ||
      message.includes("bid_record_profiles") ||
      message.includes("interview_records")
    ) {
      return apiError(
        503,
        "Tracking storage requires the latest Supabase plaintext tracking migrations.",
        "tracking_schema_migration_required"
      );
    }

    return apiError(response.status, message, code);
  }
}

function totalFromContentRange(value: string | null): number {
  if (!value) {
    return 0;
  }
  const total = value.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}
