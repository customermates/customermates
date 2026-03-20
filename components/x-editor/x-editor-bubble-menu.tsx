"use client";

import type { Editor } from "@tiptap/react";

import { Button, ButtonGroup } from "@heroui/button";
import { BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, H1Icon, H2Icon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { XIcon } from "../x-icon";

import { XEditorLinkPopover } from "./x-editor-link-popover";

type Props = {
  editor: Editor;
  position: { top: number; left: number };
  bubbleMenuRef: React.RefObject<HTMLDivElement>;
};

export function XEditorBubbleMenu({ editor, position, bubbleMenuRef }: Props) {
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  return (
    <div
      ref={bubbleMenuRef}
      className="fixed z-50 bg-content1 shadow-medium rounded-large p-1"
      style={{ top: position.top, left: position.left }}
    >
      <ButtonGroup size="sm" variant="flat">
        <Button
          isIconOnly
          color={editor.isActive("heading", { level: 1 }) ? "primary" : "default"}
          variant={editor.isActive("heading", { level: 1 }) ? "flat" : "light"}
          onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <XIcon icon={H1Icon} />
        </Button>

        <Button
          isIconOnly
          color={editor.isActive("heading", { level: 2 }) ? "primary" : "default"}
          variant={editor.isActive("heading", { level: 2 }) ? "flat" : "light"}
          onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <XIcon icon={H2Icon} />
        </Button>

        <Button
          isIconOnly
          color={editor.isActive("bold") ? "primary" : "default"}
          variant={editor.isActive("bold") ? "flat" : "light"}
          onPress={() => editor.chain().focus().toggleBold().run()}
        >
          <XIcon icon={BoldIcon} />
        </Button>

        <Button
          isIconOnly
          color={editor.isActive("italic") ? "primary" : "default"}
          variant={editor.isActive("italic") ? "flat" : "light"}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        >
          <XIcon icon={ItalicIcon} />
        </Button>

        <Button
          isIconOnly
          color={editor.isActive("underline") ? "primary" : "default"}
          variant={editor.isActive("underline") ? "flat" : "light"}
          onPress={() => editor.chain().focus().toggleUnderline().run()}
        >
          <XIcon icon={UnderlineIcon} />
        </Button>

        <Button
          isIconOnly
          color={editor.isActive("strike") ? "primary" : "default"}
          variant={editor.isActive("strike") ? "flat" : "light"}
          onPress={() => editor.chain().focus().toggleStrike().run()}
        >
          <XIcon icon={StrikethroughIcon} />
        </Button>

        <XEditorLinkPopover editor={editor} isOpen={linkPopoverOpen} onOpenChange={setLinkPopoverOpen} />
      </ButtonGroup>
    </div>
  );
}
