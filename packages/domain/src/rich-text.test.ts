import { describe, expect, it } from "vitest";
import { isRichTextEmpty, richTextDocumentSchema, richTextPlainText } from "./rich-text";

describe("rich text documents", () => {
  it("accepts styled paragraphs, headings, and lists", () => {
    const document = richTextDocumentSchema.parse({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "About the job" }]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Build ", marks: [{ type: "bold" }] },
            { type: "text", text: "reliable software." }
          ]
        }
      ]
    });

    expect(richTextPlainText(document)).toContain("About the job");
    expect(isRichTextEmpty(document)).toBe(false);
  });

  it("rejects unsupported headings and empty content detection remains accurate", () => {
    expect(
      richTextDocumentSchema.safeParse({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 } }]
      }).success
    ).toBe(false);
    expect(
      isRichTextEmpty({
        type: "doc",
        content: [{ type: "paragraph" }]
      })
    ).toBe(true);
  });
});
