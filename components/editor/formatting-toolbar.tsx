"use client";

import type { Editor } from "@tiptap/react";
import type { ComponentType, MouseEvent } from "react";

import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { LinkPopover } from "./link-popover";

const HEADING_LEVELS = [1, 2, 3] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];
const HEADING_ICONS: Record<
  HeadingLevel,
  ComponentType<{ className?: string }>
> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
};

type Props = {
  editor: Editor;
  disabled?: boolean;
  className?: string;
  normalizeLinkUrl?: (url: string) => string | null;
};

type Action = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  run: () => void;
};

function currentHeadingLevel(editor: Editor): HeadingLevel | null {
  return (
    HEADING_LEVELS.find((level) => editor.isActive("heading", { level })) ??
    null
  );
}

export function cycleHeading(editor: Editor) {
  const level = currentHeadingLevel(editor);
  const chain = editor.chain().focus();
  if (level === 3) chain.setParagraph().run();
  else
    chain
      .setHeading({ level: level ? ((level + 1) as HeadingLevel) : 1 })
      .run();
}

export function FormattingToolbar({
  editor,
  disabled = false,
  className,
  normalizeLinkUrl,
}: Props) {
  const t = useTranslations();
  const [linkOpen, setLinkOpen] = useState(false);
  const supportsHeading = Boolean(editor.schema.nodes.heading);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: supportsHeading ? currentHeadingLevel(current) : null,
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
    }),
  });

  const toggles: Action[] = [
    {
      key: "bold",
      label: t("Editor.bold"),
      icon: Bold,
      active: state.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: t("Editor.italic"),
      icon: Italic,
      active: state.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: "strike",
      label: t("Editor.strikethrough"),
      icon: Strikethrough,
      active: state.strike,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: "bulletList",
      label: t("Editor.bulletList"),
      icon: List,
      active: state.bulletList,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: t("Editor.numberedList"),
      icon: ListOrdered,
      active: state.orderedList,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "blockquote",
      label: t("Editor.blockQuote"),
      icon: Quote,
      active: state.blockquote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];
  const heading: Action | null = supportsHeading
    ? {
        key: "heading",
        label: t("Editor.heading"),
        icon: state.heading ? HEADING_ICONS[state.heading] : Heading,
        active: state.heading !== null,
        run: () => cycleHeading(editor),
      }
    : null;
  const divider: Action = {
    key: "divider",
    label: t("Editor.divider"),
    icon: Minus,
    run: () => editor.chain().focus().setHorizontalRule().run(),
  };

  const renderButton = (action: Action) => (
    <Button
      key={action.key}
      aria-label={action.label}
      aria-pressed={action.active}
      className={cn(action.active && "bg-accent text-accent-foreground")}
      data-heading-level={
        action.key === "heading" ? (state.heading ?? 0) : undefined
      }
      disabled={disabled}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={(event: MouseEvent) => {
        if (event.detail === 0) action.run();
      }}
      onMouseDown={(event: MouseEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        action.run();
      }}
    >
      <action.icon />
    </Button>
  );

  return (
    <div
      data-formatting-toolbar
      aria-label={t("Editor.formatting")}
      className={cn(
        "border-border flex flex-wrap items-center gap-0.5 border-b p-1",
        className,
      )}
      role="toolbar"
    >
      {heading && renderButton(heading)}

      {toggles.map(renderButton)}

      <LinkPopover
        disabled={disabled}
        editor={editor}
        normalizeUrl={normalizeLinkUrl}
        open={linkOpen}
        onOpenChange={setLinkOpen}
      />

      {renderButton(divider)}
    </div>
  );
}
