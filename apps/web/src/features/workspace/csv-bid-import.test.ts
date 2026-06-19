import { describe, expect, it } from "vitest";
import {
  inferBidCsvMapping,
  inferProfileResumeHeader,
  parseCsvBidDate,
  plainTextToRichText,
  splitProfileNames
} from "./csv-bid-import";

describe("CSV bid import", () => {
  it("infers common spreadsheet headers", () => {
    expect(inferBidCsvMapping(["Job Title", "Company", "Job Link", "Bidders"])).toMatchObject({
      jobTitle: "Job Title",
      company: "Company",
      jobLink: "Job Link",
      profiles: "Bidders"
    });
  });

  it("infers a separate resume column for each profile", () => {
    const headers = ["Frank Resume", "CV - Joshua", "Company"];

    expect(inferProfileResumeHeader(headers, ["Frank"])).toBe("Frank Resume");
    expect(inferProfileResumeHeader(headers, ["Joshua"])).toBe("CV - Joshua");
  });

  it("splits multiple profile values and removes duplicates", () => {
    expect(splitProfileNames("Joshua; Frank, Joshua")).toEqual(["Joshua", "Frank"]);
  });

  it("uses a manually selected year for month/day-only bid dates", () => {
    const date = parseCsvBidDate("1/26", 2025);

    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(26);
  });

  it("parses full date-only values as local dates", () => {
    const date = parseCsvBidDate("2026-06-18", 2025);

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(18);
  });

  it("converts imported description text to safe rich-text paragraphs", () => {
    expect(plainTextToRichText("About Us\nBuild software.")?.content).toHaveLength(2);
  });
});
