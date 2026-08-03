"use client";

import type { Editor } from "@tiptap/react";
import type { EditorAnchorRect } from "./use-editor-anchor";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { EditorFloatingMenu } from "./editor-floating-menu";

type Chain = ReturnType<Editor["chain"]>;

type Props = {
  editor: Editor;
  anchorRect: EditorAnchorRect | null;
  onClose: () => void;
};

export function TableMenu({ editor, anchorRect, onClose }: Props) {
  const t = useTranslations();

  const actions: { label: string; apply: (chain: Chain) => Chain }[] = [
    { label: t("Editor.tableAddRow"), apply: (c) => c.addRowAfter() },
    { label: t("Editor.tableDeleteRow"), apply: (c) => c.deleteRow() },
    { label: t("Editor.tableAddColumn"), apply: (c) => c.addColumnAfter() },
    { label: t("Editor.tableDeleteColumn"), apply: (c) => c.deleteColumn() },
    { label: t("Editor.tableDelete"), apply: (c) => c.deleteTable() },
  ];

  const runAction = (apply: (chain: Chain) => Chain) => {
    apply(editor.chain().focus()).run();
  };

  return (
    <EditorFloatingMenu
      align="start"
      anchorRect={anchorRect}
      className="flex items-center gap-0.5"
      editorDom={editor.view.dom}
      onClose={onClose}
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          size="sm"
          type="button"
          variant="ghost"
          onClick={(event) => {
            if (event.detail === 0) runAction(action.apply);
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            runAction(action.apply);
          }}
        >
          {action.label}
        </Button>
      ))}
    </EditorFloatingMenu>
  );
}
