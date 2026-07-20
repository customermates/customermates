"use client";

import type { Editor } from "@tiptap/react";

import {
  CheckCircle,
  List,
  ListOrdered,
  FileText,
  Minus,
  Quote,
  Heading1,
  Heading2,
  Table as TableIcon,
  Image as ImageIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type SlashCommand = {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

type Props = {
  editor: Editor;
  position: { top: number; left: number };
  slashMenuRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
};

export function SlashMenu({ editor, position, slashMenuRef, onClose }: Props) {
  const t = useTranslations();

  const commands = useMemo((): SlashCommand[] => {
    const chain = () => editor.chain().focus();

    return [
      {
        key: "heading1",
        title: t("Editor.heading1"),
        icon: Heading1,
        run: () => chain().toggleHeading({ level: 1 }).run(),
      },
      {
        key: "heading2",
        title: t("Editor.heading2"),
        icon: Heading2,
        run: () => chain().toggleHeading({ level: 2 }).run(),
      },
      {
        key: "normalText",
        title: t("Editor.normalText"),
        icon: FileText,
        run: () => chain().setParagraph().run(),
      },
      {
        key: "bulletList",
        title: t("Editor.bulletList"),
        icon: List,
        run: () => chain().toggleBulletList().run(),
      },
      {
        key: "numberedList",
        title: t("Editor.numberedList"),
        icon: ListOrdered,
        run: () => chain().toggleOrderedList().run(),
      },
      {
        key: "taskList",
        title: t("Editor.taskList"),
        icon: CheckCircle,
        run: () => chain().toggleTaskList().run(),
      },
      {
        key: "blockQuote",
        title: t("Editor.blockQuote"),
        icon: Quote,
        run: () => chain().toggleBlockquote().run(),
      },
      {
        key: "divider",
        title: t("Editor.divider"),
        icon: Minus,
        run: () => chain().setHorizontalRule().run(),
      },
      {
        key: "table",
        title: t("Editor.table"),
        icon: TableIcon,
        run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        key: "image",
        title: t("Editor.image"),
        icon: ImageIcon,
        run: () => {
          const src = window.prompt(t("Editor.imageUrlPrompt"))?.trim();
          if (src) chain().setImage({ src }).run();
        },
      },
    ];
  }, [editor, t]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (slashMenuRef.current && !slashMenuRef.current.contains(event.target as Node)) onClose();
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, slashMenuRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={slashMenuRef}
      className="fixed z-50 w-72 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      style={{ top: position.top, left: position.left }}
    >
      <Command>
        <CommandInput autoFocus placeholder={t("Editor.placeholder")} />

        <CommandList>
          <CommandEmpty>{t("Editor.noResults")}</CommandEmpty>

          <CommandGroup>
            {commands.map((command) => (
              <CommandItem
                key={command.key}
                value={command.title}
                onSelect={() => {
                  command.run();
                  onClose();
                }}
              >
                <command.icon className="size-4" />

                <span>{command.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>,
    document.body,
  );
}
