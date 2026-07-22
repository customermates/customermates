"use client";

import type { Editor } from "@tiptap/react";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type Chain = ReturnType<Editor["chain"]>;

type Props = {
  editor: Editor;
  position: { top: number; left: number };
  tableMenuRef: React.RefObject<HTMLDivElement>;
};

export function TableMenu({ editor, position, tableMenuRef }: Props) {
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={tableMenuRef}
      className="fixed z-50 flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ top: position.top, left: position.left }}
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
    </div>,
    document.body,
  );
}
