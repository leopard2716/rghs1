import { describe, expect, it } from "vitest";
import { resolvedAutofillValue, resumeFileName, resumePdfBytes } from "../autofill/autofill";
import {
  evaluateExtractedJob,
  evaluateFieldMap,
  safeFieldMapForSnapshot
} from "../shared/quality-gates";
import { extractedJobSchema, fieldMapSchema, generatedResumeSchema } from "../shared/schemas";
import { sampleSnapshot, unsafeFieldMap, validFieldMap, validGeminiExtraction } from "./fixtures";

describe("AI output validation gates", () => {
  it("accepts a schema-valid low-reasoning Gemini extraction when it matches the expected job", () => {
    const schemaResult = extractedJobSchema.safeParse(validGeminiExtraction);
    const gate = evaluateExtractedJob(validGeminiExtraction, {
      jobTitle: "Senior Frontend Engineer",
      company: "ExampleCo",
      requiredSkills: ["React", "TypeScript"]
    });

    expect(schemaResult.success).toBe(true);
    expect(gate).toEqual({ pass: true, failures: [] });
  });

  it("rejects extracted jobs below confidence threshold", () => {
    const gate = evaluateExtractedJob({
      ...validGeminiExtraction,
      confidence: 0.2
    });

    expect(gate.pass).toBe(false);
    expect(gate.failures).toContain("Extracted job confidence is below threshold.");
  });

  it("accepts a field map only when refs, confidence, and submit confirmation are safe", () => {
    const schemaResult = fieldMapSchema.safeParse(validFieldMap);
    const gate = evaluateFieldMap(validFieldMap, sampleSnapshot);

    expect(schemaResult.success).toBe(true);
    expect(gate).toEqual({ pass: true, failures: [] });
  });

  it("blocks unsafe field maps even when they are schema-valid", () => {
    const schemaResult = fieldMapSchema.safeParse(unsafeFieldMap);
    const gate = evaluateFieldMap(unsafeFieldMap, sampleSnapshot);

    expect(schemaResult.success).toBe(true);
    expect(gate.pass).toBe(false);
    expect(gate.failures).toContain("Field map references unknown element field-999.");
    expect(gate.failures).toContain("Field field-1 is auto-fillable below confidence threshold.");
    expect(gate.failures).toContain("Submit button mapping must require user confirmation.");
  });

  it("forces unsafe mapped fields into review mode before autofill", () => {
    const safeMap = safeFieldMapForSnapshot(unsafeFieldMap, sampleSnapshot);

    expect(safeMap.fields.every((field) => field.requiresUserReview)).toBe(true);
    expect(safeMap.actions.submitRequiresConfirmation).toBe(true);
  });

  it("rejects generated resumes with high fabrication risk", () => {
    const result = generatedResumeSchema.safeParse({
      resumeHtml: "<section><h1>Ada Lovelace</h1></section>",
      resumeText: "Ada Lovelace",
      changes: [],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.9,
        fabricationRisk: "critical",
        atsReadability: "good"
      }
    });

    expect(result.success).toBe(false);
  });

  it("uses the generated resume text for mapped paste-resume fields", () => {
    const field = {
      elementRef: "field-resume-text",
      label: "Paste your resume",
      valueSource: "generated.resumeText" as const,
      value: "",
      confidence: 0.55,
      requiresUserReview: true
    };
    const resume = generatedResumeSchema.parse({
      resumeHtml: "<section><h1>Ada Lovelace</h1></section>",
      resumeText: "Ada Lovelace\nSoftware Engineer",
      changes: [],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.9,
        fabricationRisk: "low",
        atsReadability: "good"
      }
    });

    expect(resolvedAutofillValue(field, resume)).toBe(resume.resumeText);
    expect(resolvedAutofillValue(field)).toBeUndefined();
  });

  it("creates a PDF payload for generated resume upload fields", () => {
    const bytes = resumePdfBytes("Ada Lovelace\nSoftware Engineer");
    const pdf = new TextDecoder().decode(bytes);

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Ada Lovelace");
    expect(pdf).toContain("%%EOF");
  });

  it("names the uploaded resume PDF after the candidate", () => {
    const resume = generatedResumeSchema.parse({
      resumeHtml: "<section><h1><span>Noah</span> Hall</h1></section>",
      resumeText: "Noah Hall\nSoftware Engineer",
      changes: [],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.9,
        fabricationRisk: "low",
        atsReadability: "good"
      }
    });

    expect(resumeFileName(resume)).toBe("NoahHallResume.pdf");
  });
});
