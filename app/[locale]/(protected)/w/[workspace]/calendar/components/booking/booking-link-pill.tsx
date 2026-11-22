"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

const COPIED_MS = 2000;

export function bookingLinkParts(url: string): { base: string; slug: string } {
  const bare = url.replace(/^https?:\/\//u, "");
  const cut = bare.lastIndexOf("/");
  return cut === -1 ? { base: "", slug: bare } : { base: bare.slice(0, cut + 1), slug: bare.slice(cut + 1) };
}

export function BookingLinkPill({ url }: { url: string }) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const [copied, setCopied] = useState(false);
  const { base, slug } = bookingLinkParts(url);

  async function handleCopy() {
    if (!(await copy(url))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <span
      className="flex min-w-0 items-center gap-1 rounded-md border bg-muted/40 py-0.5 ps-2 pe-0.5 text-xs"
      data-value={url}
    >
      <span className="min-w-0 truncate text-muted-foreground">{base}</span>

      <span className="max-w-[45%] shrink-0 truncate font-medium">{slug}</span>

      <Button
        aria-label={t("Common.actions.copy")}
        size="icon-xs"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(handleCopy)}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </span>
  );
}
