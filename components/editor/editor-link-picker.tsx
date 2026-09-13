"use client";

import { createContext, type ComponentType } from "react";
import type { Editor } from "@tiptap/react";

export type EditorLinkPickerProps = {
  onSelect: (link: { href: string; title: string }) => void;
};

export const EditorLinkPickerContext = createContext<ComponentType<EditorLinkPickerProps> | null>(null);

export function insertEditorLink(editor: Editor, { href, title }: { href: string; title: string }) {
  const chain = editor.chain().focus();
  if (editor.state.selection.empty && !editor.isActive("link")) {
    chain
      .insertContent({
        type: "text",
        text: title,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run();
  } else chain.extendMarkRange("link").setLink({ href }).run();
}
