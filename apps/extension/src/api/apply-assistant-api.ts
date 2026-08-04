import {
  applySessionResponseSchema,
  commitBidResponseSchema,
  extensionTokenContextSchema,
  fieldMapSchema,
  generatedResumeSchema,
  parseWithSchema,
  type ApplyAssistantSettings,
  type ApplySessionResponse,
  type CommitBidResponse,
  type ExtensionTokenContext,
  type FieldMap,
  type GeneratedResume,
  type PageSnapshot
} from "../shared/schemas";
import { chromeApi } from "../shared/chrome";

type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
};

const apiRequestTimeoutMs = 500_000;

export type ApplyAssistantApiErrorDetails = Record<string, string | number | boolean | null>;

export class ApplyAssistantApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly details: ApplyAssistantApiErrorDetails = {}
  ) {
    super(message);
    this.name = "ApplyAssistantApiError";
  }
}

export class ApplyAssistantApi {
  constructor(private readonly settings: ApplyAssistantSettings) {}

  async getTokenContext(): Promise<ExtensionTokenContext> {
    const response = await this.fetchTokenJson("/v1/apply-assistant/token-context", {
      method: "GET"
    });

    return parseWithSchema(extensionTokenContextSchema, response, "Extension token context");
  }

  async createSession(snapshot: PageSnapshot): Promise<ApplySessionResponse> {
    const response = await this.fetchJson(`/apply-assistant/sessions`, {
      method: "POST",
      body: JSON.stringify({
        pageSnapshot: snapshot,
        profileId: this.settings.profileId,
        jobMarketId: this.settings.jobMarketId
      })
    });

    return parseWithSchema(applySessionResponseSchema, response, "Apply session response");
  }

  async requestFieldMap(sessionId: string, snapshot: PageSnapshot): Promise<FieldMap> {
    const response = await this.fetchJson(`/apply-assistant/sessions/${sessionId}/field-map`, {
      method: "POST",
      body: JSON.stringify({ pageSnapshot: snapshot })
    });

    return parseWithSchema(fieldMapSchema, response, "Field map response");
  }

  async extractStep(sessionId: string, snapshot: PageSnapshot): Promise<FieldMap> {
    const response = await this.fetchJson(`/apply-assistant/sessions/${sessionId}/steps/extract`, {
      method: "POST",
      body: JSON.stringify({ pageSnapshot: snapshot })
    });

    return parseWithSchema(fieldMapSchema, response, "Step extraction response");
  }

  async generateResume(sessionId: string, refinementNote?: string): Promise<GeneratedResume> {
    const response = await this.fetchJson(`/apply-assistant/sessions/${sessionId}/resumes`, {
      method: "POST",
      body: JSON.stringify({ refinementNote })
    });

    return parseWithSchema(generatedResumeSchema, response, "Generated resume response");
  }

  async modifyResume(
    sessionId: string,
    resumeVersionId: string,
    refinementNote: string
  ): Promise<GeneratedResume> {
    const response = await this.fetchJson(
      `/apply-assistant/sessions/${sessionId}/resumes/${resumeVersionId}/modify`,
      {
        method: "POST",
        body: JSON.stringify({ refinementNote })
      }
    );

    return parseWithSchema(generatedResumeSchema, response, "Modified resume response");
  }

  async commitBid(
    sessionId: string,
    resumeVersionId?: string,
    fieldMap?: FieldMap
  ): Promise<CommitBidResponse> {
    const response = await this.fetchJson(`/apply-assistant/sessions/${sessionId}/commit-bid`, {
      method: "POST",
      body: JSON.stringify({ resumeVersionId, fieldMap })
    });

    return parseWithSchema(commitBidResponseSchema, response, "Bid commit response");
  }

  private async fetchJson(path: string, init: RequestInit): Promise<unknown> {
    if (!this.settings.workspaceSlug) {
      throw new ApplyAssistantApiError(
        "Connect the extension token before using assistant actions."
      );
    }

    return this.fetchTokenJson(
      `/v1/workspaces/${encodeURIComponent(this.settings.workspaceSlug)}${path}`,
      init
    );
  }

