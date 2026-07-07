import { describe, expect, it } from "vitest";
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
});
