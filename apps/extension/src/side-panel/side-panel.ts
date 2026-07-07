import "../ui/styles.css";
import { requestRuntime } from "../shared/chrome";
import type { AnalyzeActiveTabResponse, ApplyFieldMapResponse } from "../shared/messages";
import { evaluateFieldMap, safeFieldMapForSnapshot } from "../shared/quality-gates";
import {
  applySessionResponseSchema,
  fieldMapSchema,
  parseWithSchema,
  type ApplySessionResponse,
  type FieldMap,
  type PageSnapshot
} from "../shared/schemas";
import { appRoot, clear, item, setErrorStatus, setStatus } from "../ui/dom";

let currentSnapshot: PageSnapshot | null = null;
let currentSession: ApplySessionResponse | null = null;
let currentFieldMap: FieldMap | null = null;

render();

function render(): void {
  const root = appRoot();
  root.className = "side-shell";
  root.append(header(), controls(), summarySection(), fieldsSection(), statusElement());
}

function header(): HTMLElement {
  const container = document.createElement("div");
  container.className = "header";
  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = "Apply Assistant";
  container.append(title);
  return container;
}

function controls(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Workflow";

  const actions = document.createElement("div");
  actions.className = "actions";
  const analyze = button("Analyze", "button");
  const createSession = button("Create session", "button secondary");
  const requestMap = button("Request field map", "button secondary");
  const applyMap = button("Apply validated map", "button secondary");

  analyze.addEventListener("click", () => void analyzeTab());
  createSession.addEventListener("click", () => void createApplySession());
  requestMap.addEventListener("click", () => void requestFieldMap());
  applyMap.addEventListener("click", () => void applyFieldMapToPage());

  actions.append(analyze, createSession, requestMap, applyMap);
  section.append(heading, actions);
  return section;
}

function summarySection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Page summary";
  const summary = document.createElement("div");
  summary.id = "summary";
  summary.className = "summary";
  summary.textContent = "Analyze a job page to start.";
  section.append(heading, summary);
  return section;
}

function fieldsSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Detected fields";
  const list = document.createElement("div");
  list.id = "fields";
  list.className = "list";
  section.append(heading, list);
  return section;
}

function statusElement(): HTMLElement {
  const status = document.createElement("div");
  status.id = "status";
  status.className = "status";
  return status;
}

function button(label: string, className: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = className;
  element.type = "button";
  element.textContent = label;
  return element;
}

async function analyzeTab(): Promise<void> {
  try {
    status("Analyzing active tab...");
    const response = await requestRuntime<AnalyzeActiveTabResponse>({
      type: "ANALYZE_ACTIVE_TAB"
    });
    if (!response.snapshot) {
      throw new Error("Analyze response did not include a page snapshot.");
    }

    currentSnapshot = response.snapshot;
    currentSession = null;
    currentFieldMap = null;
    renderSnapshot(response.snapshot);
    status("Page snapshot validated.");
  } catch (error) {
    errorStatus(error, "Unable to analyze tab.");
  }
}

async function createApplySession(): Promise<void> {
  if (!currentSnapshot) {
    status("Analyze a page before creating a session.", "error");
    return;
  }

  try {
    status("Creating backend apply session...");
    const response = await requestRuntime<{ session: unknown }>({
      type: "CREATE_APPLY_SESSION",
      snapshot: currentSnapshot
    });
    const session = parseWithSchema(applySessionResponseSchema, response.session, "Apply session");
    currentSession = session;
    status(`Session ready: ${session.id}`);
  } catch (error) {
    errorStatus(error, "Unable to create session.");
  }
}

async function requestFieldMap(): Promise<void> {
  if (!currentSnapshot || !currentSession) {
    status("Analyze a page and create a session before requesting a field map.", "error");
    return;
  }

  try {
    status("Requesting AI field map...");
    const response = await requestRuntime<{ fieldMap: unknown }>({
      type: "REQUEST_FIELD_MAP",
      sessionId: currentSession.id,
      snapshot: currentSnapshot
    });
    const parsedFieldMap = parseWithSchema(fieldMapSchema, response.fieldMap, "Field map");
    const gate = evaluateFieldMap(parsedFieldMap, currentSnapshot);
    if (!gate.pass) {
      const safeMap = safeFieldMapForSnapshot(parsedFieldMap, currentSnapshot);
      currentFieldMap = safeMap;
      renderFieldMap(safeMap);
      status(`Field map needs review: ${gate.failures.join(" ")}`, "error");
      return;
    }

    currentFieldMap = parsedFieldMap;
    renderFieldMap(parsedFieldMap);
    status(`Field map validated with ${parsedFieldMap.fields.length} mapped fields.`);
  } catch (error) {
    errorStatus(error, "Unable to request field map.");
  }
}

async function applyFieldMapToPage(): Promise<void> {
  if (!currentFieldMap) {
    status("Request and validate a field map before autofill.", "error");
    return;
  }

  try {
    const response = await requestRuntime<ApplyFieldMapResponse>({
      type: "APPLY_FIELD_MAP",
      fieldMap: currentFieldMap
    });
    const filled = response.applied.filter((entry) => entry.status === "filled").length;
    status(`Autofill completed. Filled ${filled} fields.`);
  } catch (error) {
    errorStatus(error, "Unable to apply field map.");
  }
}

function renderSnapshot(snapshot: PageSnapshot): void {
  const summary = requireElement("summary");
  clear(summary);
  summary.append(
    item("Title", snapshot.pageTitle),
    item("URL", snapshot.pageUrl),
    item("Fields", String(snapshot.fields.length)),
    item("Buttons", String(snapshot.buttons.length))
  );

  const list = requireElement("fields");
  clear(list);
  for (const field of snapshot.fields.slice(0, 40)) {
    list.append(item(`${field.ref} · ${field.kind}`, field.label || field.name || field.selector));
  }
}

function renderFieldMap(fieldMap: FieldMap): void {
  const list = requireElement("fields");
  clear(list);
  for (const field of fieldMap.fields) {
    list.append(
      item(
        `${field.elementRef} · ${Math.round(field.confidence * 100)}%`,
        `${field.valueSource}: ${field.requiresUserReview ? "review required" : field.value}`
      )
    );
  }
}

function status(message: string, kind: "info" | "error" = "info"): void {
  setStatus(requireElement("status"), message, kind);
}

function errorStatus(error: unknown, fallback: string): void {
  setErrorStatus(requireElement("status"), error, fallback);
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`${id} element is missing.`);
  }

  return element;
}
