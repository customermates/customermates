"use client";

import { ArrowRight, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { AgentStartChip } from "@/components/agent-start/agent-start-chip";
import { agentStartOpenLinks } from "@/components/agent-start/agent-start-pill";
import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";

type Props = {
  appHref: string;
  email: string;
  guideUrl: string;
  mcpUrl: string;
  workspaceCount: number;
};

export function ConnectAgentCard({ appHref, email, guideUrl, mcpUrl, workspaceCount }: Props) {
  const t = useTranslations();
  const prompt = t("AgentStart.prompt", { url: guideUrl, mcp: mcpUrl });
  const links = agentStartOpenLinks(prompt);

  return (
    <AppCard className="max-w-lg" data-connect-agent="">
      <CardHeroHeader subtitle={t("AgentStart.connect.subtitle")} title={t("AgentStart.connect.title")} />

      <AppCardBody>
        <AgentStartChip
          labels={{
            copied: t("AgentStart.copied"),
            copy: t("AgentStart.copy"),
            failed: t("AgentStart.failed"),
            hint: t("AgentStart.hint"),
          }}
          prompt={prompt}
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button asChild variant="secondary">
            <a data-connect-agent-open="claude" href={links.claude} rel="noopener noreferrer" target="_blank">
              <AiClientLogo className="size-4" provider="claude" />

              {t("AgentStart.openIn", { app: "Claude" })}
            </a>
          </Button>

          <Button asChild variant="secondary">
            <a data-connect-agent-open="chatgpt" href={links.chatgpt} rel="noopener noreferrer" target="_blank">
              <AiClientLogo className="size-4" provider="chatgpt" />

              {t("AgentStart.openIn", { app: "ChatGPT" })}
            </a>
          </Button>
        </div>

        <p className="flex items-center gap-2 text-x-sm text-subdued" data-connect-agent-account="">
          <CircleCheck aria-hidden className="size-4 shrink-0" />

          {t("AgentStart.connect.account", { email, count: workspaceCount })}
        </p>
      </AppCardBody>

      {workspaceCount > 0 ? (
        <AppCardFooter>
          <Button asChild className="max-sm:w-full" variant="ghost">
            <a data-connect-agent-app="" href={appHref}>
              {t("Common.actions.openApp")}

              <ArrowRight aria-hidden className="size-4" />
            </a>
          </Button>
        </AppCardFooter>
      ) : null}
    </AppCard>
  );
}
