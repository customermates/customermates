import type { HomepageGenerator } from "@/core/fumadocs/schemas/homepage";

import { ArrowRight, ArrowUp } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppLink } from "@/components/shared/app-link";
import { cn } from "@/core/utils/cn";
import { env } from "@/env";

import { HomepageComposerText } from "./homepage-composer-text";
import { HomepageMateLogo } from "./homepage-mate-logo";
import { SectionHeader } from "@/components/marketing/section-header";
import { HomepageWorkspaceTabs } from "./homepage-workspace-tabs";
import { SolutionProductStage } from "./solution-product-stage";

const MATE_NAME = "Mate";

const PROMPT_AGENTS = [
  { compact: false, name: "Claude", provider: "claude" },
  { compact: false, name: "ChatGPT", provider: "chatgpt" },
  { compact: true, name: "Cursor", provider: "cursor" },
] as const;

type Props = {
  generator: HomepageGenerator;
  locale: string;
};

export async function HomepageWorkspacePrompt({
  arrowLabel,
  prompt,
  promptLabel,
}: {
  arrowLabel: string;
  prompt: string;
  promptLabel: string;
}) {
  const t = await getTranslations("HomepageWorkspacePrompt");

  return (
    <div data-homepage-prompt className="mx-auto mt-10 max-w-[48rem]">
      <figure data-homepage-composer className="homepage-spotlight">
        <figcaption className="sr-only">{promptLabel}</figcaption>

        <blockquote className="homepage-spotlight-body">
          <HomepageComposerText prompt={prompt} />
        </blockquote>

        <div className="homepage-spotlight-footer">
          <span className="homepage-spotlight-to">{t("sendTo")}</span>

          <ul aria-label={t("sendTo")} className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
            <li className="homepage-agent-chip homepage-agent-chip-active">
              <HomepageMateLogo />

              {MATE_NAME}
            </li>

            {PROMPT_AGENTS.map((agent) => (
              <li
                key={agent.provider}
                className={cn("homepage-agent-chip", agent.compact && "homepage-agent-chip-compact")}
              >
                <AiClientLogo className="size-3.5" provider={agent.provider} />

                {agent.name}
              </li>
            ))}
          </ul>

          <span aria-hidden className="homepage-spotlight-send" title={t("send")}>
            <ArrowUp className="size-4" />
          </span>
        </div>
      </figure>

      <div aria-hidden className="homepage-drop">
        <svg viewBox="0 0 60 110">
          <path d="M30 4 C 18 30, 42 60, 30 96" pathLength={1} />

          <path d="M20 86 L30 100 L40 86" pathLength={1} />
        </svg>

        <span className="homepage-drop-label">{arrowLabel}</span>

        {env.APP_MODE === "self-hosted" ? null : (
          <span className="homepage-drop-live">
            <span className="homepage-live-dot" />

            {t("live")}
          </span>
        )}
      </div>
    </div>
  );
}

export function WorkspaceBuildSteps({ steps }: { steps: HomepageGenerator["steps"] }) {
  if (!steps) return null;

  return (
    <ol className="mx-auto mt-10 grid max-w-[60rem] gap-5 sm:grid-cols-3 sm:gap-8" data-workspace-steps="">
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-3 text-left sm:block">
          <span
            aria-hidden
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-medium text-foreground tabular-nums"
          >
            {index + 1}
          </span>

          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className="absolute top-3.5 left-10 hidden h-px w-[calc(100%-2.5rem)] bg-border sm:block"
            />
          ) : null}

          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-foreground sm:mt-3">{step.title}</h3>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HomepageWorkspaceGenerator({ generator, locale }: Props) {
  const panels = generator.items.map((item) => (
    <div key={item.solution}>
      <HomepageWorkspacePrompt
        arrowLabel={generator.arrowLabel}
        prompt={item.prompt}
        promptLabel={generator.promptLabel}
      />

      <SolutionProductStage className="mt-0" locale={locale} solutionId={item.solution} />

      <p className="mt-6 text-center">
        <AppLink
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          href={item.href}
        >
          {item.linkLabel}

          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </AppLink>
      </p>
    </div>
  ));

  return (
    <MarketingSection className="mk-section" id="workspace">
      <SectionHeader description={generator.description} eyebrow={generator.eyebrow} title={generator.title} />

      <WorkspaceBuildSteps steps={generator.steps} />

      <div className="mt-10">
        <HomepageWorkspaceTabs
          label={generator.eyebrow}
          labels={generator.items.map((item) => item.label)}
          panels={panels}
        />
      </div>
    </MarketingSection>
  );
}
