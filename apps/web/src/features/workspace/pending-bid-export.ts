import type { PendingBidExportRow } from "../../services/tracking.service";

export async function pendingBidWorkbook(records: PendingBidExportRow[]) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Pending applications");
  sheet.columns = [
    { header: "job title", key: "jobTitle", width: 50 },
    { header: "company", key: "company", width: 32 },
    { header: "link", key: "link", width: 80 }
  ];
  for (const record of records) {
    // Plain strings remain text even when they begin with Excel formula characters.
    const row = sheet.addRow(record);
    if (/^https?:\/\//i.test(record.link)) {
      row.getCell("link").value = { text: record.link, hyperlink: record.link };
      row.getCell("link").font = { color: { argb: "FF0563C1" }, underline: true };
    }
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:C1";
  return workbook.xlsx.writeBuffer();
}

export async function downloadPendingBids(records: PendingBidExportRow[]) {
  const buffer = await pendingBidWorkbook(records);
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pending-applications.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
