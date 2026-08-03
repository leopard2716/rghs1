import {
  elementLabel,
  isVisibleElement,
  normalizeText,
  shouldSkipField,
  stableSelector
} from "./dom-utils";
import {
  pageSnapshotSchema,
  parseWithSchema,
  type ElementSnapshot,
  type PageSnapshot
} from "../shared/schemas";

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
type ButtonElement = HTMLButtonElement | HTMLInputElement | HTMLAnchorElement | HTMLElement;

const fieldSelector = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']"
].join(",");

const buttonSelector = [
  "button",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
  "a[role='button']",
  "[role='button']"
].join(",");

export function extractPageSnapshot(document: Document, pageUrl: string): PageSnapshot {
  const url = new URL(pageUrl);
  const fieldElements = uniqueElements(document.querySelectorAll(fieldSelector)) as FieldElement[];
  const buttonElements = uniqueElements(
    document.querySelectorAll(buttonSelector)
  ) as ButtonElement[];

  const fields = fieldElements
    .filter((element) => shouldIncludeField(element) && !shouldSkipField(element))
    .slice(0, 250)
    .map((element, index) => fieldSnapshot(element, `field-${index + 1}`));
  const buttons = buttonElements
    .filter((element) => isVisibleElement(element))
    .slice(0, 100)
    .map((element, index) => buttonSnapshot(element, `button-${index + 1}`));

  return parseWithSchema(
    pageSnapshotSchema,
    {
      pageUrl: url.href,
      pageOrigin: url.origin,
      pageTitle: normalizeText(document.title, 500),
      capturedAt: new Date().toISOString(),
      visibleText: visiblePageText(document),
      jobContentHtml: jobContentHtml(document),
      htmlSource: sanitizedHtmlSource(document),
      jsonLdJobPostings: jsonLdJobPostings(document),
      fields,
      buttons,
      warnings: []
    },
    "Page snapshot"
  );
}

function jobContentHtml(document: Document): string | undefined {
  const selectors = [
    '[data-automation-id="jobPostingDescription"]',
    '[data-testid="job-description"]',
    '[data-testid*="job-description"]',
    '[itemprop="description"]',
    '#job-description',
    '#jobDescription',
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    'article'
  ];
  const source = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .find((element) => normalizeText(element.textContent ?? "", 1000).length >= 300);
  if (!source) {
    return undefined;
  }

  const clone = source.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return undefined;
  }
  clone
    .querySelectorAll(
      'script,style,noscript,svg,canvas,iframe,object,embed,form,input,textarea,select,button'
    )
    .forEach((element) => element.remove());
  clone.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }
  });

  const html = clone.outerHTML.trim().slice(0, 250000);
  return html || undefined;
}

function shouldIncludeField(element: FieldElement): boolean {
  // Drag-and-drop upload widgets intentionally hide their native file input.
  // The native input is still the only element that can receive a generated
  // resume File, so it must be extracted regardless of visual dimensions.
  if (element instanceof HTMLInputElement && isAlwaysExtractableInputType(element.type)) {
    return true;
  }

  if (isVisibleElement(element)) {
    return true;
  }
  return false;
}

export function isAlwaysExtractableInputType(type: string): boolean {
  return type.toLowerCase() === "file";
}

function fieldSnapshot(element: FieldElement, ref: string): ElementSnapshot {
  const kind = fieldKind(element);
  return {
    ref,
    kind,
    selector: stableSelector(element),
    label: elementLabel(element),
    name: elementName(element),
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
    ariaRole: element.getAttribute("role") ?? undefined,
    placeholder:
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.placeholder || undefined
        : (element.getAttribute("placeholder") ??
          element.getAttribute("data-placeholder") ??
          undefined),
    required: isRequired(element),
    disabled: isDisabled(element),
    readOnly: isReadOnly(element),
    multiple: isMultiple(element),
    checked: isChecked(element),
    value: elementValue(element),
    options: elementOptions(element),
    visibleText: visibleElementText(element)
  };
}

function fieldKind(element: FieldElement): ElementSnapshot["kind"] {
  const role = element.getAttribute("role");
  if (role === "combobox") return "combobox";
  if (role === "listbox") return "listbox";
  if (role === "checkbox") return "checkbox";
  if (role === "radio") return "radio";
  if (role === "switch") return "switch";
  if (role === "textbox") return "contenteditable";

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === "file") return "file";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "date" || type === "month" || type === "week") return "date";
    if (type === "datetime-local") return "datetime";
    if (type === "time") return "time";
    if (type === "number" || type === "range") return "number";
    if (type === "email") return "email";
    if (type === "tel") return "tel";
    if (type === "url") return "url";
  }
  if (element instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (element instanceof HTMLSelectElement) {
    return "select";
  }
  if (element.isContentEditable) {
    return "contenteditable";
  }

  return "input";
}

