import {
  extractedJobSchema,
  fieldMapSchema,
  type ExtractedJob,
  type FieldMap,
  type PageSnapshot
} from "./schemas";

export type GateResult = {
  pass: boolean;
  failures: string[];
};

export type ExpectedJob = {
  jobTitle: string;
  company: string;
  requiredSkills?: string[];
};

const minExtractionConfidence = 0.72;
const minAutoFillConfidence = 0.75;

export function evaluateExtractedJob(rawJob: unknown, expected?: ExpectedJob): GateResult {
  const parsed = extractedJobSchema.safeParse(rawJob);
  if (!parsed.success) {
    return {
      pass: false,
      failures: ["Extracted job does not match the required schema."]
    };
  }

  const failures = extractionFailures(parsed.data, expected);
  return {
    pass: failures.length === 0,
    failures
  };
}

export function evaluateFieldMap(rawFieldMap: unknown, snapshot: PageSnapshot): GateResult {
  const parsed = fieldMapSchema.safeParse(rawFieldMap);
  if (!parsed.success) {
    return {
      pass: false,
      failures: ["Field map does not match the required schema."]
    };
  }

  const refs = new Map(snapshot.fields.map((field) => [field.ref, field]));
  const failures: string[] = [];

  for (const field of parsed.data.fields) {
    const pageField = refs.get(field.elementRef);
    if (!pageField) {
      failures.push(`Field map references unknown element ${field.elementRef}.`);
      continue;
    }

    if (!field.requiresUserReview && field.confidence < minAutoFillConfidence) {
      failures.push(`Field ${field.elementRef} is auto-fillable below confidence threshold.`);
    }

    if (field.valueSource === "generated.resumeFile" && pageField.kind !== "file") {
      failures.push(`Field ${field.elementRef} maps a resume file to a non-file input.`);
    }
  }

  if (parsed.data.actions.submitButtonRef && !parsed.data.actions.submitRequiresConfirmation) {
    failures.push("Submit button mapping must require user confirmation.");
  }

  return {
    pass: failures.length === 0,
    failures
  };
}

export function safeFieldMapForSnapshot(fieldMap: FieldMap, snapshot: PageSnapshot): FieldMap {
  const refs = new Set(snapshot.fields.map((field) => field.ref));
  return {
    ...fieldMap,
    fields: fieldMap.fields.map((field) => {
      if (!refs.has(field.elementRef) || field.confidence < minAutoFillConfidence) {
        return {
          ...field,
          requiresUserReview: true
        };
      }

      return field;
    }),
    actions: {
      ...fieldMap.actions,
      submitRequiresConfirmation: true
    }
  };
}

function extractionFailures(job: ExtractedJob, expected?: ExpectedJob): string[] {
  const failures: string[] = [];
  if (job.confidence < minExtractionConfidence) {
    failures.push("Extracted job confidence is below threshold.");
  }

  if (!expected) {
    return failures;
  }

  if (!similar(job.jobTitle, expected.jobTitle)) {
    failures.push(`Expected title similar to "${expected.jobTitle}".`);
  }
  if (!similar(job.company, expected.company)) {
    failures.push(`Expected company similar to "${expected.company}".`);
  }

  const skills = new Set(job.skills.map(normalize));
  for (const skill of expected.requiredSkills ?? []) {
    if (!skills.has(normalize(skill))) {
      failures.push(`Missing required skill "${skill}".`);
    }
  }

  return failures;
}

function similar(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}
