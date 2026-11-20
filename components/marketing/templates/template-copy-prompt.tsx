"use client";

import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";

export type TemplateCopyPromptLabels = {
  copied: string;
  copy: string;
  failed: string;
  promptLabel: string;
};

type Props = {
  labels: TemplateCopyPromptLabels;
  prompt: string;
};

const RESET_MS = 2500;

export function TemplateCopyPrompt({ labels, prompt }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    const copied = await copyToClipboard(prompt);
    setStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), RESET_MS);
  }

  return (
    <div className="mk-card w-full overflow-hidden" data-template-prompt="">
      <div className="p-4">
        <textarea
          readOnly
          aria-label={labels.promptLabel}
          className="block h-[28rem] w-full resize-none rounded-lg border border-border bg-muted p-4 text-left font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          value={prompt}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {status === "copied" ? labels.copied : status === "failed" ? labels.failed : " "}
        </p>

        <Button type="button" onClick={() => runUserAction(handleCopy)}>
          <Icon icon={status === "copied" ? Check : Clipboard} />

          {labels.copy}
        </Button>
      </div>
    </div>
  );
}
