import "../ui/styles.css";
import { chromeApi, requestRuntime } from "../shared/chrome";
import { type AnalyzeActiveTabResponse } from "../shared/messages";
import { type ApplyAssistantSettings } from "../shared/schemas";
import { connectExtensionTokenSettings, refreshSettingsContext } from "../storage/connection";
import { getSettings } from "../storage/settings";
import { appRoot, clear, inputValue, setErrorStatus, setStatus } from "../ui/dom";

let showSettings = false;

render().catch((error: unknown) => {
  appRoot().textContent = error instanceof Error ? error.message : "Popup failed to load.";
});

async function render(
  initialStatus?: string,
  settingsOverride?: ApplyAssistantSettings
): Promise<void> {
  const root = appRoot();
  root.className = "shell";
  clear(root);

  const settings = settingsOverride ?? (await loadSettings());
  root.append(header(settings));
  if (!isConnected(settings)) {
    root.append(connectSection(settings, initialStatus));
    return;
  }

  root.append(accountSection(settings, initialStatus));
  if (showSettings) {
    root.append(settingsSection(settings, initialStatus));
  }
  root.append(actionsSection());
}

async function loadSettings(): Promise<ApplyAssistantSettings> {
  return getSettings();
}

function isConnected(settings: ApplyAssistantSettings): boolean {
  return Boolean(settings.extensionToken && settings.workspaceSlug && settings.memberId);
}

function header(settings: ApplyAssistantSettings): HTMLElement {
  const container = document.createElement("div");
  container.className = "header";
  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = "RGHS1 Apply Assistant";
  container.append(title);

  if (isConnected(settings)) {
    const button = document.createElement("button");
    button.className = "button secondary compact";
    button.type = "button";
    button.textContent = showSettings ? "Done" : "Settings";
    button.addEventListener("click", () => {
      showSettings = !showSettings;
      void render();
    });
    container.append(button);
  }

  return container;
}

function connectSection(settings: ApplyAssistantSettings, initialStatus?: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";

  const heading = document.createElement("h2");
  heading.textContent = "Connect";
  const form = document.createElement("form");
  form.id = "connect-form";
  form.append(field("Extension token", "extensionToken", "Paste token from RGHS1"));

  const status = document.createElement("div");
  status.id = "connect-status";
  status.className = "status";
  if (initialStatus) {
    setStatus(status, initialStatus);
  }

  const button = document.createElement("button");
  button.className = "button";
  button.type = "submit";
  button.textContent = "Next";

  form.append(button, status);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void connectExtension(form, status, settings.apiBaseUrl);
  });

  section.append(heading, form);
  return section;
}

function accountSection(settings: ApplyAssistantSettings, initialStatus?: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";

  const heading = document.createElement("h2");
  heading.textContent = "Connected account";
  const summary = document.createElement("div");
  summary.className = "summary";
  summary.append(
    summaryRow("Workspace", settings.workspaceName ?? settings.workspaceSlug ?? "Connected"),
    summaryRow("User", settings.memberDisplayName ?? settings.memberEmail ?? "Connected"),
    summaryRow("Profile", optionLabel(settings.profiles, settings.profileId) ?? "Not selected"),
    summaryRow(
      "Job market",
      optionLabel(settings.jobMarkets, settings.jobMarketId) ?? "Not selected"
    ),
    summaryRow("Token expires", formatDate(settings.tokenExpiresAt))
  );

  const actions = document.createElement("div");
  actions.className = "actions";
  const refresh = document.createElement("button");
  refresh.className = "button secondary";
  refresh.type = "button";
  refresh.textContent = "Refresh";
  const status = document.createElement("div");
  status.className = "status";
  if (initialStatus) {
    setStatus(status, initialStatus);
  }
  refresh.addEventListener("click", () => void refreshContext(status));
  actions.append(refresh);

  section.append(heading, summary, actions, status);
  return section;
}