  private async fetchTokenJson(path: string, init: RequestInit): Promise<unknown> {
    if (!this.settings.extensionToken) {
      throw new ApplyAssistantApiError("Extension token is required.");
    }

    let url: URL;
    try {
      url = new URL(path, this.settings.apiBaseUrl);
    } catch (error) {
      throw new ApplyAssistantApiError(
        "The API base URL in the extension token is invalid.",
        undefined,
        "api_base_url_invalid",
        {
          apiBaseUrl: this.settings.apiBaseUrl,
          path,
          browserError: error instanceof Error ? error.message : String(error)
        }
      );
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.settings.extensionToken}`);
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    let lastNetworkError: ApplyAssistantApiError | null = null;
    for (const candidateUrl of loopbackCandidateUrls(url)) {
      const permission = await hostPermissionStatus(candidateUrl);
      let response: Response;
      try {
        response = await fetchWithTimeout(candidateUrl, { ...init, headers }, apiRequestTimeoutMs);
      } catch (error) {
        if (error instanceof ApplyAssistantApiError) {
          throw error;
        }

        lastNetworkError = networkErrorFromFetch(
          error,
          candidateUrl,
          this.settings.apiBaseUrl,
          permission,
          candidateUrl.toString() === url.toString() ? null : url.toString()
        );
        continue;
      }

      if (!response.ok) {
        throw await apiErrorFromResponse(response, candidateUrl);
      }

      try {
        return await response.json();
      } catch (error) {
        throw new ApplyAssistantApiError(
          "The apply-assistant API returned a successful response, but it was not valid JSON.",
          response.status,
          "api_invalid_json",
          {
            apiBaseUrl: this.settings.apiBaseUrl,
            requestUrl: candidateUrl.toString(),
            status: response.status,
            browserError: error instanceof Error ? error.message : String(error)
          }
        );
      }
    }

    throw (
      lastNetworkError ??
      new ApplyAssistantApiError(
        "No apply-assistant API request was attempted.",
        undefined,
        "api_request_not_attempted",
        {
          apiBaseUrl: this.settings.apiBaseUrl,
          requestUrl: url.toString()
        }
      )
    );
  }
}

async function apiErrorFromResponse(response: Response, url: URL): Promise<ApplyAssistantApiError> {
  const text = await response.text();
  let payload: ApiErrorPayload | null = null;
  try {
    payload = text ? (JSON.parse(text) as ApiErrorPayload) : null;
  } catch {
    payload = null;
  }

  return new ApplyAssistantApiError(
    payload?.message ?? payload?.error ?? (text || `Request failed with ${response.status}.`),
    response.status,
    payload?.code ?? "api_response_error",
    {
      requestUrl: url.toString(),
      status: response.status,
      statusText: response.statusText,
      backendCode: payload?.code ?? null,
      responsePreview: text.slice(0, 500)
    }
  );
}

type HostPermissionStatus = {
  pattern: string;
  checked: boolean;
  allowed: boolean | null;
  error: string | null;
};

function loopbackCandidateUrls(url: URL): URL[] {
  const alias = loopbackAliasHostname(url.hostname);
  if (!alias) {
    return [url];
  }

  const aliasUrl = new URL(url.toString());
  aliasUrl.hostname = alias;
  return [url, aliasUrl];
}

function loopbackAliasHostname(hostname: string): string | null {
  if (hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return "localhost";
  }
  if (hostname === "localhost") {
    return "127.0.0.1";
  }

  return null;
}

async function hostPermissionStatus(url: URL): Promise<HostPermissionStatus> {
  const pattern = `${url.protocol}//${url.hostname}/*`;
  let api: ReturnType<typeof chromeApi>;
  try {
    api = chromeApi();
  } catch (error) {
    return {
      pattern,
      checked: false,
      allowed: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  if (!api.permissions?.contains) {
    return {
      pattern,
      checked: false,
      allowed: null,
      error: "chrome.permissions.contains is unavailable."
    };
  }

  return new Promise((resolve) => {
    api.permissions?.contains({ origins: [pattern] }, (allowed) => {
      resolve({
        pattern,
        checked: true,
        allowed,
        error: api.runtime.lastError?.message ?? null
      });
    });
  });
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApplyAssistantApiError(
        `The apply-assistant API request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        undefined,
        "api_request_timeout",
        {
          requestUrl: url.toString()
        }
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function networkErrorFromFetch(
  error: unknown,
  url: URL,
  apiBaseUrl: string,
  permission: HostPermissionStatus,
  retryFromUrl: string | null
): ApplyAssistantApiError {
  const browserError = error instanceof Error ? error.message : String(error);
  return new ApplyAssistantApiError(
    "No response came back from the apply-assistant API. The request was blocked before the backend returned HTTP.",
    undefined,
    "api_network_unreachable",
    {
      apiBaseUrl,
      requestUrl: url.toString(),
      retryFromUrl,
      browserError,
      browserOnline: typeof navigator === "undefined" ? null : Boolean(navigator.onLine),
      extensionOrigin: typeof location === "undefined" ? null : location.origin,
      hostPermissionChecked: permission.checked,
      hostPermissionAllowed: permission.allowed,
      requiredOrigin: permission.pattern,
      hostPermissionError: permission.error,
      likelyCause:
        permission.allowed === false
          ? "Chrome reports this API host is not currently permitted. Reload the extension after manifest changes; if it still fails, confirm the API server is running at apiBaseUrl."
          : "API server is not running/reachable at apiBaseUrl, or Chrome/CORS blocked the request."
    }
  );
}
