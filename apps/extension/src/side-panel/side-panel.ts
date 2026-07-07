import "../ui/styles.css";
import { requestRuntime } from "../shared/chrome";
import type {
  AnalyzeActiveTabResponse,
  ApplyFieldMapResponse,
  ClickActionResponse
} from "../shared/messages";
import { evaluateFieldMap, safeFieldMapForSnapshot } from "../shared/quality-gates";
import {
  applySessionResponseSchema,
  commitBidResponseSchema,
  fieldMapSchema,
  generatedResumeSchema,
  parseWithSchema,
  type ApplySessionResponse,
  type CommitBidResponse,
  type FieldMap,
  type GeneratedResume,
  type PageSnapshot
} from "../shared/schemas";
import { appRoot, clear, item, setErrorStatus, setStatus } from "../ui/dom";

let currentSnapshot: PageSnapshot | null = null;
let currentSession: ApplySessionResponse | null = null;
let currentFieldMap: FieldMap | null = null;
let currentResume: GeneratedResume | null = null;
let currentBid: CommitBidResponse | null = null;
let busy = false;
let statusMessage = "Starting assistant...";
let statusKind: "info" | "error" = "info";

render();
void startApplication();

function render(): void {
  const root = appRoot();
  root.className = "side-shell";
  clear(root);
  root.append(
    header(),
    jobSection(),
    fieldsSection(),
    resumeSection(),
    warningsSection(),
    actionBar(),
    statusElement()
  );
  status(statusMessage, statusKind);
}

function header(): HTMLElement {
  const container = document.createElement("div");
  container.className = "header";
  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = "Apply Assistant";
  const restart = button("Restart", "button secondary compact");
  restart.disabled = busy;
  restart.addEventListener("click", () => void startApplication());
  container.append(title, restart);
  return container;
}

function jobSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Job";
  const summary = document.createElement("div");
  summary.className = "summary";
  const job = currentSession?.extractedJob;
  if (!currentSnapshot) {
    summary.textContent = "Analyzing the active tab.";
  } else {
    summary.append(
      item("Title", job?.jobTitle ?? currentSnapshot.pageTitle),
      item("Company", job?.company ?? "Not detected"),
      item("Job link", currentSnapshot.pageUrl),
      item("Description", job?.jobDescriptionText ?? currentSnapshot.visibleText)
    );
  }
  section.append(heading, summary);
  return section;
}

function fieldsSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Input fields";
  const list = document.createElement("div");
  list.className = "list";

  if (currentFieldMap) {
    for (const field of currentFieldMap.fields) {
      list.append(
        item(
          `${field.elementRef} - ${field.valueSource} - ${Math.round(field.confidence * 100)}%`,
          `${field.label || "Unlabeled"}${field.requiresUserReview ? " - review" : ""}${
            field.value ? ` - ${field.value}` : ""
          }`
        )
      );
    }
  } else if (currentSnapshot) {
    for (const field of currentSnapshot.fields.slice(0, 80)) {
      list.append(
        item(
          `${field.ref} - ${field.kind}${field.required ? " - required" : ""}`,
          `${field.label || field.name || field.selector}${
            field.kind === "file" ? " - attach file field" : ""
          }`
        )
      );
    }
  } else {
    list.textContent = "Fields will appear after analysis.";
  }

  section.append(heading, list);
  return section;
}

function resumeSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Resume";

  if (!hasResumeField()) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.textContent = "No resume upload field detected on this step.";
    section.append(heading, empty);
    return section;
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const generate = button(currentResume ? "Regenerate" : "Generate", "button secondary");
  generate.disabled = busy || !currentSession;
  generate.addEventListener("click", () => void generateResume());
  const print = button("Print PDF", "button secondary");
  print.disabled = !currentResume;
  print.addEventListener("click", () => printResume());
  actions.append(generate, print);

  const preview = document.createElement("iframe");
  preview.className = "resume-preview";
  preview.setAttribute("sandbox", "");
  preview.srcdoc =
    currentResume?.resumeHtml ?? "<section><p>Generate a resume to preview it.</p></section>";

  const note = document.createElement("input");
  note.className = "refinement-input";
  note.placeholder = "Refinement note";
  note.disabled = busy || !currentResume;
  note.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const value = note.value.trim();
    if (value) {
      note.value = "";
      void modifyResume(value);
    }
  });

  section.append(heading, actions, preview, note);
  return section;
}

