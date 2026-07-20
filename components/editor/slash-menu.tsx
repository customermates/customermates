"use client";

import type { Editor } from "@tiptap/react";

import {
  CheckCircle,
  Check,
  List,
  ListOrdered,
  FileText,
  Link as LinkIcon,
  Minus,
  Quote,
  Heading1,
  Heading2,
  Table as TableIcon,
  Image as ImageIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";

type UrlCommandKey = "image" | "link";

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
  const [urlCommand, setUrlCommand] = useState<UrlCommandKey | null>(null);
  const [url, setUrl] = useState("");

  const trimmedUrl = url.trim();

  function applyUrlCommand() {
    if (!trimmedUrl) return;

    const chain = editor.chain().focus();

    if (urlCommand === "image") chain.setImage({ src: trimmedUrl }).run();
    else if (editor.state.selection.empty) {
      chain
        .insertContent({ type: "text", text: trimmedUrl, marks: [{ type: "link", attrs: { href: trimmedUrl } }] })
        .run();
    } else chain.extendMarkRange("link").setLink({ href: trimmedUrl }).run();

    onClose();
  }

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
        run: () => setUrlCommand("image"),
      },
      {
        key: "link",
        title: t("Editor.link"),
        icon: LinkIcon,
        run: () => setUrlCommand("link"),
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
      {urlCommand ? (
        <div className="flex w-full items-center gap-1 p-2">
          <Input
            autoFocus
            placeholder={urlCommand === "image" ? t("Editor.imageUrlPrompt") : t("Editor.urlPlaceholder")}
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyUrlCommand();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                setUrlCommand(null);
                setUrl("");
              }
            }}
          />

          <Button
            aria-label={t("Editor.confirm")}
            disabled={!trimmedUrl}
            size="icon-sm"
            type="button"
            variant="default"
            onClick={applyUrlCommand}
          >
            <Check />
          </Button>
        </div>
      ) : (
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
                    if (command.key !== "image" && command.key !== "link") onClose();
                  }}
                >
                  <command.icon className="size-4" />

                  <span>{command.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </div>,
    document.body,
  );
}
