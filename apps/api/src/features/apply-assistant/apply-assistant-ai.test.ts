import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createApplyAssistantExtractionProvider,
  createApplyAssistantFieldAutofillProvider,
  createApplyAssistantResumeProvider,
  type ApplyAssistantExtractionProvider
} from "./apply-assistant-ai";
import type { PageSnapshot } from "./apply-assistant.schemas";
import type { TrackingProfileRow } from "../tracking/tracking.types";

const extractedJob = {
  jobTitle: "Senior Engineer",
  company: "ExampleCo",
  requirements: ["TypeScript"],
  responsibilities: ["Build product features"],
  skills: ["TypeScript"],
  jobDescriptionText: "ExampleCo is hiring a Senior Engineer to build product features.",
  confidence: 0.9,
  warnings: []
};

const snapshot: PageSnapshot = {
  pageUrl: "https://jobs.example.com/senior-engineer",
  pageOrigin: "https://jobs.example.com",
  pageTitle: "Senior Engineer - ExampleCo",
  capturedAt: "2026-07-13T12:00:00.000Z",
  visibleText: extractedJob.jobDescriptionText,
  jsonLdJobPostings: [],
  fields: [
    {
      ref: "field-1",
      kind: "input",
      selector: "#first-name",
      label: "First name",
      name: "first_name",
      inputType: "text",
      required: true,
      options: []
    }
  ],
  buttons: [],
  warnings: []
};

type GeminiRequestBody = {
  generationConfig: {
    responseSchema: {
      properties: Record<string, { maxItems?: number }>;
    };
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Gemini apply-assistant extraction", () => {
  it("splits page analysis into parallel job and field schemas", async () => {
    const requestBodies: GeminiRequestBody[] = [];
    const requestUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requestUrls.push(url);
        const body = JSON.parse(String(init?.body)) as GeminiRequestBody;
        requestBodies.push(body);
        const properties = body.generationConfig.responseSchema.properties;
        const output = properties.jobTitle
          ? extractedJob
          : {
              fields: [
                {
                  elementRef: "field-1",
                  valueSource: "profile.firstName",
                  confidence: 0.95
                }
              ],
              actions: {},
              warnings: []
            };
        return geminiResponse(output);
      })
    );

    const provider = geminiProvider();
    const analysis = await provider.analyzePage!({ snapshot, profile: null });

    expect(requestBodies).toHaveLength(2);
    expect(requestUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/models/gemini-2.5-flash-lite:generateContent"),
        expect.stringContaining("/models/gemini-3.5-flash:generateContent")
      ])
    );
    expect(
      requestBodies.some((body) => body.generationConfig.responseSchema.properties.extractedJob)
    ).toBe(false);
    const fieldSchema = requestBodies.find(
      (body) => body.generationConfig.responseSchema.properties.fields
    )?.generationConfig.responseSchema;
    expect(fieldSchema).toBeDefined();
    expect(fieldSchema?.properties.fields?.maxItems).toBeUndefined();
    expect(analysis.extractedJob.company).toBe("ExampleCo");
    expect(analysis.fieldExtractionDraft.fields[0]?.elementRef).toBe("field-1");
  });

  it("retries transient Gemini 503 responses with bounded backoff", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), {
          status: 503
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), {
          status: 503
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), {
          status: 503
        })
      )
      .mockResolvedValueOnce(geminiResponse(extractedJob));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = geminiProvider().extractJob({ snapshot });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/models/gemini-2.5-flash-lite:generateContent"),
      expect.stringContaining("/models/gemini-3.1-flash-lite:generateContent"),
      expect.stringContaining("/models/gemini-3.5-flash:generateContent"),
      expect.stringContaining("/models/gemini-2.5-flash:generateContent")
    ]);
    expect(result.jobTitle).toBe("Senior Engineer");
  });

  it("keeps using the fallback model after the preferred model exceeds quota", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), {
          status: 429
        })
      )
      .mockImplementation(() => Promise.resolve(geminiResponse(extractedJob)));
    vi.stubGlobal("fetch", fetchMock);
    const provider = geminiProvider("gemini-test-quota-primary");

    const firstResultPromise = provider.extractJob({ snapshot });
    await vi.runAllTimersAsync();
    await firstResultPromise;
    await geminiProvider("gemini-test-quota-primary").extractJob({ snapshot });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/models/gemini-test-quota-primary:generateContent"),
      expect.stringContaining("/models/gemini-3.1-flash-lite:generateContent"),
      expect.stringContaining("/models/gemini-3.1-flash-lite:generateContent")
    ]);
  });

  it("does not retry a non-transient Gemini 400 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT" } }), {
        status: 400
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(geminiProvider().extractJob({ snapshot })).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini autofill generation", () => {
  it("routes autofill generation to Gemini by default", async () => {
    let requestUrl = "";
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requestUrl = url;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return geminiResponse({
          fields: [
            {
              elementRef: "field-1",
              valueSource: "profile.firstName",
              value: "Ada",
              confidence: 0.99,
              requiresUserReview: false,
              rationale: "Direct profile match"
            }
          ],
          actions: {},
          warnings: []
        });
      })
    );

    const provider = createApplyAssistantFieldAutofillProvider({
      APPLY_ASSISTANT_FIELD_AUTOFILL_PROVIDER: "openai",
      GEMINI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected Gemini autofill provider.");
    }

    const result = await provider.createFieldMap({
      snapshot,
      profile,
      extractedJob,
      generatedResume: {
        resumeText: "Ada Lovelace\nI build reliable TypeScript products for customers.",
        resumeHtml: "<section>Ada Lovelace</section>",
        changes: ["Tailored experience to the role."],
        missingEvidence: [],
        warnings: [],
        quality: {
          jdCoverage: 0.96,
          fabricationRisk: "low",
          atsReadability: "excellent"
        }
      },
      fieldExtractionDraft: {
        fields: [
          {
            elementRef: "field-1",
            valueSource: "profile.firstName",
            confidence: 0.9
          }
        ],
        actions: {},
        warnings: []
      }
    });

    expect(requestUrl).toContain("models/gemini-3.5-flash:generateContent");
    expect(JSON.stringify(requestBody)).toContain("Autofill job application form fields");
    expect(JSON.stringify(requestBody)).toContain("do not stop after direct contact-field matches");
    expect(JSON.stringify(requestBody)).toContain("sounds human, casual, confident, and direct");
    expect(JSON.stringify(requestBody)).toContain("intelligently synthesize");
    expect(JSON.stringify(requestBody)).toContain("I build reliable TypeScript products");
    expect(result.fields[0]?.value).toBe("Ada");
  });
});

