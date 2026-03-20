"use client";

import { useMemo, useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, ChevronDownIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";

import { XIcon } from "@/components/x-icon";

const markdownCache = new Map<string, string>();

type DocsPageActionsProps = {
  markdownUrl: string;
};

export function DocsPageActions({ markdownUrl }: DocsPageActionsProps) {
  const [isCopied, setIsCopied] = useState(false);
  const t = useTranslations("DocsPage");

  const items = useMemo(() => {
    const absoluteMarkdownUrl =
      typeof window === "undefined" ? markdownUrl : new URL(markdownUrl, window.location.origin).toString();
    const prompt = `Read ${absoluteMarkdownUrl}, I want to ask questions about it.`;

    return [
      {
        href: markdownUrl,
        title: t("openMarkdown"),
      },
      {
        href: `https://chatgpt.com/?${new URLSearchParams({ hints: "search", q: prompt })}`,
        title: t("openInChatGPT"),
      },
      {
        href: `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`,
        title: t("openInClaude"),
      },
    ];
  }, [markdownUrl, t]);

  async function handleCopy() {
    try {
      const cachedMarkdown = markdownCache.get(markdownUrl);
      const markdown =
        cachedMarkdown === undefined ? await fetch(markdownUrl).then((response) => response.text()) : cachedMarkdown;
      markdownCache.set(markdownUrl, markdown);
      await navigator.clipboard.writeText(markdown);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
      addToast({ color: "success", description: t("markdownCopied") });
    } catch {
      addToast({ color: "danger", description: t("markdownCopyFailed") });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        color="default"
        endContent={<XIcon icon={isCopied ? CheckIcon : ClipboardIcon} size="sm" />}
        size="sm"
        variant="flat"
        onPress={() => void handleCopy()}
      >
        {t("copyMarkdown")}
      </Button>

      <Popover placement="bottom-start">
        <PopoverTrigger>
          <Button color="default" endContent={<XIcon icon={ChevronDownIcon} size="sm" />} size="sm" variant="flat">
            {t("open")}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="p-1">
          <div className="flex min-w-56 flex-col">
            {items.map((item) => (
              <a
                key={item.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-default-100"
                href={item.href}
                rel="noreferrer noopener"
                target="_blank"
              >
                <span>{item.title}</span>

                <XIcon className="ml-auto shrink-0 text-subdued" icon={ArrowTopRightOnSquareIcon} size="sm" />
              </a>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
