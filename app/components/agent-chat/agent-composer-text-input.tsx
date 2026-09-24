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
  onInputFocus?: () => void;
  onInputPointerDown?: () => void;
  onRemovePreviousContext?: () => boolean;
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
  onInputFocus,
  onInputPointerDown,
  onRemovePreviousContext,
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
        const isComposing = event.isComposing || view.composing;
        if (
          event.key === "Backspace" &&
          !isComposing &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          from === 0 &&
          to === 0 &&
          onRemovePreviousContext?.()
        ) {
          event.preventDefault();
          return true;
        }
        if (
          isAgentContextSlashCommand({
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            isComposing,
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
        if (event.key !== "Enter" || isComposing) return false;
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
      className="group max-h-40 min-h-9 min-w-0 overflow-y-auto px-1 py-1.5 text-sm leading-5"
      data-testid="agent-composer-input-line"
      onPointerDown={(event) => {
        if (event.button !== 0 || !(event.target instanceof Element) || event.target.closest("button")) return;
        onInputPointerDown?.();
        editor?.chain().focus().run();
      }}
    >
      {children}

      {!value && (
        <span
          aria-hidden
          className="pointer-events-none text-muted-foreground group-focus-within:hidden"
          data-testid="agent-composer-placeholder"
        >
          {placeholder}
        </span>
      )}

      <EditorContent className="contents" editor={editor} onFocus={onInputFocus} />
    </div>
  );
}
