const styleId = "rghs1-apply-assistant-style";
const layerId = "rghs1-apply-assistant-highlight-layer";
const legacyHighlightClass = "rghs1-apply-assistant-highlight";

type RefTarget = {
  ref: string;
  selector: string;
  kind?: string;
  label?: string;
};

declare global {
  interface Window {
    __rghs1ApplyAssistantHighlightCleanup?: () => void;
  }
}

export function markElementRefs(document: Document, refs: RefTarget[]): void {
  for (const item of refs) {
    const element = safeQuerySelector(document, item.selector);
    if (element instanceof HTMLElement) {
      element.dataset.rghs1Ref = item.ref;
      if (item.kind) {
        element.dataset.rghs1Kind = item.kind;
      }
      if (item.label) {
        element.dataset.rghs1Label = item.label;
      }
    }
  }
}

function safeQuerySelector(document: Document, selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    // Compatibility for snapshots produced before numeric IDs were represented
    // as quoted attribute selectors. `#103` is invalid CSS but still identifies
    // the element unambiguously through the DOM ID API.
    const legacyId = selector.match(/^#([^\s>+~,[\]]+)$/)?.[1];
    return legacyId ? document.getElementById(legacyId) : null;
  }
}

export function highlightRefs(document: Document, refs: string[]): void {
  ensureStyle(document);
  clearHighlights(document);

  const elements = refs
    .map((ref) => document.querySelector(`[data-rghs1-ref="${attrEscape(ref)}"]`))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .map((element) => highlightTarget(element));

  if (!elements.length) {
    return;
  }

  elements[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
  const render = () => renderHighlightLayer(document, elements);
  const schedule = rafThrottle(document, render);
  const view = document.defaultView;
  render();
  view?.requestAnimationFrame(render);
  view?.addEventListener("scroll", schedule, true);
  view?.addEventListener("resize", schedule);
  view?.addEventListener("orientationchange", schedule);
  if (view) {
    view.__rghs1ApplyAssistantHighlightCleanup = () => {
      view.removeEventListener("scroll", schedule, true);
      view.removeEventListener("resize", schedule);
      view.removeEventListener("orientationchange", schedule);
    };
  }
}

export function clearAssistantHighlights(document: Document): void {
  clearHighlights(document);
}

function clearHighlights(document: Document): void {
  document.querySelectorAll(`.${legacyHighlightClass}`).forEach((element) => {
    element.classList.remove(legacyHighlightClass);
  });
  document.getElementById(layerId)?.remove();
  document.defaultView?.__rghs1ApplyAssistantHighlightCleanup?.();
  if (document.defaultView) {
    document.defaultView.__rghs1ApplyAssistantHighlightCleanup = undefined;
  }
}

function renderHighlightLayer(document: Document, elements: HTMLElement[]): void {
  const layer = ensureLayer(document);
  layer.replaceChildren();
  elements.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = `rghs1-apply-assistant-overlay ${overlayClass(element)}`;
    overlay.style.left = `${Math.max(rect.left - 3, 0)}px`;
    overlay.style.top = `${Math.max(rect.top - 3, 0)}px`;
    overlay.style.width = `${Math.max(rect.width + 6, 14)}px`;
    overlay.style.height = `${Math.max(rect.height + 6, 14)}px`;

    const badge = document.createElement("div");
    badge.className = "rghs1-apply-assistant-badge";
    badge.textContent = badgeText(element, index + 1);
    overlay.append(badge);
    layer.append(overlay);
  });
}

function ensureLayer(document: Document): HTMLElement {
  const existing = document.getElementById(layerId);
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const layer = document.createElement("div");
  layer.id = layerId;
  document.documentElement.append(layer);
  return layer;
}

function overlayClass(element: HTMLElement): string {
  const kind = element.dataset.rghs1Kind ?? "";
  if (kind === "button") return "is-button";
  if (kind === "file") return "is-file";
  if (kind === "checkbox" || kind === "radio" || kind === "switch") return "is-choice";
  return "is-field";
}

