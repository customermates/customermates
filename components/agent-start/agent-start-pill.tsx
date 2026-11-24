"use client";

import type { ReactNode } from "react";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";
import { cn } from "@/core/utils/cn";

export type AgentStartPillLabels = {
  copied: string;
  failed: string;
  label: string;
};

type Props = {
  className?: string;
  labels: AgentStartPillLabels;
  leading?: ReactNode;
  prompt: string;
  size?: "default" | "sm";
};

const REVEAL_MS = 4000;
const LOGOS = ["claude", "chatgpt", "gemini"] as const;

export function AgentStartPill({ className, labels, leading, prompt, size = "default" }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    const copied = await copyToClipboard(prompt).catch(() => false);
    setStatus(copied ? "copied" : "failed");
  }

  const open = status !== "idle";

  return (
    <button
      aria-label={`${labels.label}: ${prompt}`}
      className={cn("agent-start-pill", className)}
      data-agent-start-pill=""
      data-open={open ? "" : undefined}
      data-size={size}
      type="button"
      onClick={() => runUserAction(copy)}
    >
      {open ? (
        <span className="agent-start-pill-tip" role="status">
          {status === "copied" ? labels.copied : labels.failed}
        </span>
      ) : null}

      <span className="agent-start-pill-row">
        {leading ?? (
          <span aria-hidden className="agent-start-chip-logos">
            {LOGOS.map((provider) => (
              <span key={provider}>
                <AiClientLogo className="size-3.5" provider={provider} />
              </span>
            ))}
          </span>
        )}

        <span className="agent-start-pill-label">{labels.label}</span>

        <span aria-hidden className="agent-start-pill-icon" data-status={status}>
          {status === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
        </span>
      </span>

      {open ? <span className="agent-start-pill-prompt">{prompt}</span> : null}
    </button>
  );
}
