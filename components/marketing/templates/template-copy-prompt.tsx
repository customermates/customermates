"use client";

import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";

type Variant = "cloud" | "selfHosted";

export type TemplateCopyPromptLabels = {
  cloud: string;
  copied: string;
  copy: string;
  failed: string;
  promptLabel: string;
  selfHosted: string;
  switchLabel: string;
};

type Props = {
  cloudPrompt: string;
  idPrefix: string;
  labels: TemplateCopyPromptLabels;
  selfHostedPrompt: string;
};

const RESET_MS = 2500;

export function TemplateCopyPrompt({ cloudPrompt, idPrefix, labels, selfHostedPrompt }: Props) {
  const [variant, setVariant] = useState<Variant>("cloud");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const prompts: Record<Variant, string> = { cloud: cloudPrompt, selfHosted: selfHostedPrompt };

  async function handleCopy() {
    const copied = await copyToClipboard(prompts[variant]);
    setStatus(copied ? "copied" : "failed");
    window.setTimeout(() => setStatus("idle"), RESET_MS);
  }

  function handleVariant(next: Variant) {
    setVariant(next);
    setStatus("idle");
  }

  return (
    <div className="mk-card w-full overflow-hidden" data-template-prompt="">
      <SegmentedControl<Variant>
        className="gap-0"
        idPrefix={idPrefix}
        items={[
          { value: "cloud", label: labels.cloud },
          { value: "selfHosted", label: labels.selfHosted },
        ]}
        label={labels.switchLabel}
        listClassName="mx-4 mt-4 max-w-sm"
        value={variant}
        onValueChange={handleVariant}
      >
        {(["cloud", "selfHosted"] as const).map((value) => (
          <SegmentedControlPanel key={value} forceMount className="p-4" value={value}>
            <textarea
              readOnly
              aria-label={labels.promptLabel}
              className="block h-[28rem] w-full resize-none rounded-lg border border-border bg-muted p-4 text-left font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              data-prompt-variant={value}
              value={prompts[value]}
            />
          </SegmentedControlPanel>
        ))}
      </SegmentedControl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {status === "copied" ? labels.copied : status === "failed" ? labels.failed : " "}
        </p>

        <Button type="button" onClick={() => runUserAction(handleCopy)}>
          <Icon icon={status === "copied" ? Check : Clipboard} />

          {labels.copy}
        </Button>
      </div>
    </div>
  );
}
