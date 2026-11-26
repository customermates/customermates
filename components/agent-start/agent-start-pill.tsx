import { ArrowRight } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { AppLink } from "@/components/shared/app-link";
import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  href: string;
  label: string;
};

const LOGOS = ["claude", "chatgpt", "gemini"] as const;

export function agentStartOpenLinks(prompt: string) {
  const query = encodeURIComponent(prompt);
  return {
    claude: `https://claude.ai/new?q=${query}`,
    chatgpt: `https://chatgpt.com/?q=${query}`,
  };
}

export function AgentStartPill({ className, href, label }: Props) {
  return (
    <AppLink appearance="unstyled" className={cn("agent-start-pill", className)} data-agent-start-pill="" href={href}>
      <span className="agent-start-pill-row">
        <span aria-hidden className="agent-start-chip-logos">
          {LOGOS.map((provider) => (
            <span key={provider}>
              <AiClientLogo className="size-3.5" provider={provider} />
            </span>
          ))}
        </span>

        <span className="agent-start-pill-label">{label}</span>

        <span aria-hidden className="agent-start-pill-icon">
          <ArrowRight className="size-4" />
        </span>
      </span>
    </AppLink>
  );
}
