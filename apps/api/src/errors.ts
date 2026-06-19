import type { Context } from "hono";

type ErrorBody = {
  error: string;
  code?: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiError(status: number, message: string, code?: string, details?: unknown) {
  return new ApiError(status, message, code, details);
}

export function jsonError(
  c: Context,
  status: number,
  message: string,
  code?: string,
  details?: unknown
) {
  const body: ErrorBody = { error: message };

  if (code) {
    body.code = code;
  }

  if (details !== undefined) {
    body.details = details;
  }

  return c.json(body, status as 400);
}

export async function upstreamErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Upstream request failed with ${response.status}.`;
  }

  try {
    const body = JSON.parse(text) as { message?: string; error?: string; msg?: string };
    return body.message ?? body.msg ?? body.error ?? text;
  } catch {
    return text;
  }
}
