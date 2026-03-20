"use client";

import type { Editor } from "@tiptap/react";

import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { CheckIcon, LinkIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { XIcon } from "../x-icon";

type Props = {
  editor: Editor;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function XEditorLinkPopover({ editor, isOpen, onOpenChange }: Props) {
  const t = useTranslations("Editor");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (isOpen) {
      const previousUrl = editor.getAttributes("link").href || "";
      setUrl(previousUrl);
    }
  }, [isOpen, editor]);

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

  const isActive = editor.isActive("link");
  const canSet = url.trim() !== "";

  return (
    <Popover isOpen={isOpen} placement="bottom" onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <Button isIconOnly color={isActive ? "primary" : "default"} size="sm" variant={isActive ? "flat" : "light"}>
          <XIcon icon={LinkIcon} size="md" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-2">
        <div className="flex w-full">
          <Input
            autoFocus
            className="w-full"
            classNames={{
              inputWrapper: "rounded-r-none group-data-[focus=true]:border-default-400",
            }}
            placeholder={t("urlPlaceholder")}
            size="sm"
            type="url"
            value={url}
            variant="bordered"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <Button isIconOnly color="primary" isDisabled={!canSet} size="sm" variant="flat" onPress={setLink}>
            <XIcon icon={CheckIcon} />
          </Button>

          {isActive && (
            <Button isIconOnly color="danger" size="sm" variant="flat" onPress={removeLink}>
              <XIcon icon={TrashIcon} />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
