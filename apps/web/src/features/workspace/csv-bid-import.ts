import type { RichTextDocument } from "@rghs1/domain";
import Papa from "papaparse";
import type { TrackingProfile } from "../../services/tracking.service";

export type CsvBidField =
  | "jobTitle"
  | "company"
  | "jobLink"
  | "bidAt"
  | "profiles"
  | "jobDescription";

export type CsvBidMapping = Record<CsvBidField, string>;

export type CsvTable = {
  headers: string[];
  rows: string[][];
};

const aliases: Record<CsvBidField, string[]> = {
  jobTitle: ["job title", "title", "position", "role"],
  company: ["company", "job company", "employer", "client"],
  jobLink: ["job link", "link", "url", "job url"],
  bidAt: ["bid date", "date", "datetime", "applied at", "applied date"],
  profiles: ["profiles", "profile", "bidders", "bidder"],
  jobDescription: ["job description", "description", "jd"]
};

export async function parseBidCsv(file: File): Promise<CsvTable> {
  if (!file.name.toLocaleLowerCase().endsWith(".csv")) {
    throw new Error("Choose a CSV file.");
  }
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      worker: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        if (result.errors.length) {
          reject(new Error(result.errors[0]?.message ?? "CSV parsing failed."));
          return;
        }
        const [headerRow, ...rows] = result.data;
        const headers = (headerRow ?? []).map(
          (value, index) => String(value).trim() || `Column ${index + 1}`
        );
        if (!headers.length || !rows.length) {
          reject(new Error("The CSV must contain a header and at least one data row."));
          return;
        }
        resolve({
          headers,
          rows: rows.map((row) => headers.map((_, index) => String(row[index] ?? "").trim()))
        });
      },
      error: (error) => reject(error)
    });
  });
}

export function inferBidCsvMapping(headers: string[]): CsvBidMapping {
  return {
    jobTitle: inferHeader(headers, aliases.jobTitle),
    company: inferHeader(headers, aliases.company),
    jobLink: inferHeader(headers, aliases.jobLink),
    bidAt: inferHeader(headers, aliases.bidAt),
    profiles: inferHeader(headers, aliases.profiles),
    jobDescription: inferHeader(headers, aliases.jobDescription)
  };
}

export function inferProfileResumeHeader(headers: string[], profileNames: string[]): string {
  const normalizedNames = profileNames.map(normalizeHeader).filter(Boolean);
  const candidates = headers
    .map((header) => ({ header, normalized: normalizeHeader(header) }))
    .filter(({ normalized }) => normalized.includes("resume") || normalized.includes("cv"));

  for (const name of normalizedNames) {
    const exact = candidates.find(
      ({ normalized }) =>
        normalized === `${name} resume` ||
        normalized === `resume ${name}` ||
        normalized === `${name} cv` ||
        normalized === `cv ${name}`
    );
    if (exact) {
      return exact.header;
    }
  }
  for (const name of normalizedNames) {
    const partial = candidates.find(({ normalized }) => normalized.includes(name));
    if (partial) {
      return partial.header;
    }
  }
  return "";
}

export function csvValue(table: CsvTable, row: string[], header: string): string {
  if (!header) {
    return "";
  }
  const index = table.headers.indexOf(header);
  return index < 0 ? "" : (row[index] ?? "");
}

export function splitProfileNames(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

export function matchingProfile(
  name: string,
  profiles: TrackingProfile[]
): TrackingProfile | undefined {
  const normalized = normalizeProfileName(name);
  return profiles.find((profile) => normalizeProfileName(profile.name) === normalized);
}

export function normalizeProfileName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function parseCsvBidDate(
  value: string,
  yearForYearlessDate: number,
  fallback = new Date()
): Date {
  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  const yearless = normalized.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (yearless) {
    return checkedLocalDate(yearForYearlessDate, Number(yearless[1]), Number(yearless[2]));
  }

  const yearFirst = normalized.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (yearFirst) {
    return checkedLocalDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }

  const yearLast = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (yearLast) {
    const parsedYear = Number(yearLast[3]);
    return checkedLocalDate(
      parsedYear < 100 ? 2000 + parsedYear : parsedYear,
      Number(yearLast[1]),
      Number(yearLast[2])
    );
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid CSV bid date.");
  }
  return parsed;
}

export function plainTextToRichText(value: string): RichTextDocument | undefined {
  const paragraphs = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!paragraphs.length) {
    return undefined;
  }
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }]
    }))
  };
}

function checkedLocalDate(year: number, month: number, day: number): Date {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error("Invalid CSV bid date.");
  }
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Invalid CSV bid date.");
  }
  return date;
}

function inferHeader(headers: string[], candidates: string[]): string {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  for (const candidate of candidates) {
    const exactIndex = normalizedHeaders.indexOf(candidate);
    if (exactIndex >= 0) {
      return headers[exactIndex] ?? "";
    }
  }
  for (const candidate of candidates) {
    const partialIndex = normalizedHeaders.findIndex(
      (header) => header.includes(candidate) || candidate.includes(header)
    );
    if (partialIndex >= 0) {
      return headers[partialIndex] ?? "";
    }
  }
  return "";
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
