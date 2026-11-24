import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { ArrowRight, CodeXml, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { env } from "@/env";
import { AgentStartPill } from "@/components/agent-start/agent-start-pill";
import { Google, Linkedin, Outlook, Whatsapp } from "@/components/icons/channel-icon";
import { agentStartUrl } from "@/core/agent-start/agent-start-guide";

import { marketingButtonClassName } from "@/components/marketing/marketing-button";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppLink } from "@/components/shared/app-link";

import { HomepageHeroDrift } from "./homepage-hero-drift";
import { HomepageHeroParticles } from "./homepage-hero-particles";
import { HomepageHeroPicker } from "./homepage-hero-picker";
import { homepageHeroSignupHref } from "./homepage-hero-signup";

export const HOMEPAGE_SOURCE_AVAILABLE_HREF = "/features/open-source-crm";

const BADGE_CHANNELS = [
  { id: "linkedin", Icon: Linkedin },
  { id: "whatsapp", Icon: Whatsapp },
  { id: "gmail", Icon: Google },
  { id: "outlook", Icon: Outlook },
] as const;

type Props = {
  heroSection: Hero;
};

export function HomepageHero({ heroSection }: Props) {
  const { assurances, badge, picker, primaryCta, secondaryCta, subtitle, title } = heroSection;
  const t = useTranslations();
  const agentPill = (
    <AgentStartPill
      className="homepage-hero-agent-pill"
      labels={{
        copied: t("AgentStart.copiedTip"),
        failed: t("AgentStart.failed"),
        label: t("AgentStart.label"),
      }}
      prompt={t("AgentStart.prompt", { url: agentStartUrl(env.BASE_URL) })}
    />
  );
  const film = (
    <a className="homepage-hero-film" href={secondaryCta.href}>
      <Play aria-hidden className="size-3 fill-current" />

      {secondaryCta.label}
    </a>
  );

  return (
    <section className="mk-hero-section relative isolate w-full" data-homepage-hero="" data-homepage-section="hero">
      <div aria-hidden className="mk-hero-light" />

      <div aria-hidden className="homepage-hero-field">
        <HomepageHeroParticles className="block size-full" />
      </div>

      <HomepageHeroDrift />

      <MarketingContainer className="relative pt-14 pb-12 sm:pt-20 sm:pb-14 lg:pt-24 lg:pb-16">
        <div className="mk-enter relative z-10 mx-auto flex max-w-[50rem] flex-col items-center text-center">
          <p className="homepage-hero-badge">
            <span aria-hidden className="homepage-channel-stack">
              {BADGE_CHANNELS.map(({ id, Icon }) => (
                <span key={id}>
                  <Icon className="size-3" />
                </span>
              ))}
            </span>

            {badge}
          </p>

          <h1 className="mk-hero mt-6">{title}</h1>

          <p className="mk-lede homepage-hero-lede mt-5">{subtitle}</p>

          <div className="mt-7 w-full">
            {picker ? (
              <HomepageHeroPicker
                choices={picker.choices.map((choice) => ({
                  href: homepageHeroSignupHref(choice.template),
                  label: choice.label,
                  template: choice.template,
                }))}
                cta={picker.cta}
                question={picker.question}
              >
                {agentPill}
              </HomepageHeroPicker>
            ) : primaryCta ? (
              <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-2">
                <AppLink
                  appearance="unstyled"
                  className={marketingButtonClassName({ size: "lg" })}
                  data-homepage-hero-cta=""
                  href={primaryCta.href}
                >
                  {primaryCta.label}

                  <ArrowRight aria-hidden data-mk-arrow="" />
                </AppLink>

                {agentPill}
              </div>
            ) : null}

            <div className="mt-3">{film}</div>
          </div>

          <ul className="homepage-hero-assurances mt-5" data-homepage-assurances="">
            <li>
              <AppLink
                appearance="unstyled"
                className="homepage-hero-source-link"
                href={HOMEPAGE_SOURCE_AVAILABLE_HREF}
              >
                <CodeXml aria-hidden className="size-3.5" />

                {assurances.sourceAvailable}
              </AppLink>
            </li>

            <li>{assurances.noCard}</li>

            <li>{assurances.database}</li>
          </ul>
        </div>
      </MarketingContainer>
    </section>
  );
}
