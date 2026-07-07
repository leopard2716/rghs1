import { fieldMapSchema, parseWithSchema, type MappedField } from "../shared/schemas";

const minAutofillConfidence = 0.75;

export type AutofillResult = {
  applied: Array<{ elementRef: string; status: "filled" | "skipped" | "unsupported" }>;
  warnings: string[];
};

export function applyFieldMap(document: Document, rawFieldMap: unknown): AutofillResult {
  const fieldMap = parseWithSchema(fieldMapSchema, rawFieldMap, "Field map");
  const applied = fieldMap.fields.map((field) => applyField(document, field));

  return {
    applied,
    warnings: fieldMap.warnings
  };
}

function applyField(document: Document, field: MappedField): AutofillResult["applied"][number] {
  if (field.requiresUserReview || field.confidence < minAutofillConfidence) {
    return { elementRef: field.elementRef, status: "skipped" };
  }

  const target = document.querySelector(`[data-rghs1-ref="${field.elementRef}"]`);
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      isEditableTextElement(target)
    )
  ) {
    return { elementRef: field.elementRef, status: "unsupported" };
  }

  if (
    (target instanceof HTMLInputElement && (target.type === "file" || target.readOnly)) ||
    (target instanceof HTMLTextAreaElement && target.readOnly) ||
    (target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
      ? target.disabled
      : target.getAttribute("aria-disabled") === "true")
  ) {
    return { elementRef: field.elementRef, status: "unsupported" };
  }

  setValue(target, field.value);
  return { elementRef: field.elementRef, status: "filled" };
}

function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement,
  value: string
): void {
  if (element instanceof HTMLSelectElement) {
    const matching = Array.from(element.options).find(
      (option) =>
        option.value === value || option.text.trim().toLowerCase() === value.trim().toLowerCase()
    );
    element.value = matching?.value ?? value;
  } else if (element instanceof HTMLInputElement && element.type === "checkbox") {
    element.checked = ["true", "yes", "1", "checked"].includes(value.trim().toLowerCase());
  } else if (element instanceof HTMLInputElement && element.type === "radio") {
    element.checked = element.value.trim().toLowerCase() === value.trim().toLowerCase();
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
  } else if (isEditableTextElement(element)) {
    element.textContent = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function isEditableTextElement(element: unknown): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable || element.getAttribute("role") === "textbox")
  );
}
