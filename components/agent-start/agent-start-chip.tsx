"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";
import { cn } from "@/core/utils/cn";

export type AgentStartChipLabels = {
  copied: string;
  copy: string;
  failed: string;
  hint: string;
};

type Props = {
  className?: string;
  labels: AgentStartChipLabels;
  prompt: string;
  variant?: "hero" | "panel";
};

const RESET_MS = 2500;
const LOGOS = ["claude", "chatgpt", "gemini", "cursor"] as const;

export function AgentStartChip({ className, labels, prompt, variant = "panel" }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    const copied = await copyToClipboard(prompt).catch(() => false);
    setStatus(copied ? "copied" : "failed");
  }

  const actionLabel = status === "copied" ? labels.copied : status === "failed" ? labels.failed : labels.copy;

  return (
    <div className={cn("agent-start-chip", className)} data-agent-start="" data-variant={variant}>
      <span className="agent-start-chip-hint">
        <span aria-hidden className="agent-start-chip-logos">
          {LOGOS.map((provider) => (
            <span key={provider}>
              <AiClientLogo className="size-3" provider={provider} />
            </span>
          ))}
        </span>

        {labels.hint}
      </span>

      <button
        aria-label={`${labels.copy}: ${prompt}`}
        className="agent-start-chip-button"
        data-agent-start-copy=""
        type="button"
        onClick={() => runUserAction(copy)}
      >
        <span className="agent-start-chip-prompt">{prompt}</span>

        <span aria-live="polite" className="agent-start-chip-action" data-status={status}>
          {status === "copied" ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}

          <span>{actionLabel}</span>
        </span>
      </button>
    </div>
  );
}
