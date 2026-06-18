"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Check, ChevronDown, Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";

const markdownCache = new Map<string, string>();

type DocsPageActionsProps = {
  markdownUrl: string;
};

export function DocsPageActions({ markdownUrl }: DocsPageActionsProps) {
  const [isCopied, setIsCopied] = useState(false);
  const t = useTranslations();

  const items = useMemo(() => {
    const absoluteMarkdownUrl =
      typeof window === "undefined" ? markdownUrl : new URL(markdownUrl, window.location.origin).toString();
    const prompt = `Read ${absoluteMarkdownUrl}, I want to ask questions about it.`;

    return [
      {
        href: markdownUrl,
        title: t("DocsPage.openMarkdown"),
      },
      {
        href: `https://chatgpt.com/?${new URLSearchParams({ hints: "search", q: prompt })}`,
        title: t("DocsPage.openInChatGPT"),
      },
      {
        href: `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`,
        title: t("DocsPage.openInClaude"),
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
      toast.success(t("DocsPage.markdownCopied"));
    } catch {
      toast.error(t("DocsPage.markdownCopyFailed"));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
        {t("DocsPage.copyMarkdown")}

        <Icon icon={isCopied ? Check : Clipboard} size="sm" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary">
            {t("DocsPage.open")}

            <Icon icon={ChevronDown} size="sm" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="p-1">
          <div className="flex min-w-56 flex-col">
            {items.map((item) => (
              <a
                key={item.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                href={item.href}
                rel="noreferrer noopener"
                target="_blank"
              >
                <span>{item.title}</span>

                <Icon className="ml-auto shrink-0 text-subdued" icon={ExternalLink} size="sm" />
              </a>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
