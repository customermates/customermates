"use client";

import type { ReactNode } from "react";

import { Check, CircleCheck, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";
import { cn } from "@/core/utils/cn";

export type AgentStartPillLabels = {
  copied: string;
  failed: string;
  label: string;
  openInClaude: string;
  openInChatgpt: string;
};

type Props = {
  className?: string;
  labels: AgentStartPillLabels;
  leading?: ReactNode;
  prompt: string;
  size?: "default" | "sm";
};

const CHECK_MS = 2500;
const LOGOS = ["claude", "chatgpt", "gemini"] as const;
const TOAST_ID = "agent-start-copied";

export function agentStartOpenLinks(prompt: string) {
  const query = encodeURIComponent(prompt);
  return {
    claude: `https://claude.ai/new?q=${query}`,
    chatgpt: `https://chatgpt.com/?q=${query}`,
  };
}

function CopiedToast({ labels, prompt }: { labels: AgentStartPillLabels; prompt: string }) {
  const links = agentStartOpenLinks(prompt);
  return (
    <span className="agent-start-toast" data-agent-start-toast="">
      <span className="agent-start-toast-prompt">{prompt}</span>

      <span className="agent-start-toast-actions">
        <a className="agent-start-toast-action" href={links.claude} rel="noopener noreferrer" target="_blank">
          <AiClientLogo className="size-3.5" provider="claude" />

          {labels.openInClaude}
        </a>

        <a className="agent-start-toast-action" href={links.chatgpt} rel="noopener noreferrer" target="_blank">
          <AiClientLogo className="size-3.5" provider="chatgpt" />

          {labels.openInChatgpt}
        </a>
      </span>
    </span>
  );
}

export function AgentStartPill({ className, labels, leading, prompt, size = "default" }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    const done = await copyToClipboard(prompt).catch(() => false);
    if (!done) {
      toast.error(labels.failed, { id: TOAST_ID });
      return;
    }
    setCopied(true);
    toast(labels.copied, {
      id: TOAST_ID,
      icon: <CircleCheck className="size-4 text-success" />,
      description: <CopiedToast labels={labels} prompt={prompt} />,
    });
  }

  return (
    <button
      aria-label={`${labels.label}: ${prompt}`}
      className={cn("agent-start-pill", className)}
      data-agent-start-pill=""
      data-size={size}
      type="button"
      onClick={() => runUserAction(copy)}
    >
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

        <span aria-hidden className="agent-start-pill-icon" data-status={copied ? "copied" : "idle"}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </span>
      </span>
    </button>
  );
}
