import type { PageSnapshot } from "./schemas";

export type ExtensionMessage =
  | {
      type: "GET_SETTINGS";
    }
  | {
      type: "SAVE_SETTINGS";
      settings: unknown;
    }
  | {
      type: "CONNECT_EXTENSION_TOKEN";
      tokenInput: string;
      apiBaseUrl?: string;
    }
  | {
      type: "REFRESH_TOKEN_CONTEXT";
    }
  | {
      type: "ANALYZE_ACTIVE_TAB";
    }
  | {
      type: "ANALYZE_PAGE";
    }
  | {
      type: "HIGHLIGHT_REFS";
      refs: string[];
    }
  | {
      type: "APPLY_FIELD_MAP";
      fieldMap: unknown;
    }
  | {
      type: "CREATE_APPLY_SESSION";
      snapshot: PageSnapshot;
    }
  | {
      type: "REQUEST_FIELD_MAP";
      sessionId: string;
      snapshot: PageSnapshot;
    };

export type AnalyzeActiveTabResponse = {
  snapshot: PageSnapshot;
};

export type ApplyFieldMapResponse = {
  applied: Array<{ elementRef: string; status: "filled" | "skipped" | "unsupported" }>;
  warnings: string[];
};
