import { ApplyAssistantApi } from "../api/apply-assistant-api";
import { chromeApi, type ChromeTab } from "../shared/chrome";
import type {
  ApplyFieldMapResponse,
  ClickActionResponse,
  ExtensionMessage
} from "../shared/messages";
import { pageSnapshotSchema, parseWithSchema } from "../shared/schemas";
import {
  connectExtensionTokenSettings,
  refreshSettingsContext,
  saveSettingsAndRefresh
} from "../storage/connection";
import { getSettings } from "../storage/settings";

const expectedContentBridgeVersion = "2026-07-07.3";

chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse(errorResponse(error));
    });

  return true;
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case "GET_SETTINGS":
      return { settings: await getSettings() };
    case "SAVE_SETTINGS":
      return { settings: await saveSettingsAndRefresh(message.settings) };
    case "CONNECT_EXTENSION_TOKEN":
      return {
        settings: await connectExtensionTokenSettings(message.tokenInput, message.apiBaseUrl)
      };
    case "REFRESH_TOKEN_CONTEXT":
      return { settings: await refreshSettingsContext() };
    case "ANALYZE_ACTIVE_TAB":
      return analyzeActiveTab();
    case "CREATE_APPLY_SESSION": {
      const settings = await getSettings();
      const api = new ApplyAssistantApi(settings);
      return { session: await api.createSession(message.snapshot) };
    }
    case "REQUEST_FIELD_MAP": {
      const settings = await getSettings();
      const api = new ApplyAssistantApi(settings);
      return { fieldMap: await api.requestFieldMap(message.sessionId, message.snapshot) };
    }
    case "GENERATE_RESUME": {
      const settings = await getSettings();
      const api = new ApplyAssistantApi(settings);
      return {
        resume: await api.generateResume(message.sessionId, message.refinementNote)
      };
    }
    case "MODIFY_RESUME": {
      const settings = await getSettings();
      const api = new ApplyAssistantApi(settings);
      return {
        resume: await api.modifyResume(
          message.sessionId,
          message.resumeVersionId,
          message.refinementNote
        )
      };
    }
    case "COMMIT_BID": {
      const settings = await getSettings();
      const api = new ApplyAssistantApi(settings);
      return {
        bid: await api.commitBid(message.sessionId, message.resumeVersionId)
      };
    }
    case "APPLY_FIELD_MAP":
      return runContentBridge("applyFieldMap", [message.fieldMap]);
    case "CLICK_ACTION":
      return runContentBridge("clickAction", [message.buttonRef]);
    case "HIGHLIGHT_REFS":
      return runContentBridge("highlightRefs", [message.refs]);
    default:
      return { ok: false };
  }
}

async function analyzeActiveTab(): Promise<unknown> {
  const tab = await activeTab();
  if (!tab.id) {
    throw new Error("No active tab is available.");
  }

  await injectContentScript(tab.id);

  const response = await runContentBridgeForTab(tab.id, "analyzePage", []);
  if (!isObject(response)) {
    throw new Error("Unable to analyze this page. The content script did not return a response.");
  }
  if ("error" in response) {
    throw new Error(String(response.error));
  }
  if (!("snapshot" in response)) {
    throw new Error("Unable to analyze this page. The page snapshot was missing.");
  }

  return {
    snapshot: parseWithSchema(pageSnapshotSchema, response.snapshot, "Content page snapshot")
  };
}

async function runContentBridge(
  method: "highlightRefs" | "applyFieldMap" | "clickAction",
  args: unknown[]
): Promise<unknown> {
  const tab = await activeTab();
  if (!tab.id) {
    throw new Error("No active tab is available.");
  }

  return runContentBridgeForTab(tab.id, method, args);
}

async function runContentBridgeForTab(
  tabId: number,
  method: "analyzePage" | "highlightRefs" | "applyFieldMap" | "clickAction",
  args: unknown[]
): Promise<unknown> {
  await injectContentScript(tabId);
  const [result] = await chromeApi().scripting.executeScript({
    target: { tabId },
    func: (requestedMethod, requestedArgs, expectedVersion) => {
      try {
        const methodName = String(requestedMethod);
        const methodArgs = Array.isArray(requestedArgs) ? requestedArgs : [];
        const version = String(expectedVersion);
        const assistant = (
          window as Window & {
            __rghs1ApplyAssistant?: {
              version: string;
              analyzePage(): unknown;
              highlightRefs(refs: string[]): unknown;
              applyFieldMap(fieldMap: unknown): ApplyFieldMapResponse;
              clickAction(buttonRef: string): ClickActionResponse;
            };
          }
        ).__rghs1ApplyAssistant;
        if (!assistant) {
          throw new Error("Apply assistant content bridge was not installed on this page.");
        }
        if (assistant.version !== version) {
          throw new Error(
            `Apply assistant content bridge is stale (${assistant.version}); reload this page and try again.`
          );
        }

        if (methodName === "analyzePage") {
          return assistant.analyzePage();
        }
        if (methodName === "highlightRefs") {
          return assistant.highlightRefs((methodArgs[0] as string[]) ?? []);
        }
        if (methodName === "applyFieldMap") {
          return assistant.applyFieldMap(methodArgs[0]);
        }
        if (methodName === "clickAction") {
          return assistant.clickAction(String(methodArgs[0] ?? ""));
        }

        throw new Error("Unknown apply assistant content bridge method.");
      } catch (error) {
        if (!(error instanceof Error)) {
          return {
            __rghs1ApplyAssistantError: true,
            error: "Content script bridge failed.",
            details: { thrownValue: String(error) }
          };
        }

        return {
          __rghs1ApplyAssistantError: true,
          error: error.message,
          name: error.name,
          details:
            "details" in error ? (error as unknown as { details?: unknown }).details : undefined
        };
      }
    },
    args: [method, args, expectedContentBridgeVersion]
  });

  const value = result?.result;
  if (isContentBridgeError(value)) {
    const error = new Error(value.error) as Error & { details?: Record<string, unknown> };
    error.name = value.name ?? "ContentBridgeError";
    error.details = isObject(value.details) ? value.details : undefined;
    throw error;
  }

  return value;
}

async function injectContentScript(tabId: number): Promise<void> {
  await chromeApi().scripting.executeScript({
    target: { tabId },
    files: ["assets/content.js"]
  });
}

async function activeTab(): Promise<ChromeTab> {
  const tabs = await chromeApi().tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    throw new Error("No active tab is available.");
  }

  return tab;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isContentBridgeError(value: unknown): value is {
  __rghs1ApplyAssistantError: true;
  error: string;
  name?: string;
  details?: unknown;
} {
  return (
    isObject(value) && value.__rghs1ApplyAssistantError === true && typeof value.error === "string"
  );
}

function errorResponse(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      error: "Background request failed.",
      details: {
        thrownValue: String(error)
      }
    };
  }

  return {
    error: error.message,
    name: error.name,
    code: errorProperty(error, "code"),
    status: errorProperty(error, "status"),
    details: errorProperty(error, "details")
  };
}

function errorProperty(error: Error, key: string): unknown {
  if (!(key in error)) {
    return undefined;
  }

  return (error as unknown as Record<string, unknown>)[key];
}
