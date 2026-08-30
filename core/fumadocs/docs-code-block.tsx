"use client";

import type { ComponentProps, ReactNode } from "react";

import { Check, Clipboard } from "lucide-react";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { copyToClipboard } from "@/core/utils/clipboard";
import { runUserAction } from "@/core/errors/report-application-error";

function CodeCopyButton({ className }: { className?: string }) {
  const t = useTranslations();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const pre = anchorRef.current?.closest("figure")?.querySelector("pre");
    if (!pre) return;

    const clone = pre.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".nd-copy-ignore").forEach((node) => node.replaceWith("\n"));

    if (!(await copyToClipboard(clone.textContent ?? ""))) {
      toast.error(t("DocsPage.copyFailed"));
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span ref={anchorRef} className={className}>
      <Button
        aria-label={t("Common.actions.copy")}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(handleCopy)}
      >
        <Icon icon={copied ? Check : Clipboard} />
      </Button>
    </span>
  );
}

export function DocsCodeBlock(props: ComponentProps<"pre">) {
  const renderActions = ({ className }: { className?: string; children?: ReactNode }) => (
    <CodeCopyButton className={className} />
  );

  return (
    <CodeBlock {...props} Actions={renderActions} allowCopy={false}>
      <Pre>{props.children}</Pre>
    </CodeBlock>
  );
}
