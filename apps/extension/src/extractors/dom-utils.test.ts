import { describe, expect, it } from "vitest";
import { idSelector, semanticUploadFieldName } from "./dom-utils";

describe("stable DOM selectors", () => {
  it("uses a valid quoted attribute selector for numeric IDs", () => {
    expect(idSelector("103")).toBe('[id="103"]');
  });

  it("escapes quotes and backslashes inside ID attributes", () => {
    expect(idSelector('field"path\\name')).toBe('[id="field\\"path\\\\name"]');
  });
});

describe("upload field identity", () => {
  it("uses the surrounding document purpose instead of the upload action", () => {
    expect(
      semanticUploadFieldName(
        "Please attach your resume here and let us populate your application. Drop file here or Select file"
      )
    ).toBe("Resume/CV");
    expect(semanticUploadFieldName("Upload your cover letter Choose file")).toBe("Cover Letter");
  });

  it("does not treat generic file help as a semantic field name", () => {
    expect(
      semanticUploadFieldName("Select file. Accepted DOC, DOCX, HTML, PDF, or TXT files")
    ).toBe("");
  });
});
