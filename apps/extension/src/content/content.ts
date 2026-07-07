import { applyFieldMap } from "../autofill/autofill";
import { extractPageSnapshot } from "../extractors/page-snapshot";
import { chromeApi } from "../shared/chrome";
import type { ApplyFieldMapResponse, ExtensionMessage } from "../shared/messages";
import { highlightRefs, markElementRefs } from "./highlight";

let lastSnapshotRefs: Array<{ ref: string; selector: string; kind?: string; label?: string }> = [];
export const contentBridgeVersion = "2026-07-07.2";

declare global {
  interface Window {
    __rghs1ApplyAssistant?: {
      version: string;
      analyzePage(): { snapshot: ReturnType<typeof extractPageSnapshot> };
      highlightRefs(refs: string[]): { ok: true };
      applyFieldMap(fieldMap: unknown): ApplyFieldMapResponse;
    };
    __rghs1ApplyAssistantListenerLoaded?: boolean;
  }
}

window.__rghs1ApplyAssistant = {
  version: contentBridgeVersion,
  analyzePage,
  highlightRefs: (refs) => {
    highlightRefs(document, refs);
    return { ok: true };
  },
  applyFieldMap: (fieldMap) => {
    ensureElementRefs();
    return applyFieldMap(document, fieldMap);
  }
};

if (!window.__rghs1ApplyAssistantListenerLoaded) {
  window.__rghs1ApplyAssistantListenerLoaded = true;
  chromeApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse(errorResponse(error));
      });
    return true;
  });
}

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case "ANALYZE_PAGE":
      return window.__rghs1ApplyAssistant?.analyzePage() ?? analyzePage();
    case "HIGHLIGHT_REFS":
      return window.__rghs1ApplyAssistant?.highlightRefs(message.refs) ?? { ok: true };
    case "APPLY_FIELD_MAP":
      return (
        window.__rghs1ApplyAssistant?.applyFieldMap(message.fieldMap) ??
        (applyFieldMap(document, message.fieldMap) satisfies ApplyFieldMapResponse)
      );
    default:
      return { ok: false };
  }
}

function analyzePage(): { snapshot: ReturnType<typeof extractPageSnapshot> } {
  const snapshot = extractPageSnapshot(document, window.location.href);
  lastSnapshotRefs = [...snapshot.fields, ...snapshot.buttons].map(
    ({ kind, label, ref, selector }) => ({
      kind,
      label,
      ref,
      selector
    })
  );
  markElementRefs(document, lastSnapshotRefs);
  highlightRefs(document, defaultHighlightedRefs(snapshot.fields));
  return { snapshot };
}

function defaultHighlightedRefs(
  fields: Array<{ kind: string; label: string; ref: string }>
): string[] {
  const refs = new Set(fields.slice(0, 12).map((field) => field.ref));
  for (const field of fields) {
    if (isUploadField(field)) {
      refs.add(field.ref);
    }
  }

  return Array.from(refs).slice(0, 24);
}

function isUploadField(field: { kind: string; label: string }): boolean {
  return (
    field.kind === "file" ||
    /\b(resume|cv|cover\s+letter|attach|upload|dropbox|file)\b/i.test(field.label)
  );
}

function ensureElementRefs(): void {
  if (lastSnapshotRefs.length > 0) {
    markElementRefs(document, lastSnapshotRefs);
  }
}

function errorResponse(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      error: "Content script request failed.",
      details: {
        thrownValue: String(error)
      }
    };
  }

  return {
    error: error.message,
    name: error.name,
    details: errorProperty(error, "details")
  };
}

function errorProperty(error: Error, key: string): unknown {
  if (!(key in error)) {
    return undefined;
  }

  return (error as unknown as Record<string, unknown>)[key];
}
