import type { UseCaseAgent, UseCaseItem, UseCases } from "@/core/fumadocs/schemas/use-cases";

import { ArrowRight, Check } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { MateOrb } from "@/components/mate/mate-orb";
import { AppLink } from "@/components/shared/app-link";
import { cn } from "@/core/utils/cn";

import { MarketingSection } from "./marketing-section";
import { SectionHeader } from "./section-header";
import { UseCaseCapture, hasUseCaseCapture, conversationChannel } from "./use-case-capture";
import { UseCaseVisual } from "./use-case-visual";

type Props = {
  useCases: UseCases;
};

const AGENT_NAMES: Record<UseCaseAgent, string> = { claude: "Claude", mate: "Mate" };

function AgentMark({ agent }: { agent: UseCaseAgent }) {
  return agent === "claude" ? (
    <AiClientLogo className="size-4 shrink-0" provider="claude" />
  ) : (
    <MateOrb className="size-4 shrink-0" />
  );
}

function AgentCardBody({ item }: { item: UseCaseItem & { agent: UseCaseAgent } }) {
  return (
    <span className="flex flex-1 flex-col p-6">
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground" data-use-case-agent={item.agent}>
        <AgentMark agent={item.agent} />

        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{AGENT_NAMES[item.agent]}</span>

          {` · ${item.done ?? ""}`}
        </span>
      </span>

      <span className="mt-3 block flex-1 text-lg font-semibold tracking-tight text-balance text-foreground">
        {item.title}
      </span>

      <span className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check aria-hidden className="size-3.5 shrink-0" />

        {item.you}
      </span>

      <span className="mk-link mt-5">
        {item.linkLabel}

        <ArrowRight aria-hidden />
      </span>
    </span>
  );
}

function DescribedCardBody({ item }: { item: UseCaseItem }) {
  return (
    <span className="flex flex-1 flex-col p-6">
      <span className="block text-lg font-semibold tracking-tight text-balance text-foreground">{item.title}</span>

      <span className="mt-2 block flex-1 text-sm leading-6 text-muted-foreground">{item.description}</span>

      <span className="mk-link mt-6">
        {item.linkLabel}

        <ArrowRight aria-hidden />
      </span>
    </span>
  );
}

export function UseCasesSection({ useCases }: Props) {
  const { description, eyebrow, items, title } = useCases;

  return (
    <MarketingSection className="mk-section" id="use-cases">
      <SectionHeader description={description} eyebrow={eyebrow} title={title} />

      <ul
        className={cn("grid gap-4 sm:grid-cols-2", items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}
        data-use-cases=""
      >
        {items.map((item) => (
          <li key={item.title} data-reveal className="mk-card mk-card-interactive group overflow-hidden">
            <AppLink appearance="unstyled" className="flex h-full flex-col" href={item.href}>
              {hasUseCaseCapture(item.visual) ? (
                <UseCaseCapture channel={conversationChannel(item)} kind={item.visual} />
              ) : (
                <UseCaseVisual kind={item.visual} />
              )}

              {item.agent ? <AgentCardBody item={{ ...item, agent: item.agent }} /> : <DescribedCardBody item={item} />}
            </AppLink>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}
