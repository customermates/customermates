"use client";

import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";

type Props = {
  copiedLabel: string;
  failedLabel: string;
  label: string;
  value: string;
};

const RESET_MS = 2500;

export function TemplateCopyButton({ copiedLabel, failedLabel, label, value }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    const copied = await copyToClipboard(value);
    setStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), RESET_MS);
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(handleCopy)}>
        <Icon icon={status === "copied" ? Check : Clipboard} />

        {label}
      </Button>

      <span aria-live="polite" className="text-xs text-muted-foreground" role="status">
        {status === "copied" ? copiedLabel : status === "failed" ? failedLabel : ""}
      </span>
    </span>
  );
}