function warningsSection(): HTMLElement {
  const warnings = [
    ...(currentSnapshot?.warnings ?? []),
    ...(currentSession?.extractedJob?.warnings ?? []),
    ...(currentFieldMap?.warnings ?? []),
    ...(currentResume?.warnings ?? []),
    ...(currentResume?.missingEvidence.map((item) => `Missing evidence: ${item}`) ?? [])
  ];
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Review notes";
  const list = document.createElement("div");
  list.className = "list compact-list";
  if (!warnings.length) {
    list.textContent = "No review notes yet.";
  } else {
    for (const warning of warnings.slice(0, 20)) {
      list.append(item("Note", warning));
    }
  }
  section.append(heading, list);
  return section;
}

function actionBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "footer-actions";
  const autofill = button("Autofill", "button");
  autofill.disabled = busy || !currentFieldMap;
  autofill.addEventListener("click", () => void autofillPage());

  const action = button(actionButtonLabel(), "button secondary");
  action.disabled = busy || !currentSession;
  action.addEventListener("click", () => void runCurrentAction());

  bar.append(autofill, action);
  return bar;
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

async function startApplication(): Promise<void> {
  try {
    setBusy("Analyzing active tab...");
    currentSnapshot = null;
    currentSession = null;
    currentFieldMap = null;
    currentResume = null;
    currentBid = null;

    const response = await requestRuntime<AnalyzeActiveTabResponse>({
      type: "ANALYZE_ACTIVE_TAB"
    });
    if (!response.snapshot) {
      throw new Error("Analyze response did not include a page snapshot.");
    }
    currentSnapshot = response.snapshot;
    render();

    setBusy("Creating apply session...");
    const sessionResponse = await requestRuntime<{ session: unknown }>({
      type: "CREATE_APPLY_SESSION",
      snapshot: currentSnapshot
    });
    currentSession = parseWithSchema(
      applySessionResponseSchema,
      sessionResponse.session,
      "Apply session"
    );
    render();

    setBusy("Mapping fields...");
    await requestFieldMap();
    if (statusKind !== "error") {
      setReady("Application is ready for review.");
    }
  } catch (error) {
    setFailure(error, "Unable to start application.");
  }
}

async function requestFieldMap(): Promise<void> {
  if (!currentSnapshot || !currentSession) {
    throw new Error("Analyze a page and create a session before requesting a field map.");
  }

  const response = await requestRuntime<{ fieldMap: unknown }>({
    type: "REQUEST_FIELD_MAP",
    sessionId: currentSession.id,
    snapshot: currentSnapshot
  });
  const parsedFieldMap = parseWithSchema(fieldMapSchema, response.fieldMap, "Field map");
  const gate = evaluateFieldMap(parsedFieldMap, currentSnapshot);
  currentFieldMap = gate.pass
    ? parsedFieldMap
    : safeFieldMapForSnapshot(parsedFieldMap, currentSnapshot);
  await highlightCurrentRefs();
  if (!gate.pass) {
    setFailure(
      new Error(`Field map needs review: ${gate.failures.join(" ")}`),
      "Field map needs review."
    );
  }
}

async function generateResume(): Promise<void> {
  if (!currentSession) {
    return;
  }

  try {
    setBusy("Generating resume...");
    const response = await requestRuntime<{ resume: unknown }>({
      type: "GENERATE_RESUME",
      sessionId: currentSession.id
    });
    currentResume = parseWithSchema(generatedResumeSchema, response.resume, "Generated resume");
    setReady("Resume generated. Review the preview before submitting.");
  } catch (error) {
    setFailure(error, "Unable to generate resume.");
  }
}

async function modifyResume(refinementNote: string): Promise<void> {
  if (!currentSession || !currentResume?.id) {
    return;
  }

  try {
    setBusy("Updating resume...");
    const response = await requestRuntime<{ resume: unknown }>({
      type: "MODIFY_RESUME",
      sessionId: currentSession.id,
      resumeVersionId: currentResume.id,
      refinementNote
    });
    currentResume = parseWithSchema(generatedResumeSchema, response.resume, "Modified resume");
    setReady("Resume updated.");
  } catch (error) {
    setFailure(error, "Unable to update resume.");
  }
}

