import type { FieldMap, GeneratedResume, PageSnapshot } from "./schemas";

export type ExtensionMessage =
  | {
      type: "GET_EXTENSION_CONTEXT";
    }
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
      resume?: GeneratedResume;
    }
  | {
      type: "CREATE_APPLY_SESSION";
      snapshot: PageSnapshot;
    }
  | {
      type: "REQUEST_FIELD_MAP";
      sessionId: string;
      snapshot: PageSnapshot;
    }
  | {
      type: "EXTRACT_CURRENT_STEP";
      sessionId: string;
      snapshot: PageSnapshot;
    }
  | {
      type: "GENERATE_RESUME";
      sessionId: string;
      refinementNote?: string;
    }
  | {
      type: "MODIFY_RESUME";
      sessionId: string;
      resumeVersionId: string;
      refinementNote: string;
    }
  | {
      type: "COMMIT_BID";
      sessionId: string;
      resumeVersionId?: string;
      fieldMap?: FieldMap;
    };

export type AnalyzeActiveTabResponse = {
  snapshot: PageSnapshot;
};

export type ApplyFieldMapResponse = {
  applied: Array<{ elementRef: string; status: "filled" | "skipped" | "unsupported" }>;
  warnings: string[];
};
