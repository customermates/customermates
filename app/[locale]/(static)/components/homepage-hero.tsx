import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Google,
  GoogleCalendar,
  Instagram,
  Linkedin,
  Mail,
  Messenger,
  Outlook,
  OutlookCalendar,
  Telegram,
  Whatsapp,
  XTwitter,
} from "@/components/icons/channel-icon";
import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { cn } from "@/core/utils/cn";

import { HeroDemoIframe } from "./hero-demo-iframe";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  heroSection: Hero;
};

const CHANNELS = [
  { name: "LinkedIn", mark: <Linkedin size={22} />, concept: false },
  { name: "Instagram", mark: <Instagram size={22} />, concept: false },
  { name: "WhatsApp", mark: <Whatsapp size={22} />, concept: false },
  { name: "Telegram", mark: <Telegram size={22} />, concept: false },
  { name: "Gmail", mark: <Google size={22} />, concept: false },
  { name: "Outlook", mark: <Outlook size={22} />, concept: false },
  { name: "IMAP", mark: <Mail size={22} />, concept: false },
  { name: "Google Calendar", mark: <GoogleCalendar size={22} />, concept: false },
  { name: "Outlook Calendar", mark: <OutlookCalendar size={22} />, concept: false },
  { name: "X / Twitter", mark: <XTwitter size={22} />, concept: true },
  { name: "Messenger", mark: <Messenger size={22} />, concept: true },
];

export function HomepageHero({ heroSection }: Props) {
  return (
    <section className="marketing-section-flush border-b border-border pt-0" id="hero">
      <MarketingContainer>
        <div className="flex flex-col items-center pt-16 pb-14 text-center sm:pt-24 sm:pb-20">
          <AgplGithubBadge />

          <h1 className="text-display m-0 mt-7 max-w-6xl">
            {/* eslint-disable react/jsx-newline */}
            {heroSection.title}{" "}
            {heroSection.titleAccent ? (
              <span className="font-normal italic" style={{ fontFamily: "var(--font-serif)" }}>
                {heroSection.titleAccent}
              </span>
            ) : null}
            {/* eslint-enable react/jsx-newline */}
          </h1>

          <p className="text-lede mt-8">{heroSection.subtitle}</p>

          <ul aria-hidden className="mt-9 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
            {CHANNELS.map((channel) => (
              <li
                key={channel.name}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border bg-card sm:size-10",
                  channel.concept ? "border-dashed border-border-strong opacity-45 grayscale" : "border-border",
                )}
                data-channel-status={channel.concept ? "concept" : "supported"}
              >
                {channel.mark}
              </li>
            ))}
          </ul>

          <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <AppLink href={heroSection.buttonLeftHref}>{heroSection.buttonLeftText}</AppLink>
            </Button>

            <Button asChild size="lg" variant="secondary">
              {heroSection.buttonRightHref.startsWith("#") ? (
                <a href={heroSection.buttonRightHref}>
                  {heroSection.buttonRightText}

                  <ChevronDown className="size-4" />
                </a>
              ) : (
                <AppLink external href={heroSection.buttonRightHref}>
                  {heroSection.buttonRightText}
                </AppLink>
              )}
            </Button>
          </div>

          <p className="text-meta mt-6">{heroSection.startFree}</p>
        </div>

        <div className="pb-20 sm:pb-28">
          <HeroDemoIframe />
        </div>
      </MarketingContainer>
    </section>
  );
}
