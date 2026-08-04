import {
  fieldMapSchema,
  generatedResumeSchema,
  parseWithSchema,
  type GeneratedResume,
  type MappedField
} from "../shared/schemas";

const minAutofillConfidence = 0.75;

export type AutofillResult = {
  applied: Array<{ elementRef: string; status: "filled" | "skipped" | "unsupported" }>;
  warnings: string[];
};

export function applyFieldMap(
  document: Document,
  rawFieldMap: unknown,
  rawResume?: unknown
): AutofillResult {
  const fieldMap = parseWithSchema(fieldMapSchema, rawFieldMap, "Field map");
  const resume = rawResume
    ? parseWithSchema(generatedResumeSchema, rawResume, "Generated resume")
    : undefined;
  const applied = fieldMap.fields.map((field) => applyField(document, field, resume));

  return {
    applied,
    warnings: fieldMap.warnings
  };
}

function applyField(
  document: Document,
  field: MappedField,
  resume?: GeneratedResume
): AutofillResult["applied"][number] {
  const isApprovedGeneratedResumeText =
    (field.valueSource === "generated.resumeText" ||
      field.valueSource === "generated.resumeFile") &&
    Boolean(resume);
  if (
    !isApprovedGeneratedResumeText &&
    (field.requiresUserReview || field.confidence < minAutofillConfidence)
  ) {
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
    target instanceof HTMLInputElement &&
    target.type === "file" &&
    field.valueSource === "generated.resumeFile" &&
    resume
  ) {
    setResumeFile(target, resume);
    return { elementRef: field.elementRef, status: "filled" };
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

  const value = resolvedAutofillValue(field, resume);
  if (!value) {
    return { elementRef: field.elementRef, status: "skipped" };
  }

  setValue(target, value);
  return { elementRef: field.elementRef, status: "filled" };
}

function setResumeFile(input: HTMLInputElement, resume: GeneratedResume): void {
  const bytes = resumePdfBytes(resume.resumeText);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const file = new File([buffer], resumeFileName(resume), {
    type: "application/pdf",
    lastModified: Date.now()
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function resumeFileName(resume: GeneratedResume): string {
  const heading = resume.resumeHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const rawName =
    (heading ? stripHtml(heading) : firstResumeLine(resume.resumeText)) || "Candidate";
  const compactName = rawName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&(?:amp|#38);/gi, "And")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join("");
  return `${compactName || "Candidate"}Resume.pdf`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
}

function firstResumeLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

export function resumePdfBytes(resumeText: string): Uint8Array {
  const lines = wrapPdfText(resumeText);
  const pages = chunk(lines.length ? lines : ["Tailored resume"], 48);
  const objects: string[] = [];
  const pageObjectIds = pages.map((_page, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index]!;
    const contentId = pageId + 1;
    const stream = [
      "BT /F1 10 Tf 54 740 Td 13 TL",
      ...page.map((line) => `(${escapePdfText(line)}) Tj T*`),
      "ET"
    ].join("\n");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function wrapPdfText(value: string): string[] {
  const output: string[] = [];
  for (const rawLine of value.replace(/\r/g, "").split("\n")) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (line && `${line} ${word}`.length > 92) {
        output.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    output.push(line);
  }
  return output;
}

function escapePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/([\\()])/g, "\\$1");
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function resolvedAutofillValue(
  field: MappedField,
  resume?: GeneratedResume
): string | undefined {
  return field.valueSource === "generated.resumeText" ? resume?.resumeText : field.value;
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