describe("OpenAI resume tailoring", () => {
  it("sends the extracted JD and requested profile evidence through structured outputs", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const generatedResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Software Engineer | ExampleCo</p></div></section>',
      resumeText: "Ada Lovelace\nSoftware Engineer | ExampleCo\nChicago, IL",
      changes: ["Prioritized TypeScript experience for the target role."],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.96,
        fabricationRisk: "low" as const,
        atsReadability: "excellent" as const
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: JSON.stringify(generatedResume) }]
              }
            ]
          }),
          { status: 200 }
        );
      })
    );

    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const result = await provider.generateResume({
      profile,
      extractedJob,
      refinementNote: "Keep it to one page."
    });

    expect(result).toEqual(generatedResume);
    expect(requestBody?.model).toBe("gpt-5.6-sol");
    expect(requestBody?.background).toBe(true);
    expect(requestBody?.reasoning).toEqual({ effort: "medium" });
    expect(requestBody?.text).toMatchObject({
      format: {
        type: "json_schema",
        name: "apply_assistant_resume",
        strict: true
      }
    });

    const prompt = String(requestBody?.input);
    expect(prompt).toContain(extractedJob.jobDescriptionText);
    expect(prompt).toContain("Ada Lovelace");
    expect(prompt).toContain("+1 312 555 0100");
    expect(prompt).toContain("Chicago");
    expect(prompt).toContain("linkedin.com/in/ada");
    expect(prompt).toContain("Analytical Engine University");
    expect(prompt).toContain("ExampleCo");
    expect(prompt).toContain("{{name}}");
    expect(prompt).toContain("Built TypeScript product features.");
    expect(prompt).toContain("Emphasize product engineering.");
    expect(prompt).toContain("Keep it to one page.");
    expect(prompt).toContain("one plain role-focused phrase of 3-6 words");
    expect(prompt).toContain(
      "not 'Principal Cloud Platform Engineer | FinOps and Distributed Systems'"
    );
    expect(prompt).toContain("natural, confident, understated language");
    expect(prompt).toContain("preferably under 22 words");
    expect(prompt).toContain("display every education and employment date as Month YYYY");
    expect(prompt).toContain("May 2025");
    expect(prompt).toContain("TEMPLATE CONTRACT");
    expect(prompt).toContain("TAILORING CONTRACT");
    expect(prompt).toContain("REFINEMENT CONTRACT");
    expect(prompt).toContain("GENERATIVE TAILORING CONTRACT");
    expect(prompt).toContain("at least 0.95 semantic JD coverage");
    expect(prompt).toContain(
      "explicitly authorized to infer and generate plausible responsibilities"
    );
    expect(prompt).toContain("Use missingEvidence only for fixed requirements");
  });

  it("falls back to a supported resume model when a configured model does not exist", async () => {
    const models: string[] = [];
    const generatedResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Software Engineer | ExampleCo</p></div></section>',
      resumeText: "Ada Lovelace\nSoftware Engineer",
      changes: ["Tailored the resume."],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.96,
        fabricationRisk: "low" as const,
        atsReadability: "excellent" as const
      }
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      models.push(body.model);
      if (body.model === "gpt-5.3") {
        return new Response(
          JSON.stringify({
            error: {
              message: "The requested model 'gpt-5.3' does not exist.",
              code: "model_not_found"
            }
          }),
          { status: 400 }
        );
      }
      return openAiResponse(generatedResume);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      APPLY_ASSISTANT_RESUME_MODEL: "gpt-5.3",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const result = await provider.generateResume({ profile, extractedJob });

    expect(models).toEqual(["gpt-5.3", "gpt-5.6-sol"]);
    expect(result.resumeText).toContain("Software Engineer");
  });

  it("retries instead of returning missing-evidence disclaimers in the resume body", async () => {
    vi.useFakeTimers();
    const invalidResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Specific evidence for platform work was not supplied.</p></div></section>',
      resumeText: "Ada Lovelace\nSpecific evidence for platform work was not supplied.",
      changes: [],
      missingEvidence: ["Platform work"],
      warnings: [],
      quality: {
        jdCoverage: 0.4,
        fabricationRisk: "low",
        atsReadability: "fair"
      }
    };
    const validResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Software Engineer | ExampleCo</p></div></section>',
      resumeText: "Ada Lovelace\nSoftware Engineer | ExampleCo",
      changes: ["Kept unsupported platform experience out of the resume."],
      missingEvidence: ["Platform work"],
      warnings: [],
      quality: {
        jdCoverage: 0.96,
        fabricationRisk: "low",
        atsReadability: "good"
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAiResponse(invalidResume))
      .mockResolvedValueOnce(openAiResponse(validResume));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const resultPromise = provider.generateResume({ profile, extractedJob });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.resumeText).toBe(validResume.resumeText);
  });

  it("polls a background OpenAI response until it completes", async () => {
    vi.useFakeTimers();
    const completedResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Software Engineer | ExampleCo</p></div></section>',
      resumeText: "Ada Lovelace\nSoftware Engineer | ExampleCo",
      changes: ["Generated a tailored resume."],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.96,
        fabricationRisk: "low",
        atsReadability: "excellent"
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "resp_resume_1", status: "in_progress" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(openAiResponse(completedResume));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const resultPromise = provider.generateResume({ profile, extractedJob });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;

    expect(result.resumeText).toContain("Software Engineer | ExampleCo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.openai.com/v1/responses/resp_resume_1");
  });

  it("fails a timed-out OpenAI kickoff without repeating the long wait", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const resultPromise = provider.generateResume({ profile, extractedJob });
    const rejection = expect(resultPromise).rejects.toThrow("timed out after 30s");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generates detailed experience from career history when descriptions are empty", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const profileWithoutDescription = {
      ...profile,
      career_experiences: [
        {
          companyName: "ExampleCo",
          jobTitle: "Software Engineer",
          companyLocation: "Chicago, IL",
          dateFrom: "2022-07-01",
          dateTo: null,
          description: ""
        }
      ]
    };
    const generatedResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Software Engineer | ExampleCo</p><ul><li>Built TypeScript services aligned with product requirements.</li></ul></div></section>',
      resumeText:
        "Ada Lovelace\nSoftware Engineer | ExampleCo\nBuilt TypeScript services aligned with product requirements.",
      changes: ["Generated JD-aligned responsibilities from the supplied career history."],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.96,
        fabricationRisk: "low",
        atsReadability: "excellent"
      }
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return openAiResponse(generatedResume);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const result = await provider.generateResume({
      profile: profileWithoutDescription,
      extractedJob
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.resumeText).toContain("Built TypeScript services");
    expect(String(requestBody?.input)).toContain(
      "Career descriptions may be empty; never respond with generic employer summaries"
    );
  });

  it("accepts career facts explicitly confirmed in the refinement note", async () => {
    const confirmedResume = {
      resumeHtml:
        '<section class="resume" style="font-family: Arial"><h1>Ada Lovelace</h1><div class="experience"><p>Staff Engineer | ExampleCo</p></div></section>',
      resumeText: "Ada Lovelace\nStaff Engineer | ExampleCo",
      changes: ["Applied the user-confirmed Staff Engineer title."],
      missingEvidence: [],
      warnings: [],
      quality: {
        jdCoverage: 0.96,
        fabricationRisk: "low",
        atsReadability: "good"
      }
    };
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse(confirmedResume));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createApplyAssistantResumeProvider({
      APPLY_ASSISTANT_RESUME_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key"
    });
    if (!provider) {
      throw new Error("Expected OpenAI resume provider.");
    }

    const result = await provider.generateResume({
      profile: {
        ...profile,
        career_experiences: [
          {
            companyName: "ExampleCo",
            companyLocation: "Chicago, IL",
            dateFrom: "2022-07-01",
            dateTo: null
          }
        ]
      },
      extractedJob,
      refinementNote: "My title at ExampleCo was Staff Engineer."
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.resumeText).toContain("Staff Engineer | ExampleCo");
  });
});

