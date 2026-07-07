"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  Braces,
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  ExternalLink,
  FileText,
  MousePointer2,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";

const markdownCache = new Map<string, string>();

type DocsPageActionsProps = {
  markdownUrl: string;
  mcpUrl: string;
};

export function DocsPageActions({ markdownUrl, mcpUrl }: DocsPageActionsProps) {
  const [isCopied, setIsCopied] = useState(false);
  const locale = useLocale();
  const t = useTranslations();

  const links = useMemo(() => {
    const absoluteMarkdownUrl =
      typeof window === "undefined" ? markdownUrl : new URL(markdownUrl, window.location.origin).toString();
    const prompt = `Read ${absoluteMarkdownUrl} and prepare to answer questions about it.`;

    return {
      chatgpt: `https://chatgpt.com/?${new URLSearchParams({ hints: "search", q: prompt })}`,
      claude: `https://claude.ai/new?${new URLSearchParams({ q: prompt })}`,
      cursor: `cursor://anysphere.cursor-deeplink/mcp/install?name=customermates&config=${btoa(
        JSON.stringify({ url: mcpUrl }),
      )}`,
      vscode: `vscode:mcp/install?${encodeURIComponent(
        JSON.stringify({ name: "customermates", type: "http", url: mcpUrl }),
      )}`,
    };
  }, [markdownUrl, mcpUrl]);

  const mcpConfig = JSON.stringify({ mcpServers: { customermates: { url: mcpUrl } } }, null, 2);
  const mcpCommand = `claude mcp add --transport http customermates ${mcpUrl}`;

  async function handleCopyPage() {
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
      toast.error(t("DocsPage.copyFailed"));
    }
  }

  async function copyToClipboard(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error(t("DocsPage.copyFailed"));
    }
  }

  const rowClassName =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted";

  return (
    <div className="flex items-stretch">
      <Button className="rounded-r-none pr-2.5" size="sm" variant="secondary" onClick={() => void handleCopyPage()}>
        <Icon icon={isCopied ? Check : Clipboard} size="sm" />

        <span>{t("DocsPage.copyPage")}</span>
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label={t("DocsPage.open")}
            className="border-secondary-foreground/20 rounded-l-none border-l px-1.5"
            size="sm"
            variant="secondary"
          >
            <Icon icon={ChevronDown} size="sm" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="p-1">
          <div className="flex min-w-60 flex-col">
            <a className={rowClassName} href={links.chatgpt} rel="noreferrer noopener" target="_blank">
              <Icon className="shrink-0 text-subdued" icon={Bot} size="sm" />

              <span>{t("DocsPage.openInChatGPT")}</span>

              <Icon className="ml-auto shrink-0 text-subdued" icon={ExternalLink} size="sm" />
            </a>

            <a className={rowClassName} href={links.claude} rel="noreferrer noopener" target="_blank">
              <Icon className="shrink-0 text-subdued" icon={Sparkles} size="sm" />

              <span>{t("DocsPage.openInClaude")}</span>

              <Icon className="ml-auto shrink-0 text-subdued" icon={ExternalLink} size="sm" />
            </a>

            <p className="px-3 pt-2 pb-1 text-xs font-medium text-subdued">{t("DocsPage.mcpSectionLabel")}</p>

            <a className={rowClassName} href={`/${locale}/docs/connect-custom-connector#claude`}>
              <Icon className="shrink-0 text-subdued" icon={Sparkles} size="sm" />

              <span>{t("DocsPage.connectToClaude")}</span>
            </a>

            <a className={rowClassName} href={`/${locale}/docs/connect-custom-connector#chatgpt`}>
              <Icon className="shrink-0 text-subdued" icon={Bot} size="sm" />

              <span>{t("DocsPage.connectToChatGPT")}</span>
            </a>

            <a className={rowClassName} href={links.cursor}>
              <Icon className="shrink-0 text-subdued" icon={MousePointer2} size="sm" />

              <span>{t("DocsPage.connectToCursor")}</span>
            </a>

            <a className={rowClassName} href={links.vscode}>
              <Icon className="shrink-0 text-subdued" icon={Code2} size="sm" />

              <span>{t("DocsPage.connectToVsCode")}</span>
            </a>

            <button
              className={rowClassName}
              type="button"
              onClick={() => void copyToClipboard(mcpConfig, t("DocsPage.mcpConfigCopied"))}
            >
              <Icon className="shrink-0 text-subdued" icon={Braces} size="sm" />

              <span>{t("DocsPage.copyMcpConfig")}</span>
            </button>

            <button
              className={rowClassName}
              type="button"
              onClick={() => void copyToClipboard(mcpCommand, t("DocsPage.mcpCommandCopied"))}
            >
              <Icon className="shrink-0 text-subdued" icon={SquareTerminal} size="sm" />

              <span>{t("DocsPage.copyMcpCommand")}</span>
            </button>

            <div className="-mx-1 my-1 border-t border-border" />

            <a className={rowClassName} href={markdownUrl} rel="noreferrer noopener" target="_blank">
              <Icon className="shrink-0 text-subdued" icon={FileText} size="sm" />

              <span>{t("DocsPage.viewAsMarkdown")}</span>
            </a>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
