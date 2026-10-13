import { expect, it } from "vitest";
import { Workbook } from "exceljs";
import { pendingBidWorkbook } from "./pending-bid-export";

it("writes exactly the requested columns, clickable URLs and literal text to a valid xlsx", async () => {
  const buffer = await pendingBidWorkbook([
    { jobTitle: "=1+1", company: "Acme & Co", link: "https://example.com/jobs/1" },
    { jobTitle: "Engineer", company: "公司", link: "javascript:alert(1)" }
  ]);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Pending applications")!;
  expect(sheet.getRow(1).values).toEqual([undefined, "job title", "company", "link"]);
  expect(sheet.rowCount).toBe(3);
  expect(sheet.getCell("A2").value).toBe("=1+1");
  expect(sheet.getCell("C2").value).toMatchObject({
    text: "https://example.com/jobs/1",
    hyperlink: "https://example.com/jobs/1"
  });
  expect(sheet.getCell("B3").value).toBe("公司");
  expect(sheet.getCell("C3").value).toBe("javascript:alert(1)");
});