function settingsSection(settings: ApplyAssistantSettings, initialStatus?: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";

  const heading = document.createElement("h2");
  heading.textContent = "Settings";
  const form = document.createElement("form");
  form.id = "settings-form";
  form.append(
    field("Extension token", "extensionToken", "Paste token from RGHS1", settings.extensionToken)
  );

  const status = document.createElement("div");
  status.id = "settings-status";
  status.className = "status";
  if (initialStatus) {
    setStatus(status, initialStatus);
  }

  const button = document.createElement("button");
  button.className = "button";
  button.type = "submit";
  button.textContent = "Save";

  form.append(button, status);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSettings(form, status);
  });

  section.append(heading, form);
  return section;
}

function actionsSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";

  const heading = document.createElement("h2");
  heading.textContent = "Active page";
  const actions = document.createElement("div");
  actions.className = "actions";
  const analyze = document.createElement("button");
  analyze.className = "button";
  analyze.type = "button";
  analyze.textContent = "Analyze tab";
  const openPanel = document.createElement("button");
  openPanel.className = "button secondary";
  openPanel.type = "button";
  openPanel.textContent = "Open panel";
  const status = document.createElement("div");
  status.id = "action-status";
  status.className = "status";

  analyze.addEventListener("click", () => void analyzeTab(status));
  openPanel.addEventListener("click", () => void openSidePanel(status));

  actions.append(analyze, openPanel);
  section.append(heading, actions, status);
  return section;
}

function field(label: string, name: string, placeholder: string, value = ""): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.value = value;
  if (name === "extensionToken") {
    input.type = "password";
  }
  wrapper.append(text, input);
  return wrapper;
}

function summaryRow(label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "summary-row";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = value;
  row.append(strong, span);
  return row;
}

async function connectExtension(
  form: HTMLFormElement,
  status: HTMLElement,
  apiBaseUrl: string
): Promise<void> {
  try {
    setStatus(status, "Connecting...");
    const settings = await connectExtensionTokenSettings(
      inputValue(form, "extensionToken"),
      apiBaseUrl
    );
    showSettings = false;
    await render("Connected.", settings);
  } catch (error) {
    setErrorStatus(status, error, "Unable to connect.");
  }
}

async function saveSettings(form: HTMLFormElement, status: HTMLElement): Promise<void> {
  try {
    setStatus(status, "Saving...");
    const settings = await connectExtensionTokenSettings(inputValue(form, "extensionToken"));
    await render("Saved.", settings);
  } catch (error) {
    setErrorStatus(status, error, "Unable to save settings.");
  }
}

async function refreshContext(status: HTMLElement): Promise<void> {
  try {
    setStatus(status, "Refreshing...");
    const settings = await refreshSettingsContext();
    await render("Refreshed.", settings);
  } catch (error) {
    setErrorStatus(status, error, "Unable to refresh.");
  }
}

async function analyzeTab(status: HTMLElement): Promise<void> {
  try {
    setStatus(status, "Analyzing active tab...");
    const response = await requestRuntime<AnalyzeActiveTabResponse>({
      type: "ANALYZE_ACTIVE_TAB"
    });
    if (!response.snapshot) {
      throw new Error("Analyze response did not include a page snapshot.");
    }
    setStatus(
      status,
      `Captured ${response.snapshot.fields.length} fields and ${response.snapshot.buttons.length} buttons.`
    );
  } catch (error) {
    setErrorStatus(status, error, "Unable to analyze tab.");
  }
}

async function openSidePanel(status: HTMLElement): Promise<void> {
  try {
    const [tab] = await chromeApi().tabs.query({ active: true, currentWindow: true });
    await chromeApi().sidePanel?.open({ tabId: tab?.id, windowId: tab?.windowId });
    setStatus(status, "Panel opened.");
  } catch (error) {
    setErrorStatus(status, error, "Unable to open panel.");
  }
}

function optionLabel(
  options: Array<{ id: string; name: string }>,
  selectedId: string | undefined
): string | undefined {
  return options.find((option) => option.id === selectedId)?.name;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
