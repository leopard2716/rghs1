import "../ui/styles.css";
import { requestRuntime } from "../shared/chrome";
import type { AnalyzeActiveTabResponse, ApplyFieldMapResponse } from "../shared/messages";
import { evaluateFieldMap, safeFieldMapForSnapshot } from "../shared/quality-gates";
import { requireCurrentExtensionProtocol } from "../shared/protocol";
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
let autofillGenerated = false;
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
    statusElement(),
    jobSection(),
    resumeSection(),
    fieldsSection(),
    warningsSection(),
    actionBar()
  );
  status(statusMessage, statusKind);
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

function jobSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Job";
  const extract = button("Extract Current Step", "button secondary compact");
  extract.disabled = busy || !currentSession;
  extract.addEventListener("click", () => void extractCurrentStep());
  const summary = document.createElement("div");
  summary.className = "summary";
  const job = currentSession?.extractedJob;
  if (!currentSnapshot) {
    summary.textContent = "Analyzing the active tab.";
  } else if (!job) {
    summary.append(
      item("Title", "Waiting for AI extraction"),
      item("Company", "Waiting for AI extraction"),
      item("Job link", currentSnapshot.pageUrl),
      item("Description", "Waiting for AI extraction")
    );
  } else {
    summary.append(
      item("Title", job.jobTitle),
      item("Company", job.company),
      item("Job link", currentSnapshot.pageUrl),
      jobDescriptionPreview(job.jobDescriptionText, currentSnapshot.jobContentHtml)
    );
  }
  section.append(heading, extract, summary);
  return section;
}

function jobDescriptionPreview(text: string, html?: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "item job-description-card";
  const label = document.createElement("strong");
  label.textContent = "Description";
  const content = document.createElement("div");
  content.className = "job-description-preview";
  if (html) {
    content.innerHTML = html;
  } else {
    for (const paragraph of text.split(/\n+/).map((value) => value.trim()).filter(Boolean)) {
      const element = document.createElement("p");
      element.textContent = paragraph;
      content.append(element);
    }
  }
  container.append(label, content);
  return container;
}

function fieldsSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Autofill fields";
  const generate = button("Generate Autofill", "button secondary");
  generate.disabled = busy || !currentResume || !currentSession || !currentSnapshot;
  generate.addEventListener("click", () => void requestFieldMap());
  const list = document.createElement("div");
  list.className = "list";

  if (currentFieldMap) {
    for (const field of currentFieldMap.fields) {
      const row = document.createElement("div");
      row.className = "item";
      const label = document.createElement("label");
      label.textContent = `${field.label || "Unlabeled"} (${field.valueSource})`;
      const value = document.createElement(field.value.length > 100 ? "textarea" : "input");
      value.className = "refinement-input";
      value.setAttribute("aria-label", `Autofill value for ${field.label || field.elementRef}`);
      value.value = field.value;
      value.disabled = busy || !autofillGenerated || isGeneratedResumeField(field.valueSource);
      value.addEventListener("change", () => updateAutofillValue(field.elementRef, value.value));
      row.append(label, value);
      list.append(row);
    }
  } else if (currentSnapshot) {
    list.textContent = "Fields will appear after AI analysis.";
  } else {
    list.textContent = "Fields will appear after analysis.";
  }

  const hint = document.createElement("div");
  hint.className = "status";
  hint.textContent = currentResume
    ? "Generate autofill values, then review or edit them before autofilling the page."
    : "Generate and review the tailored resume before generating autofill values.";
  section.append(heading, hint, generate, list);
  return section;
}

function resumeSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const heading = document.createElement("h2");
  heading.textContent = "Resume";

  const actions = document.createElement("div");
  actions.className = "actions";
  const generate = button("Generate Resume", "button secondary");
  generate.disabled = busy || !currentSession;
  generate.addEventListener("click", () => void generateResume());
  const print = button("Print PDF", "button secondary");
  print.disabled = busy || !currentResume;
  print.addEventListener("click", () => printResume());
  actions.append(generate, print);

  const preview = document.createElement("iframe");
  preview.className = "resume-preview";
  preview.setAttribute("sandbox", "");
  preview.srcdoc =
    currentResume?.resumeHtml ?? "<section><p>Generate a resume to preview it.</p></section>";

  const note = document.createElement("input");
  note.className = "refinement-input";
  note.placeholder = "Add factual details or revision instructions, then press Enter";
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

  const targetHint = document.createElement("div");
  targetHint.className = "status";
  targetHint.textContent = hasResumeTarget()
    ? "The tailored resume will be used for detected resume fields during autofill."
    : "No resume field was detected on this step; the tailored resume remains available for review.";

  section.append(heading, targetHint, actions, preview, note);
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
  autofill.disabled = busy || !currentResume || !currentFieldMap || !autofillGenerated;
  autofill.addEventListener("click", () => void autofillPage());
  const saveBid = button(currentBid ? "Bid Saved" : "Save Bid Record", "button secondary");
  saveBid.disabled =
    busy || !currentSession || !currentResume || !autofillGenerated || Boolean(currentBid);
  saveBid.addEventListener("click", () => void commitBid());
  bar.append(autofill, saveBid);
  return bar;
}

