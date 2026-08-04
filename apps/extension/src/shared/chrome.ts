import type { ExtensionMessage } from "./messages";

type ChromeCallback<T> = (value: T) => void;
const runtimeMessageTimeoutMs = 510_000;

type ChromeStorageArea = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type ChromePermissions = {
  contains(
    permissions: {
      origins?: string[];
      permissions?: string[];
    },
    callback: ChromeCallback<boolean>
  ): void;
};

export type ChromeTab = {
  id?: number;
  url?: string;
  windowId?: number;
};

type ChromeApi = {
  runtime: {
    lastError?: { message?: string };
    onMessage: {
      addListener(
        callback: (
          message: ExtensionMessage,
          sender: { tab?: ChromeTab },
          sendResponse: ChromeCallback<unknown>
        ) => boolean | void
      ): void;
    };
    sendMessage<T = unknown>(message: ExtensionMessage, callback: ChromeCallback<T>): void;
  };
  permissions?: ChromePermissions;
  storage: {
    local: ChromeStorageArea;
  };
  tabs: {
    query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<ChromeTab[]>;
    sendMessage<T = unknown>(tabId: number, message: ExtensionMessage): Promise<T>;
  };
  scripting: {
    executeScript<T = unknown>(details: {
      target: { tabId: number };
      files?: string[];
      func?: (...args: unknown[]) => T;
      args?: unknown[];
    }): Promise<Array<{ result?: Awaited<T> }>>;
  };
  sidePanel?: {
    open(options: { tabId?: number; windowId?: number }): Promise<void>;
  };
};

declare global {
  // Chrome exposes this global in extension pages, service workers, and content scripts.
  // The project only needs the small API surface declared above.
  var chrome: ChromeApi | undefined;
}

export function chromeApi(): ChromeApi {
  if (!globalThis.chrome) {
    throw new Error("Chrome extension APIs are unavailable.");
  }

  return globalThis.chrome;
}

export async function sendRuntimeMessage<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const api = chromeApi();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(
        new Error("The extension request timed out. Check the API and AI provider connection.")
      );
    }, runtimeMessageTimeoutMs);

    api.runtime.sendMessage<T>(message, (response) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const lastError = api.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message ?? "Chrome runtime message failed."));
        return;
      }

      resolve(response);
    });
  });
}

export type RuntimeErrorResponse = {
  error: string;
  name?: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
};

export async function requestRuntime<T>(message: ExtensionMessage): Promise<T> {
  const response = await sendRuntimeMessage<T | RuntimeErrorResponse>(message);
  if (isRuntimeErrorResponse(response)) {
    const error = new Error(response.error) as Error & {
      code?: string;
      status?: number;
      details?: Record<string, unknown>;
    };
    error.name = response.name ?? "BackgroundRequestError";
    error.code = response.code;
    error.status = response.status;
    error.details = response.details;
    throw error;
  }

  return response as T;
}

export function isRuntimeErrorResponse(value: unknown): value is RuntimeErrorResponse {
  return isObject(value) && typeof value.error === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
