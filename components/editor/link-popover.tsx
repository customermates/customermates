"use client";

import type { Editor } from "@tiptap/react";

import { Check, Link, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LinkPopover({ editor, open, onOpenChange }: Props) {
  const t = useTranslations();
  const [url, setUrl] = useState("");

  const isActive = editor.isActive("link");
  const canSet = url.trim() !== "";

  useEffect(() => {
    if (open) {
      const previousUrl = (editor.getAttributes("link").href as string) || "";
      setUrl(previousUrl);
    }
  }, [open, editor]);

  function setLink() {
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();

    onOpenChange(false);
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      setLink();
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("Editor.link")}
          className={cn(isActive && "bg-accent text-accent-foreground")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Link />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-2">
        <div className="flex w-full items-center gap-1">
          <Input
            autoFocus
            placeholder={t("Editor.urlPlaceholder")}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <Button
            aria-label={t("Editor.confirm")}
            disabled={!canSet}
            size="icon-sm"
            type="button"
            variant="default"
            onClick={setLink}
          >
            <Check />
          </Button>

          {isActive && (
            <Button
              aria-label={t("Editor.removeLink")}
              size="icon-sm"
              type="button"
              variant="destructive"
              onClick={removeLink}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
