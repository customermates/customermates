"use client";

import { Check, Clipboard } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  value: string;
  className?: string;
  id?: string;
  anchorId?: string;
  disabled?: boolean;
};

export function CopyableCode({ value, className, id, anchorId, disabled = false }: Props) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copy(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      aria-busy={disabled || undefined}
      className={cn("relative rounded-md border bg-background", disabled && "text-muted-foreground", className)}
      data-value={disabled ? undefined : value}
      id={id}
    >
      <pre className="overflow-x-hidden break-all whitespace-pre-wrap px-3 py-2 pr-11 text-sm font-mono text-foreground">
        <code>{value}</code>
      </pre>

      <Button
        aria-label={t("Common.actions.copy")}
        className="absolute right-1 top-1"
        disabled={disabled}
        id={anchorId}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(handleCopy)}
      >
        <Icon icon={copied ? Check : Clipboard} />
      </Button>
    </div>
  );
}
