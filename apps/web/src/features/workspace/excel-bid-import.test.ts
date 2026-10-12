import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseBidWorkbook, inferBidCsvMapping } from "./csv-bid-import";

describe("Excel application import", () => {
  it("reads headers, job URLs, rich resumes, cached formula values, and dates from the first worksheet", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Applications");
    sheet.addRow(["Company", "Job title", "Job URL", "Profile", "Date", "Resume", "JD"]);
    sheet.addRow([
      "Acme",
      "Engineer",
      { text: "Apply", hyperlink: "https://example.com/jobs/1" },
      "Liam",
      new Date("2026-10-12T12:00:00Z"),
      { richText: [{ text: "Tailored " }, { text: "resume" }] },
      { formula: '"Cached JD"', result: "Cached JD" }
    ]);
    book.addWorksheet("Other sheet").addRow(["Ignore"]);
    const buffer = await book.xlsx.writeBuffer();
    const parsed = await parseBidWorkbook(buffer);
    expect(parsed.rows).toEqual([
      [
        "Acme",
        "Engineer",
        "https://example.com/jobs/1",
        "Liam",
        "2026-10-12 12:00:00",
        "Tailored resume",
        "Cached JD"
      ]
    ]);
    expect(inferBidCsvMapping(parsed.headers)).toMatchObject({
      company: "Company",
      jobLink: "Job URL",
      jobDescription: "JD"
    });
  });
  it("rejects a workbook without data rows", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Empty").addRow(["Company"]);
    await expect(parseBidWorkbook(await book.xlsx.writeBuffer())).rejects.toThrow(
      "header and data rows"
    );
  });
});
