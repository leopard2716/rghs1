const skippedInputTypes = new Set(["hidden", "password", "button", "submit", "reset", "image"]);
const sensitiveNamePattern = /(csrf|token|password|secret|captcha|otp|mfa)/i;
const genericActionLabels = new Set([
  "add",
  "attach",
  "browse",
  "choose",
  "choose file",
  "dropbox",
  "enter manually",
  "manual",
  "select",
  "upload"
]);

export function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    !style ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function shouldSkipField(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement
) {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    const name = `${element.name} ${element.id} ${element.autocomplete}`;
    return skippedInputTypes.has(type) || sensitiveNamePattern.test(name);
  }

  const name = `${element.getAttribute("name") ?? ""} ${element.id} ${
    element.getAttribute("autocomplete") ?? ""
  }`;
  if (sensitiveNamePattern.test(name)) {
    return true;
  }

  return false;
}

export function normalizeText(value: string, limit = 50000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function elementLabel(
  element:
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLButtonElement
    | HTMLElement
): string {
  const directLabels =
    "labels" in element && element.labels
      ? Array.from(element.labels)
          .map((label) => label.textContent ?? "")
          .join(" ")
      : "";
  const aria = ariaLabelText(element);
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : (element.getAttribute("placeholder") ?? element.getAttribute("data-placeholder") ?? "");
  const uploadAction = nearbyUploadActionText(element);
  const nearby = closestLabelText(element);
  const visibleText = element.textContent ?? "";
  const base = normalizeText(
    directLabels ||
      aria ||
      placeholder ||
      uploadAction ||
      nearby ||
      ("name" in element ? element.name : "") ||
      element.id ||
      visibleText ||
      ""
  ).slice(0, 500);
  const uploadContext = uploadAction ? uploadContextLabelText(element, uploadAction) : "";
  const nearbyContext =
    uploadAction && nearby && shouldPrefixContext(uploadAction, nearby)
      ? normalizeContext(nearby)
      : "";
  const context = uploadContext || nearbyContext || contextualLabelText(element, base);

  if (context && shouldPrefixContext(base, context)) {
    return `${context} - ${base || "Field"}`.slice(0, 500);
  }

  return base;
}

function ariaLabelText(element: Element): string {
  const label = element.getAttribute("aria-label");
  if (label) {
    return label;
  }

  const labelledBy = element.getAttribute("aria-labelledby");
  if (!labelledBy) {
    return "";
  }

  return labelledBy
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function closestLabelText(element: Element): string {
  const label = element.closest("label");
  if (label) {
    return label.textContent ?? "";
  }

  const fieldContainer = element.closest("div, section, li, p, fieldset");
  if (!fieldContainer) {
    return "";
  }

  const labelLike = fieldContainer.querySelector(
    "label, legend, [aria-label], .label, [class*='label'], [class*='Label']"
  );
  return labelLike?.textContent ?? labelLike?.getAttribute("aria-label") ?? "";
}

function nearbyUploadActionText(element: Element): string {
  if (!(element instanceof HTMLInputElement) || element.type !== "file") {
    return "";
  }

  const container = closestUploadContainer(element);
  if (!container) {
    return "";
  }

  const candidate = Array.from(container.querySelectorAll("button, [role='button'], label"))
    .filter((item): item is HTMLElement => item instanceof HTMLElement && isVisibleElement(item))
    .sort((left, right) => uploadActionRank(left) - uploadActionRank(right))
    .find((item) =>
      /\b(attach|upload|choose|browse|dropbox|enter manually|manual)\b/i.test(itemText(item))
    );

  return candidate ? itemText(candidate) : "";
}

export function hasNearbyUploadAffordance(element: Element): boolean {
  return Boolean(nearbyUploadActionText(element));
}

function closestUploadContainer(element: Element): Element | null {
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < 5) {
    const text = current.textContent ?? "";
    if (/\b(resume|cv|cover\s+letter|attach|upload|dropbox|file)\b/i.test(text)) {
      return current;
    }
    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function itemText(element: HTMLElement): string {
  return normalizeText(
    `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${
      element instanceof HTMLInputElement ? element.value : ""
    }`,
    120
  );
}

function uploadActionRank(element: HTMLElement): number {
  return element.matches("button, [role='button']") ? 0 : 1;
}

function contextualLabelText(element: Element, baseLabel: string): string {
  const labelText = nearestExplicitHeading(element) || nearestSectionHeading(element);
  const normalized = normalizeContext(labelText);
  if (!normalized || normalizeContext(baseLabel) === normalized) {
    return "";
  }

  return normalized;
}

function uploadContextLabelText(element: Element, uploadAction: string): string {
  if (!(element instanceof HTMLInputElement) || element.type !== "file") {
    return "";
  }

  const action = normalizeContext(uploadAction);
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < 8) {
    const context = uploadContextFromContainer(current, element, action);
    if (context) {
      return context;
    }

    current = current.parentElement;
    depth += 1;
  }

  return "";
}

function uploadContextFromContainer(container: Element, target: Element, action: string): string {
  const children = Array.from(container.children);
  const targetChild = children.find((child) => child === target || child.contains(target));
  const targetIndex = targetChild ? children.indexOf(targetChild) : -1;

  if (targetIndex > 0) {
    for (let index = targetIndex - 1; index >= 0 && index >= targetIndex - 6; index -= 1) {
      const text = uploadLabelCandidateText(children[index], action);
      if (text) {
        return text;
      }
    }
  }

  for (const candidate of Array.from(
    container.querySelectorAll(
      ":scope > label,:scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,:scope > [role='heading'],:scope > .label,:scope > [class*='label'],:scope > [class*='Label']"
    )
  )) {
    if (candidate === target || candidate.contains(target)) {
      continue;
    }

    const text = uploadLabelCandidateText(candidate, action);
    if (text) {
      return text;
    }
  }

  return "";
}

function uploadLabelCandidateText(element: Element | undefined, action: string): string {
  if (!element || (element instanceof HTMLElement && !isVisibleElement(element))) {
    return "";
  }

  const text = normalizeContext(
    element.getAttribute("aria-label") || headingLikeText(element) || element.textContent || ""
  );
  const normalized = normalizeContext(text).toLowerCase();
  if (
    !text ||
    text.length > 100 ||
    normalized === action.toLowerCase() ||
    genericActionLabels.has(normalized) ||
    /\b(accepted file types|pdf|docx?|rtf|txt)\b/i.test(text)
  ) {
    return "";
  }

  return text;
}

function nearestExplicitHeading(element: Element): string {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend?.textContent) {
    return legend.textContent;
  }

  return "";
}

function nearestSectionHeading(element: Element): string {
  let current: Element | null = element;
  let depth = 0;
  while (current?.parentElement && depth < 6) {
    const previous = previousMeaningfulSiblingText(current);
    if (previous) {
      return previous;
    }

    const parentHeading = childHeadingTextBefore(current.parentElement, current);
    if (parentHeading) {
      return parentHeading;
    }

    current = current.parentElement;
    depth += 1;
  }

  return "";
}

function previousMeaningfulSiblingText(element: Element): string {
  let sibling = element.previousElementSibling;
  let checked = 0;
  while (sibling && checked < 6) {
    const text = headingLikeText(sibling);
    if (text) {
      return text;
    }
    sibling = sibling.previousElementSibling;
    checked += 1;
  }

  return "";
}

function childHeadingTextBefore(parent: Element, before: Element): string {
  const children = Array.from(parent.children);
  const beforeIndex = children.indexOf(before);
  if (beforeIndex <= 0) {
    return "";
  }

  for (let index = beforeIndex - 1; index >= 0 && index >= beforeIndex - 6; index -= 1) {
    const child = children[index];
    if (!child) {
      continue;
    }

    const text = headingLikeText(child);
    if (text) {
      return text;
    }
  }

  return "";
}

function headingLikeText(element: Element): string {
  if (element.matches("h1,h2,h3,h4,h5,h6,legend,label")) {
    return element.textContent ?? "";
  }

  if (
    element.matches(
      "[role='heading'], .heading, .title, .field-title, .section-title, .label, [class*='heading'], [class*='Heading'], [class*='title'], [class*='Title'], [class*='label'], [class*='Label']"
    )
  ) {
    return element.textContent ?? "";
  }

  const directHeading = element.querySelector(
    ":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,:scope > legend,:scope > label,:scope > [role='heading']"
  );
  return directHeading?.textContent ?? "";
}

function shouldPrefixContext(baseLabel: string, context: string): boolean {
  const base = normalizeContext(baseLabel);
  if (!base || !context || base.includes(context) || context.includes(base)) {
    return false;
  }

  return genericActionLabels.has(base) || /resume|cover|letter|cv|file|document/i.test(context);
}

function normalizeContext(value: string): string {
  return normalizeText(value, 120)
    .replace(/\s*\*\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableSelector(element: Element): string {
  if (!(element instanceof HTMLElement)) {
    return element.tagName.toLowerCase();
  }

  if (element.id && !looksGenerated(element.id)) {
    return `#${cssEscape(element.id)}`;
  }

  const name = element.getAttribute("name");
  if (name && !looksGenerated(name)) {
    return `${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
  }

  const aria = element.getAttribute("aria-label");
  if (aria) {
    return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`;
  }

  return nthPath(element);
}

function nthPath(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== current.ownerDocument.body && parts.length < 6) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      break;
    }

    const tagName = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (sibling): sibling is HTMLElement =>
        sibling instanceof HTMLElement && sibling.tagName === tagName
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${Math.max(index, 1)})`);
    current = parent;
  }

  return parts.join(" > ") || element.tagName.toLowerCase();
}

function looksGenerated(value: string): boolean {
  return /[a-f0-9]{8,}|[:]/i.test(value) || value.length > 80;
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/#/g, "\\#");
}