function geminiProvider(model?: string): ApplyAssistantExtractionProvider & {
  analyzePage: NonNullable<ApplyAssistantExtractionProvider["analyzePage"]>;
} {
  const provider = createApplyAssistantExtractionProvider({
    APPLY_ASSISTANT_EXTRACT_PROVIDER: "gemini",
    APPLY_ASSISTANT_EXTRACT_MODEL: model,
    APPLY_ASSISTANT_FIELD_EXTRACT_PROVIDER: "gemini",
    GEMINI_API_KEY: "test-key"
  });
  if (!provider?.analyzePage) {
    throw new Error("Expected Gemini page analysis provider.");
  }
  return provider as ApplyAssistantExtractionProvider & {
    analyzePage: NonNullable<ApplyAssistantExtractionProvider["analyzePage"]>;
  };
}

function geminiResponse(output: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }]
    }),
    { status: 200 }
  );
}

function openAiResponse(output: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "resp_completed",
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(output) }]
        }
      ]
    }),
    { status: 200 }
  );
}

const profile: TrackingProfileRow = {
  id: "10000000-0000-4000-8000-000000000001",
  workspace_id: "10000000-0000-4000-8000-000000000002",
  name: "Ada Lovelace",
  first_name: "Ada",
  middle_name: null,
  last_name: "Lovelace",
  email: "ada@example.com",
  phone_number: "+1 312 555 0100",
  street: "123 Main Street",
  city: "Chicago",
  state: "IL",
  country: "United States",
  postal_code: "60601",
  linkedin_url: "https://www.linkedin.com/in/ada",
  education_university: "Analytical Engine University",
  education_location: "London",
  education_degree: "BSc",
  education_major: "Mathematics",
  education_date_from: "2018-09-01",
  education_date_to: "2022-06-01",
  career_experiences: [
    {
      companyName: "ExampleCo",
      jobTitle: "Software Engineer",
      companyLocation: "Chicago, IL",
      dateFrom: "2022-07-01",
      dateTo: null,
      description: "Built TypeScript product features."
    }
  ],
  resume_html_template:
    '<section class="resume" style="font-family: Arial"><h1>{{name}}</h1><div class="experience">{{experience}}</div></section>',
  resume_tailoring_note: "Emphasize product engineering.",
  created_by_member_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  deleted_at: null
};
