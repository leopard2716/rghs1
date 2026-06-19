import { z } from "zod";

const richTextMarkSchema = z.object({
  type: z.enum(["bold", "italic"])
});

export type RichTextNode = {
  type: "paragraph" | "heading" | "bulletList" | "orderedList" | "listItem" | "text" | "hardBreak";
  attrs?: {
    level?: 2 | 3;
    [key: string]: unknown;
  };
  marks?: Array<{
    type: "bold" | "italic";
  }>;
  text?: string;
  content?: RichTextNode[];
};

const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "text",
        "hardBreak"
      ]),
      attrs: z
        .object({
          level: z.union([z.literal(2), z.literal(3)]).optional()
        })
        .catchall(z.unknown())
        .optional(),
      marks: z.array(richTextMarkSchema).max(4).optional(),
      text: z.string().max(50000).optional(),
      content: z.array(richTextNodeSchema).max(1000).optional()
    })
    .strict()
    .superRefine((node, context) => {
      if (node.type === "text" && node.text === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: "Rich-text text nodes require text."
        });
      }
      if (node.type !== "text" && node.text !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["text"],
          message: "Only rich-text text nodes can contain text."
        });
      }
      if (node.type === "heading" && node.attrs?.level !== 2 && node.attrs?.level !== 3) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["attrs", "level"],
          message: "Rich-text headings must use level 2 or 3."
        });
      }
    })
);

export const richTextDocumentSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(richTextNodeSchema).max(1000).default([])
  })
  .strict()
  .superRefine((document, context) => {
    const textLength = richTextPlainText(document).length;
    if (textLength > 50000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Rich-text content cannot exceed 50,000 characters."
      });
    }
  });

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>;

export function richTextPlainText(document: RichTextDocument): string {
  return plainTextFromNodes(document.content);
}

export function isRichTextEmpty(document: RichTextDocument): boolean {
  return richTextPlainText(document).trim().length === 0;
}

function plainTextFromNodes(nodes: RichTextNode[] | undefined): string {
  if (!nodes) {
    return "";
  }

  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.text ?? "";
      }
      if (node.type === "hardBreak") {
        return "\n";
      }
      const value = plainTextFromNodes(node.content);
      return node.type === "paragraph" || node.type === "heading" || node.type === "listItem"
        ? `${value}\n`
        : value;
    })
    .join("");
}
