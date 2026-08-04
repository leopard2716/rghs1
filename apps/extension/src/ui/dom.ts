export function appRoot(): HTMLElement {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("App root is missing.");
  }

  return root;
}

export function setStatus(element: HTMLElement, message: string, kind: "info" | "error" = "info") {
  clear(element);
  element.textContent = message;
  element.classList.toggle("error", kind === "error");
}

export function setErrorStatus(element: HTMLElement, error: unknown, fallback: string): void {
  const { details, message } = errorStatus(error, fallback);
  clear(element);
  element.classList.add("error");

  const messageElement = document.createElement("div");
  messageElement.textContent = message;
  element.append(messageElement);

  if (Object.keys(details).length === 0) {
    return;
  }

  const detailsElement = document.createElement("details");
  detailsElement.className = "status-details";
  detailsElement.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Diagnostics";
  const list = document.createElement("dl");
  list.className = "status-detail-list";
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === "") {
      continue;
    }
    const term = document.createElement("dt");
    term.textContent = labelFromKey(key);
    const description = document.createElement("dd");
    description.textContent = formatDetailValue(value);
    list.append(term, description);
  }

  detailsElement.append(summary, list);
  element.append(detailsElement);
}

export function inputValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalInputValue(form: HTMLFormElement, name: string): string | undefined {
  const value = inputValue(form, name);
  return value || undefined;
}

export function clear(element: Element): void {
  while (element.firstChild) {
    element.firstChild.remove();
  }
}

export function item(label: string, value: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "item";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = value || "Not detected";
  container.append(strong, span);
  return container;
}

function errorStatus(
  error: unknown,
  fallback: string
): {
  message: string;
  details: Record<string, unknown>;
} {
  if (!(error instanceof Error)) {
    return {
      message: fallback,
      details: { thrownValue: String(error) }
    };
  }

  const details =
    typeof error === "object" &&
    error !== null &&
    "details" in error &&
    isRecord((error as { details?: unknown }).details)
      ? (error as { details: Record<string, unknown> }).details
      : {};

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;

  return {
    message: error.message || fallback,
    details: {
      code,
      status,
      ...details
    }
  };
}

function labelFromKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function formatDetailValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
