"use client";

import type { Editor } from "@tiptap/react";
import type { EditorAnchorRect } from "./use-editor-anchor";

import { Bold, Italic, Strikethrough, Code, Heading1, Heading2, Underline } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { EditorFloatingMenu } from "./editor-floating-menu";
import { LinkPopover } from "./link-popover";

type Props = {
  editor: Editor;
  anchorRect: EditorAnchorRect | null;
  open: boolean;
  onClose: () => void;
};

type FormatAction = {
  icon: React.ComponentType<{ className?: string }>;
  isActive: () => boolean;
  onClick: () => void;
  label: string;
};

export function BubbleMenu({ editor, anchorRect, open, onClose }: Props) {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  const actions: FormatAction[] = [
    {
      icon: Heading1,
      label: "Heading 1",
      isActive: () => editor.isActive("heading", { level: 1 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      icon: Heading2,
      label: "Heading 2",
      isActive: () => editor.isActive("heading", { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: Bold,
      label: "Bold",
      isActive: () => editor.isActive("bold"),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      label: "Italic",
      isActive: () => editor.isActive("italic"),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: Underline,
      label: "Underline",
      isActive: () => editor.isActive("underline"),
      onClick: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      icon: Strikethrough,
      label: "Strikethrough",
      isActive: () => editor.isActive("strike"),
      onClick: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      icon: Code,
      label: "Code",
      isActive: () => editor.isActive("code"),
      onClick: () => editor.chain().focus().toggleCode().run(),
    },
  ];

  return (
    <EditorFloatingMenu
      align="center"
      anchorRect={anchorRect}
      className="flex items-center gap-0.5"
      editorDom={editor.view.dom}
      open={open}
      onClose={onClose}
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          aria-label={action.label}
          className={cn(action.isActive() && "bg-accent text-accent-foreground")}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={(event) => {
            if (event.detail === 0) action.onClick();
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            action.onClick();
          }}
        >
          <action.icon />
        </Button>
      ))}

      <LinkPopover editor={editor} open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen} />
    </EditorFloatingMenu>
  );
}