function highlightTarget(element: HTMLElement): HTMLElement {
  if (element.dataset.rghs1Kind === "file") {
    const uploadButton = visibleUploadControl(closestUploadContainer(element));
    if (uploadButton) {
      copyHighlightData(element, uploadButton);
      return uploadButton;
    }

    const visibleLabel = closestVisibleLabel(element);
    if (visibleLabel) {
      copyHighlightData(element, visibleLabel);
      return visibleLabel;
    }
  }

  if (
    element.dataset.rghs1Kind === "checkbox" ||
    element.dataset.rghs1Kind === "radio" ||
    element.dataset.rghs1Kind === "switch"
  ) {
    const visibleLabel = closestVisibleLabel(element);
    if (visibleLabel) {
      copyHighlightData(element, visibleLabel);
      return visibleLabel;
    }
  }

  return element;
}

function closestVisibleLabel(element: HTMLElement): HTMLElement | null {
  const label = element.closest("label");
  return label instanceof HTMLElement && isVisible(label) ? label : null;
}

function closestUploadContainer(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement;
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

function visibleUploadControl(container: HTMLElement | null): HTMLElement | null {
  if (!container) {
    return null;
  }

  return (
    Array.from(container.querySelectorAll("button, [role='button'], label, input[type='file']"))
      .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
      .find((candidate) => isVisible(candidate) && isUploadAction(candidate)) ?? null
  );
}

function isUploadAction(element: HTMLElement): boolean {
  const text = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${
    element instanceof HTMLInputElement ? element.value : ""
  }`;
  return /\b(attach|upload|choose|browse|dropbox|enter manually|manual)\b/i.test(text);
}

function copyHighlightData(source: HTMLElement, target: HTMLElement): void {
  target.dataset.rghs1Kind = source.dataset.rghs1Kind;
  target.dataset.rghs1Label = source.dataset.rghs1Label;
}

function isVisible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return Boolean(
    style &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function badgeText(element: HTMLElement, index: number): string {
  const kind = element.dataset.rghs1Kind ?? "field";
  const label = element.dataset.rghs1Label?.trim();
  const normalizedKind = kind === "textarea" ? "text" : kind;
  return label
    ? `${index}. ${normalizedKind}: ${label.slice(0, 48)}`
    : `${index}. ${normalizedKind}`;
}

function rafThrottle(document: Document, callback: () => void): () => void {
  let frame = 0;
  return () => {
    const view = document.defaultView;
    if (!view || frame) {
      return;
    }
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      callback();
    });
  };
}

function ensureStyle(document: Document): void {
  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #${layerId} {
      position: fixed !important;
      inset: 0 !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }

    #${layerId} .rghs1-apply-assistant-overlay {
      position: absolute !important;
      box-sizing: border-box !important;
      border: 2px solid #2563eb !important;
      border-radius: 7px !important;
      background: rgba(37, 99, 235, 0.06) !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.88),
        0 10px 24px rgba(15, 23, 42, 0.18),
        0 0 0 6px rgba(37, 99, 235, 0.14) !important;
    }

    #${layerId} .rghs1-apply-assistant-overlay.is-choice {
      border-color: #7c3aed !important;
      background: rgba(124, 58, 237, 0.07) !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.88),
        0 10px 24px rgba(15, 23, 42, 0.18),
        0 0 0 6px rgba(124, 58, 237, 0.14) !important;
    }

    #${layerId} .rghs1-apply-assistant-overlay.is-file {
      border-color: #0891b2 !important;
      background: rgba(8, 145, 178, 0.07) !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.88),
        0 10px 24px rgba(15, 23, 42, 0.18),
        0 0 0 6px rgba(8, 145, 178, 0.14) !important;
    }

    #${layerId} .rghs1-apply-assistant-overlay.is-button {
      border-color: #d97706 !important;
      background: rgba(217, 119, 6, 0.07) !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.88),
        0 10px 24px rgba(15, 23, 42, 0.18),
        0 0 0 6px rgba(217, 119, 6, 0.14) !important;
    }

    #${layerId} .rghs1-apply-assistant-badge {
      position: absolute !important;
      left: -2px !important;
      bottom: calc(100% + 4px) !important;
      max-width: min(340px, 90vw) !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      border: 1px solid rgba(15, 23, 42, 0.12) !important;
      border-radius: 999px !important;
      background: #0f172a !important;
      color: #ffffff !important;
      padding: 4px 8px !important;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.22) !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
    }
  `;
  document.documentElement.append(style);
}

function attrEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
