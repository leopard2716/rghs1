import type { RichTextDocument, RichTextNode } from "@rghs1/domain";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  Undo2
} from "lucide-react";
import { Fragment, type ReactNode, useEffect } from "react";

const editorExtensions = [
  Placeholder.configure({
    placeholder: "Paste or type the full job description"
  }),
  StarterKit.configure({
    heading: {
      levels: [2, 3]
    },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: false,
    underline: false
  })
];

export function RichTextEditor({
  value,
  disabled,
  onChange
}: {
  value: RichTextDocument | null;
  disabled: boolean;
  onChange: (value: RichTextDocument) => void;
}) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: value ?? {
      type: "doc",
      content: [{ type: "paragraph" }]
    },
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as RichTextDocument);
    }
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return <div className="rich-text-editor rich-text-editor-loading" />;
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" aria-label="Job description formatting">
        <ToolbarButton
          label="Paragraph"
          active={editor.isActive("paragraph")}
          disabled={disabled}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          <Pilcrow aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 aria-hidden="true" />
        </ToolbarButton>
        <span className="rich-text-toolbar-divider" />
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          disabled={disabled}
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        >
          <RemoveFormatting aria-hidden="true" />
        </ToolbarButton>
        <span className="rich-text-toolbar-spacer" />
        <ToolbarButton
          label="Undo"
          disabled={disabled || !editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={disabled || !editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 aria-hidden="true" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextContent({ value }: { value: RichTextDocument | string }) {
  if (typeof value === "string") {
    return <LegacyDescription value={value} />;
  }

  return (
    <div className="rich-text-content">
      {value.content.map((node, index) => (
        <RichTextNodeContent node={node} key={`${node.type}-${index}`} />
      ))}
    </div>
  );
}

function ToolbarButton({
  label,
  active = false,
  disabled,
  onClick,
  children
}: {
  label: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={active ? "active" : undefined}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RichTextNodeContent({ node }: { node: RichTextNode }): ReactNode {
  if (node.type === "text") {
    let content: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") {
        content = <strong>{content}</strong>;
      } else if (mark.type === "italic") {
        content = <em>{content}</em>;
      }
    }
    return content;
  }
  if (node.type === "hardBreak") {
    return <br />;
  }

  const children = (node.content ?? []).map((child, index) => (
    <Fragment key={`${child.type}-${index}`}>
      <RichTextNodeContent node={child} />
    </Fragment>
  ));

  if (node.type === "heading") {
    return node.attrs?.level === 2 ? <h2>{children}</h2> : <h3>{children}</h3>;
  }
  if (node.type === "bulletList") {
    return <ul>{children}</ul>;
  }
  if (node.type === "orderedList") {
    return <ol>{children}</ol>;
  }
  if (node.type === "listItem") {
    return <li>{children}</li>;
  }
  return <p>{children}</p>;
}

function LegacyDescription({ value }: { value: string }) {
  return (
    <div className="rich-text-content legacy-description">
      {value
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={`${paragraph}-${index}`}>{paragraph}</p>
        ))}
    </div>
  );
}
