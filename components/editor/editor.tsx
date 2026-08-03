"use client";

import type { EditorView } from "@tiptap/pm/view";
import type { ResolvedPos } from "@tiptap/pm/model";

import { Slice } from "@tiptap/pm/model";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { baseExtensions } from "./editor-extensions";
import { findPastedImageUrl } from "./image-extension";
import { hasMarkdownBlockStructure, parseMarkdownToJSON } from "./editor.utils";

import { BubbleMenu } from "./bubble-menu";
import { type EditorAnchorRect } from "./use-editor-anchor";
import { SlashMenu } from "./slash-menu";
import { TableMenu } from "./table-menu";

import "./editor.scss";

type Props = {
  data?: object;
  onChange?: (data: object) => void;
  readOnly?: boolean;
};

function findEnclosingTableStart($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--)
    if ($pos.node(depth).type.name === "table") return $pos.before(depth);

  return null;
}

export function Editor({ data, onChange, readOnly = false }: Props) {
  const t = useTranslations();
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashAnchorRect, setSlashAnchorRect] = useState<EditorAnchorRect | null>(null);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubbleAnchorRect, setBubbleAnchorRect] = useState<EditorAnchorRect | null>(null);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [tableAnchorRect, setTableAnchorRect] = useState<EditorAnchorRect | null>(null);
  const [tableAnchorPos, setTableAnchorPos] = useState<number | null>(null);
  const isSettingContentRef = useRef(false);

  const showBubbleMenuForSelection = useCallback(
    (view: EditorView) => {
      if (readOnly) return;
      const { from, to } = view.state.selection;
      const hasSelection = from !== to;

      if (hasSelection && !view.state.selection.empty) setShowBubbleMenu(true);
    },
    [readOnly],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      ...baseExtensions,
      Placeholder.configure({
        placeholder: t("Editor.placeholder"),
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

      const showsTableMenu = editor.isActive("table") && !hasSelection;
      setShowTableMenu(showsTableMenu);
      setTableAnchorPos(showsTableMenu ? findEnclosingTableStart(editor.state.selection.$from) : null);
    },
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-base md:prose-sm max-w-none focus:outline-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-blockquote:text-foreground prose-blockquote:border-border prose-ul:text-foreground prose-ol:text-foreground",
      },
      handlePaste: (view, event) => {
        const pastedImageUrl = findPastedImageUrl(event.clipboardData);
        if (pastedImageUrl) {
          const image = view.state.schema.nodes.image.create({ src: pastedImageUrl });
          view.dispatch(view.state.tr.replaceSelectionWith(image));
          return true;
        }

        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;

        try {
          const json = parseMarkdownToJSON(text);
          const hasHtmlFlavour = event.clipboardData?.types.includes("text/html") ?? false;
          if (hasHtmlFlavour && !hasMarkdownBlockStructure(json)) return false;

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
          setSlashAnchorRect({ top: coords.top, left: coords.left, height: coords.bottom - coords.top });
          setShowSlashMenu(true);
          return true;
        }

        if (showSlashMenu && event.key === "Escape") {
          event.preventDefault();
          setShowSlashMenu(false);
          return true;
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
    if (!editor) return;
    if (editor.isEditable === !readOnly) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

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
    if (showBubbleMenu && editor) {
      const { from, to } = editor.state.selection;
      const { view } = editor;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);

      setBubbleAnchorRect({
        top: start.top,
        left: Math.min(start.left, end.left),
        width: Math.abs(end.left - start.left),
        height: end.bottom - start.top,
      });
    }
  }, [showBubbleMenu, showTableMenu, editor]);

  useEffect(() => {
    if (showTableMenu && editor) {
      const { from } = editor.state.selection;
      const domNode = editor.view.domAtPos(from).node;
      const element = domNode instanceof Element ? domNode : domNode.parentElement;
      const tableElement = element?.closest("table");
      const anchor = tableElement ? tableElement.getBoundingClientRect() : editor.view.coordsAtPos(from);

      setTableAnchorRect({
        top: anchor.top,
        left: anchor.left,
        width: "width" in anchor ? anchor.width : 0,
        height: anchor.bottom - anchor.top,
      });
    }
  }, [showTableMenu, tableAnchorPos, editor]);

  if (!editor) return null;

  return (
    <div className="relative min-h-52">
      {showBubbleMenu && !showTableMenu && (
        <BubbleMenu
          anchorRect={bubbleAnchorRect}
          editor={editor}
          open={showBubbleMenu}
          onClose={() => setShowBubbleMenu(false)}
        />
      )}

      {showTableMenu && !readOnly && (
        <TableMenu
          anchorRect={tableAnchorRect}
          editor={editor}
          open={showTableMenu}
          onClose={() => setShowTableMenu(false)}
        />
      )}

      {showSlashMenu && (
        <SlashMenu
          anchorRect={slashAnchorRect}
          editor={editor}
          open={showSlashMenu}
          onClose={() => setShowSlashMenu(false)}
        />
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