function statusElement(): HTMLElement {
  const status = document.createElement("div");
  status.id = "status";
  status.className = "status status-banner";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
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
    autofillGenerated = false;

    const extensionContext = await requestRuntime<unknown>({
      type: "GET_EXTENSION_CONTEXT"
    });
    requireCurrentExtensionProtocol(extensionContext);

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
    acceptCurrentFieldMap(currentSession.fieldMap, "Initial field map");
    render();
    if (currentFieldMap) {
      await highlightCurrentRefs();
    }

    setReady("Generate and review the tailored resume before generating autofill values.");
  } catch (error) {
    setFailure(error, "Unable to start application.");
  }
}

async function requestFieldMap(): Promise<void> {
  if (!currentSnapshot || !currentSession) {
    throw new Error("Analyze a page and create a session before requesting a field map.");
  }

  if (!currentResume) {
    throw new Error("Generate and review the tailored resume before generating autofill values.");
  }

  try {
    setBusy("Generating autofill values...");
    const response = await requestRuntime<{ fieldMap: unknown }>({
      type: "REQUEST_FIELD_MAP",
      sessionId: currentSession.id,
      snapshot: currentSnapshot
    });
    const gate = acceptCurrentFieldMap(response.fieldMap, "Field map");
    autofillGenerated = true;
    await highlightCurrentRefs();
    if (gate && !gate.pass) {
      setReady(`Autofill values generated with review notes: ${gate.failures.join(" ")}`, "error");
      return;
    }
    setReady("Autofill values generated. Review or edit them before autofilling the page.");
  } catch (error) {
    setFailure(error, "Unable to generate autofill values.");
  }
}

async function extractCurrentStep(): Promise<void> {
  if (!currentSession) {
    return;
  }

  try {
    setBusy("Extracting current step...");
    const analyzed = await requestRuntime<AnalyzeActiveTabResponse>({
      type: "ANALYZE_ACTIVE_TAB"
    });
    if (!analyzed.snapshot) {
      throw new Error("Current step analysis did not include a page snapshot.");
    }
    currentSnapshot = analyzed.snapshot;
    currentFieldMap = null;
    autofillGenerated = false;
    currentBid = null;

    const response = await requestRuntime<{ fieldMap: unknown }>({
      type: "EXTRACT_CURRENT_STEP",
      sessionId: currentSession.id,
      snapshot: currentSnapshot
    });
    const gate = acceptCurrentFieldMap(response.fieldMap, "Extracted step field map");
    await highlightCurrentRefs();
    setReady(
      gate && !gate.pass
        ? `Current step extracted with review notes: ${gate.failures.join(" ")}`
        : "Current step extracted. Generate Autofill when you are ready to fill this page.",
      gate && !gate.pass ? "error" : "info"
    );
  } catch (error) {
    setFailure(error, "Unable to extract the current application step.");
  }
}

function acceptCurrentFieldMap(
  rawFieldMap: unknown,
  label: string
): ReturnType<typeof evaluateFieldMap> | null {
  if (!rawFieldMap || !currentSnapshot) {
    return null;
  }

  const parsedFieldMap = parseWithSchema(fieldMapSchema, rawFieldMap, label);
  const gate = evaluateFieldMap(parsedFieldMap, currentSnapshot);
  currentFieldMap = gate.pass
    ? parsedFieldMap
    : safeFieldMapForSnapshot(parsedFieldMap, currentSnapshot);
  return gate;
}

async function generateResume(): Promise<boolean> {
  if (!currentSession) {
    return false;
  }

  try {
    setBusy("Generating resume...");
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      status(`Generating resume... ${elapsedSeconds}s elapsed`);
    }, 5_000);
    try {
      const response = await requestRuntime<{ resume: unknown }>({
        type: "GENERATE_RESUME",
        sessionId: currentSession.id
      });
      currentResume = parseWithSchema(generatedResumeSchema, response.resume, "Generated resume");
      autofillGenerated = false;
      currentBid = null;
      setReady("Tailored resume generated. Review or refine it, then generate autofill values.");
      return true;
    } finally {
      window.clearInterval(progressTimer);
    }
  } catch (error) {
    setFailure(error, "Unable to generate resume.");
    return false;
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
    currentBid = null;
    setReady("Resume refined. Review it before autofilling the page.");
  } catch (error) {
    setFailure(error, "Unable to update resume.");
  }
}

async function autofillPage(): Promise<void> {
  if (!currentFieldMap) {
    return;
  }

  try {
    if (hasResumeTarget() && !currentResume && !(await generateResume())) {
      return;
    }
    setBusy("Autofilling fields...");
    const response = await requestRuntime<ApplyFieldMapResponse>({
      type: "APPLY_FIELD_MAP",
      fieldMap: currentFieldMap,
      ...(currentResume ? { resume: currentResume } : {})
    });
    const filled = response.applied.filter((entry) => entry.status === "filled").length;
    setReady(`Autofill completed. Filled ${filled} fields. Review the page before continuing.`);
  } catch (error) {
    setFailure(error, "Unable to autofill page.");
  }
}