function buttonSnapshot(element: ButtonElement, ref: string): ElementSnapshot {
  return {
    ref,
    kind: "button",
    selector: stableSelector(element),
    label: elementLabel(element),
    name: elementName(element),
    inputType: element instanceof HTMLInputElement ? element.type : "button",
    ariaRole: element.getAttribute("role") ?? undefined,
    required: false,
    disabled: isDisabled(element),
    options: [],
    visibleText: normalizeText(element.textContent || buttonValue(element) || "", 1000)
  };
}

function uniqueElements(elements: NodeListOf<Element>): Element[] {
  return [...new Set(Array.from(elements))];
}

function buttonValue(element: ButtonElement): string {
  return element instanceof HTMLInputElement ? element.value : "";
}

function elementName(element: Element): string | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLButtonElement
  ) {
    return element.name || undefined;
  }

  return element.getAttribute("name") ?? undefined;
}

function isRequired(element: Element): boolean {
  return (
    ((element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) &&
      element.required) ||
    element.getAttribute("aria-required") === "true"
  );
}

function isDisabled(element: Element): boolean {
  return (
    ((element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement) &&
      element.disabled) ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function isReadOnly(element: Element): boolean | undefined {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.readOnly;
  }

  return element.getAttribute("aria-readonly") === "true" ? true : undefined;
}

function isMultiple(element: Element): boolean | undefined {
  if (element instanceof HTMLSelectElement || element instanceof HTMLInputElement) {
    return element.multiple;
  }

  return element.getAttribute("aria-multiselectable") === "true" ? true : undefined;
}

function isChecked(element: Element): boolean | undefined {
  if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
    return element.checked;
  }

  const checked = element.getAttribute("aria-checked");
  return checked ? checked === "true" : undefined;
}

function elementValue(element: Element): string | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return normalizeText(element.value, 2000) || undefined;
  }

  return (
    normalizeText(
      element.getAttribute("aria-valuetext") ??
        element.getAttribute("aria-value") ??
        element.textContent ??
        "",
      2000
    ) || undefined
  );
}

function elementOptions(element: Element): string[] {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => normalizeText(option.text, 500));
  }

  const role = element.getAttribute("role");
  if (role === "combobox" || role === "listbox") {
    const optionTexts = Array.from(
      element.querySelectorAll("[role='option'], option, li, [data-value]")
    )
      .map((option) => normalizeText(option.textContent ?? "", 500))
      .filter(Boolean);
    return [...new Set(optionTexts)].slice(0, 200);
  }

  if (element instanceof HTMLInputElement && element.list) {
    return Array.from(element.list.options).map((option) =>
      normalizeText(option.label || option.value, 500)
    );
  }

  return [];
}

function visibleElementText(element: Element): string | undefined {
  const text = normalizeText(element.textContent ?? "", 1000);
  return text || undefined;
}

function visiblePageText(document: Document): string {
  const root = document.querySelector("main, article, [role='main']") ?? document.body;
  const chunks: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !isVisibleElement(parent) || shouldSkipTextParent(parent)) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = normalizeText(node.textContent ?? "", 2000);
      return text.length >= 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  while (walker.nextNode() && chunks.join(" ").length < 50000) {
    chunks.push(walker.currentNode.textContent ?? "");
  }

  return normalizeText(chunks.join(" "), 50000);
}

function sanitizedHtmlSource(document: Document): string {
  const clone = document.documentElement.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return "";
  }

  clone
    .querySelectorAll("script, style, noscript, svg, canvas, iframe, object, embed")
    .forEach((element) => element.remove());
  clone.querySelectorAll("input, textarea, select").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const inputType = element instanceof HTMLInputElement ? element.type.toLowerCase() : undefined;
    if (inputType === "password" || inputType === "hidden") {
      element.remove();
      return;
    }

    element.removeAttribute("value");
    if (element instanceof HTMLTextAreaElement) {
      element.textContent = "";
    }
  });
  clone.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (
        /^on/i.test(attribute.name) ||
        attribute.name === "srcdoc" ||
        attribute.name.startsWith("data-")
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  return normalizeText(clone.outerHTML, 100000);
}

function shouldSkipTextParent(element: Element): boolean {
  return Boolean(
    element.closest("script, style, noscript, svg, canvas, iframe, nav, header, footer")
  );
}

function jsonLdJobPostings(document: Document): Array<Record<string, unknown>> {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .flatMap((script) => parseJsonLd(script.textContent ?? ""))
    .filter(isJobPosting)
    .slice(0, 10);
}

function parseJsonLd(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function isJobPosting(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const type = record["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}