async function autofillPage(): Promise<void> {
  if (!currentFieldMap) {
    return;
  }

  try {
    if (hasResumeField() && !currentResume) {
      await generateResume();
    }
    setBusy("Autofilling fields...");
    const response = await requestRuntime<ApplyFieldMapResponse>({
      type: "APPLY_FIELD_MAP",
      fieldMap: currentFieldMap
    });
    const filled = response.applied.filter((entry) => entry.status === "filled").length;
    setReady(`Autofill completed. Filled ${filled} fields. Review the page before continuing.`);
  } catch (error) {
    setFailure(error, "Unable to autofill page.");
  }
}

async function runCurrentAction(): Promise<void> {
  const buttonRef =
    currentFieldMap?.actions.nextButtonRef ?? currentFieldMap?.actions.submitButtonRef;
  const isSubmit = Boolean(
    currentFieldMap?.actions.submitButtonRef && !currentFieldMap.actions.nextButtonRef
  );
  try {
    if (buttonRef) {
      if (isSubmit && !window.confirm("Submit this application on the job site?")) {
        return;
      }
      setBusy(isSubmit ? "Submitting application..." : "Opening next step...");
      await requestRuntime<ClickActionResponse>({
        type: "CLICK_ACTION",
        buttonRef
      });
      if (!isSubmit) {
        window.setTimeout(() => void startApplication(), 1200);
        return;
      }
    }

    await commitBid();
  } catch (error) {
    setFailure(error, "Unable to run page action.");
  }
}

async function commitBid(): Promise<void> {
  if (!currentSession) {
    return;
  }

  setBusy("Saving bid record...");
  const response = await requestRuntime<{ bid: unknown }>({
    type: "COMMIT_BID",
    sessionId: currentSession.id,
    resumeVersionId: currentResume?.id
  });
  currentBid = parseWithSchema(commitBidResponseSchema, response.bid, "Bid commit");
  setReady(
    currentBid.created
      ? `Saved bid record for ${currentBid.company}.`
      : `Updated existing bid record for ${currentBid.company}.`
  );
}

async function highlightCurrentRefs(): Promise<void> {
  const refs = new Set<string>();
  for (const field of currentFieldMap?.fields ?? []) {
    refs.add(field.elementRef);
  }
  const nextRef = currentFieldMap?.actions.nextButtonRef;
  const submitRef = currentFieldMap?.actions.submitButtonRef;
  if (nextRef) refs.add(nextRef);
  if (submitRef) refs.add(submitRef);
  if (refs.size) {
    await requestRuntime({ type: "HIGHLIGHT_REFS", refs: [...refs].slice(0, 40) });
  }
}

function printResume(): void {
  if (!currentResume) {
    return;
  }
  const printWindow = window.open("", "rghs1-resume-preview");
  if (!printWindow) {
    setReady("Allow popups to open the resume print preview.", "error");
    return;
  }

  printWindow.document.write(
    `<!doctype html><html><head><title>Resume</title><style>body{font-family:Arial,sans-serif;margin:32px;line-height:1.35;color:#111827}h1{font-size:24px}h2{font-size:16px;margin-top:18px}</style></head><body>${currentResume.resumeHtml}</body></html>`
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function hasResumeField(): boolean {
  return Boolean(
    currentFieldMap?.fields.some((field) => field.valueSource === "generated.resumeFile") ||
    currentSnapshot?.fields.some(
      (field) =>
        field.kind === "file" &&
        /\b(resume|cv|curriculum vitae)\b/i.test(field.label || field.name || "")
    )
  );
}

function actionButtonLabel(): string {
  if (currentFieldMap?.actions.nextButtonRef) {
    return "Next";
  }
  if (currentFieldMap?.actions.submitButtonRef) {
    return "Submit";
  }
  return currentBid ? "Saved" : "Save bid";
}

function setBusy(message: string): void {
  busy = true;
  statusMessage = message;
  statusKind = "info";
  render();
}

function setReady(message: string, kind: "info" | "error" = "info"): void {
  busy = false;
  statusMessage = message;
  statusKind = kind;
  render();
}

function setFailure(error: unknown, fallback: string): void {
  busy = false;
  statusMessage = error instanceof Error ? error.message : fallback;
  statusKind = "error";
  render();
  errorStatus(error, fallback);
}

function status(message: string, kind: "info" | "error" = "info"): void {
  const element = document.getElementById("status");
  if (element) {
    setStatus(element, message, kind);
  }
}

function errorStatus(error: unknown, fallback: string): void {
  const element = document.getElementById("status");
  if (element) {
    setErrorStatus(element, error, fallback);
  }
}