async function commitBid(): Promise<void> {
  if (!currentSession || !currentResume) {
    return;
  }

  try {
    setBusy("Saving bid record...");
    const response = await requestRuntime<{ bid: unknown }>({
      type: "COMMIT_BID",
      sessionId: currentSession.id,
      resumeVersionId: currentResume.id,
      ...(currentFieldMap ? { fieldMap: currentFieldMap } : {})
    });
    if (!response || typeof response !== "object" || !("bid" in response)) {
      throw new Error(
        "The Apply Assistant background worker did not return the saved bid. Reload the extension on chrome://extensions, then try again."
      );
    }
    currentBid = parseWithSchema(commitBidResponseSchema, response.bid, "Bid commit");
    setReady(
      currentBid.created
        ? `Bid record saved for ${currentBid.company}.`
        : `Existing bid record updated for ${currentBid.company}.`
    );
  } catch (error) {
    setFailure(error, "Unable to save the bid record.");
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
    `<!doctype html><html><head><title>Resume</title><style>body{font-family:Arial,sans-serif;margin:32px;line-height:1.35;color:#111827}h1{font-size:24px}h2{font-size:16px;margin-top:18px}@media print{body{margin:0}}</style></head><body>${currentResume.resumeHtml}</body></html>`
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function highlightCurrentRefs(): Promise<void> {
  const refs = new Set<string>();
  for (const field of currentFieldMap?.fields ?? []) {
    refs.add(field.elementRef);
  }
  if (refs.size) {
    await requestRuntime({ type: "HIGHLIGHT_REFS", refs: [...refs] });
  }
}

function hasResumeTarget(): boolean {
  return Boolean(
    currentFieldMap?.fields.some(
      (field) =>
        field.valueSource === "generated.resumeFile" || field.valueSource === "generated.resumeText"
    )
  );
}

function isGeneratedResumeField(valueSource: string): boolean {
  return valueSource === "generated.resumeFile" || valueSource === "generated.resumeText";
}

function updateAutofillValue(elementRef: string, value: string): void {
  if (!currentFieldMap) {
    return;
  }
  currentFieldMap = {
    ...currentFieldMap,
    fields: currentFieldMap.fields.map((field) =>
      field.elementRef === elementRef
        ? { ...field, value, confidence: 1, requiresUserReview: false }
        : field
    )
  };
  setReady("Autofill value updated. Review the remaining values before autofilling.");
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
    if (busy && kind === "info") {
      renderBusyStatus(element, message);
      return;
    }
    element.classList.remove("busy");
    element.removeAttribute("aria-busy");
    setStatus(element, message, kind);
  }
}

function renderBusyStatus(element: HTMLElement, message: string): void {
  const stage = busyStage(message);
  clear(element);
  element.classList.remove("error");
  element.classList.add("busy");
  element.setAttribute("aria-busy", "true");

  const spinner = document.createElement("span");
  spinner.className = "status-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  copy.className = "status-copy";
  const title = document.createElement("strong");
  title.textContent = stage.title;
  const detail = document.createElement("span");
  detail.textContent = stage.detail;
  copy.append(title, detail);
  element.append(spinner, copy);
}

function busyStage(message: string): { title: string; detail: string } {
  const elapsed = message.match(/(\d+)s elapsed/i)?.[1];
  if (/generating resume/i.test(message)) {
    return {
      title: "Tailoring your resume",
      detail: `Writing a concise, job-specific draft${elapsed ? ` · ${elapsed}s` : ""}`
    };
  }
  if (/updating resume/i.test(message)) {
    return {
      title: "Refining your resume",
      detail: "Applying your revision while keeping the content natural and concise"
    };
  }
  if (/generating autofill/i.test(message)) {
    return {
      title: "Creating smart autofill answers",
      detail: "Using your profile, tailored resume, and the job requirements"
    };
  }
  if (/extracting current step/i.test(message)) {
    return {
      title: "Extracting this application step",
      detail: "Detecting the current page fields while keeping the same resume and session"
    };
  }
  if (/autofilling fields/i.test(message)) {
    return {
      title: "Filling the application",
      detail: "Adding reviewed values only — navigation and submission stay manual"
    };
  }
  if (/saving bid record/i.test(message)) {
    return {
      title: "Saving the bid record",
      detail: "Storing the job description, tailored resume, page context, and application details"
    };
  }
  if (/creating apply session/i.test(message)) {
    return {
      title: "Preparing this application",
      detail: "Matching the job page with your selected candidate profile"
    };
  }
  return {
    title: "Reading the job page",
    detail: "Detecting the role, company, requirements, and application fields"
  };
}

function errorStatus(error: unknown, fallback: string): void {
  const element = document.getElementById("status");
  if (element) {
    setErrorStatus(element, error, fallback);
  }
}
