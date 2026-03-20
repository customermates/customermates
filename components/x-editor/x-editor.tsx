"use client";

import type { EditorView } from "@tiptap/pm/view";

import { Slice } from "@tiptap/pm/model";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { baseExtensions } from "./x-editor-extensions";
import { parseMarkdownToJSON } from "./x-editor.utils";
import { calculateMenuPosition } from "./x-editor-positioning.utils";
import { XEditorBubbleMenu } from "./x-editor-bubble-menu";
import { XEditorSlashMenu } from "./x-editor-slash-menu";

import "./x-editor.scss";

type Props = {
  data?: object;
  onChange?: (data: object) => void;
};

export function XEditor({ data, onChange }: Props) {
  const t = useTranslations("Editor");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubbleMenuPosition, setBubbleMenuPosition] = useState({ top: 0, left: 0 });
  const bubbleMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const commandButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const executeCommandRef = useRef<(() => void) | null>(null);
  const isSettingContentRef = useRef(false);

  const showBubbleMenuForSelection = useCallback((view: EditorView) => {
    const { from, to } = view.state.selection;
    const hasSelection = from !== to;

    if (hasSelection && !view.state.selection.empty) setShowBubbleMenu(true);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...baseExtensions,
      Placeholder.configure({
        placeholder: t("placeholder"),
      }),
      Markdown.configure({
        html: false,
      }),
    ],
    content: data,
    onUpdate: ({ editor }) => {
      if (!isSettingContentRef.current) onChange?.(editor.getJSON());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      if (!hasSelection || editor.state.selection.empty) setShowBubbleMenu(false);
    },
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-sm max-w-none focus:outline-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-foreground prose-code:bg-default-100 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-blockquote:text-foreground prose-blockquote:border-default-300 prose-ul:text-foreground prose-ol:text-foreground",
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (!text || event.clipboardData?.types.includes("text/html")) return false;

        try {
          const json = parseMarkdownToJSON(text);
          const doc = view.state.schema.nodeFromJSON(json);
          const slice = new Slice(doc.content, 0, 0);
          view.dispatch(view.state.tr.replaceSelection(slice));
          return true;
        } catch {
          return false;
        }
      },
      handleDOMEvents: {
        mouseup: (view) => {
          showBubbleMenuForSelection(view);
          return false;
        },
        keyup: (view) => {
          showBubbleMenuForSelection(view);
          return false;
        },
      },
      handleKeyDown: (view, event) => {
        if (event.key === "/" && !showSlashMenu) {
          const { selection } = view.state;
          const coords = view.coordsAtPos(selection.from);
          setSlashMenuPosition({ top: coords.top, left: coords.left });
          setShowSlashMenu(true);
          setSelectedCommandIndex(0);
          return false;
        }

        if (showSlashMenu) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedCommandIndex((prev) => (prev < 7 ? prev + 1 : prev));
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : prev));
            return true;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            executeCommandRef.current?.();
            setShowSlashMenu(false);
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setShowSlashMenu(false);
            return true;
          }

          if (event.key.length === 1 || event.key === "Backspace") {
            setShowSlashMenu(false);
            return false;
          }
        }

        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor || data === undefined) return;

    const currentContent = editor.getJSON();
    if (JSON.stringify(currentContent) !== JSON.stringify(data)) {
      isSettingContentRef.current = true;
      editor.commands.setContent(data);
      isSettingContentRef.current = false;
    }
  }, [editor, data]);

  useEffect(() => {
    function handleClickOutside() {
      setShowSlashMenu(false);
    }

    if (showSlashMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showSlashMenu]);

  useEffect(() => {
    function handleGlobalMouseUp() {
      if (editor?.view) {
        setTimeout(() => {
          showBubbleMenuForSelection(editor.view);
        }, 0);
      }
    }

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [editor, showBubbleMenuForSelection]);

  useEffect(() => {
    if (showBubbleMenu && bubbleMenuRef.current && editor) {
      const { from, to } = editor.state.selection;
      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const menuRect = bubbleMenuRef.current.getBoundingClientRect();

      const position = calculateMenuPosition({
        cursorTop: start.top,
        cursorBottom: end.bottom,
        cursorLeft: start.left,
        cursorRight: end.left,
        menuWidth: menuRect.width,
        menuHeight: menuRect.height,
        centered: true,
      });

      setBubbleMenuPosition(position);
    }
  }, [showBubbleMenu, editor]);

  useEffect(() => {
    if (showSlashMenu && slashMenuRef.current && editor) {
      const { selection } = editor.state;
      const coords = editor.view.coordsAtPos(selection.from);
      const menuRect = slashMenuRef.current.getBoundingClientRect();

      const position = calculateMenuPosition({
        cursorTop: coords.top,
        cursorBottom: coords.bottom,
        cursorLeft: coords.left,
        menuWidth: menuRect.width,
        menuHeight: menuRect.height,
      });

      setSlashMenuPosition(position);
    }
  }, [showSlashMenu, editor]);

  useEffect(() => {
    if (showSlashMenu && commandButtonRefs.current[selectedCommandIndex]) {
      commandButtonRefs.current[selectedCommandIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedCommandIndex, showSlashMenu]);

  if (!editor) return null;

  return (
    <div className="relative min-h-52">
      {showBubbleMenu && (
        <XEditorBubbleMenu bubbleMenuRef={bubbleMenuRef} editor={editor} position={bubbleMenuPosition} />
      )}

      {showSlashMenu && (
        <XEditorSlashMenu
          commandButtonRefs={commandButtonRefs}
          editor={editor}
          executeCommandRef={executeCommandRef}
          position={slashMenuPosition}
          selectedCommandIndex={selectedCommandIndex}
          slashMenuRef={slashMenuRef}
          onCommandExecute={() => setShowSlashMenu(false)}
        />
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
