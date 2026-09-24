"use client";

import type { ReactNode } from "react";

import { Node } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { isAgentContextSlashCommand } from "./agent-context-shortcut";

type Props = {
  children?: ReactNode;
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onContextShortcut: () => void;
  onSubmit: () => void;
};

const InlineDocument = Node.create({
  content: "text*",
  name: "doc",
  topNode: true,
});
const PlainText = Node.create({ group: "inline", name: "text" });

function editorText(doc: {
  content: { size: number };
  textBetween: (...args: [number, number, string, string]) => string;
}) {
  return doc.textBetween(0, doc.content.size, "\n", "\n");
}

function textContent(value: string) {
  return value ? { type: "doc", content: [{ type: "text", text: value }] } : { type: "doc" };
}

export function AgentComposerTextInput({
  children,
  id,
  label,
  placeholder,
  value,
  onChange,
  onContextShortcut,
  onSubmit,
}: Props) {
  const settingContent = useRef(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [InlineDocument, PlainText, UndoRedo],
    content: textContent(value),
    onCreate: ({ editor: current }) => current.commands.setTextSelection(current.state.doc.content.size),
    onUpdate: ({ editor: current }) => {
      if (!settingContent.current) onChange(editorText(current.state.doc));
    },
    editorProps: {
      attributes: {
        id,
        "aria-label": label,
        "aria-multiline": "true",
        "aria-placeholder": placeholder,
        class: "agent-composer-editor inline break-words whitespace-pre-wrap outline-none",
        role: "textbox",
        spellcheck: "true",
      },
      handleKeyDown: (view, event) => {
        const text = editorText(view.state.doc);
        const { from, to } = view.state.selection;
        if (
          isAgentContextSlashCommand({
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            isComposing: event.isComposing,
            key: event.key,
            metaKey: event.metaKey,
            selectionEnd: to,
            selectionStart: from,
            value: text,
          })
        ) {
          event.preventDefault();
          onContextShortcut();
          return true;
        }
        if (event.key !== "Enter" || event.isComposing) return false;
        event.preventDefault();
        if (event.shiftKey) {
          view.dispatch(view.state.tr.insertText("\n"));
          return true;
        }
        onSubmit();
        return true;
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return false;
        event.preventDefault();
        if (text === "") return true;
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor || editorText(editor.state.doc) === value) return;
    settingContent.current = true;
    editor.commands.setContent(textContent(value), { emitUpdate: false });
    editor.commands.setTextSelection(editor.state.doc.content.size);
    settingContent.current = false;
  }, [editor, value]);

  return (
    <div
      className="max-h-40 min-h-9 min-w-0 overflow-y-auto px-1 py-1.5 text-sm leading-5"
      data-testid="agent-composer-input-line"
      onPointerDown={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button")) editor?.chain().focus().run();
      }}
    >
      {children}

      {!value && (
        <span
          aria-hidden
          className="pointer-events-none text-muted-foreground"
          data-testid="agent-composer-placeholder"
        >
          {placeholder}
        </span>
      )}

      <EditorContent className="contents" editor={editor} />
    </div>
  );
}
