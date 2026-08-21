import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { ArrowUpRight, ChevronDown } from "lucide-react";

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
import { AppLink } from "@/components/shared/app-link";

import { HeroDemoIframe } from "./hero-demo-iframe";

type Props = {
  heroSection: Hero;
};

const CHANNELS = [
  { name: "LinkedIn", mark: <Linkedin size={22} />, status: "supported" },
  { name: "Instagram", mark: <Instagram size={22} />, status: "supported" },
  { name: "WhatsApp", mark: <Whatsapp size={22} />, status: "supported" },
  { name: "Telegram", mark: <Telegram size={22} />, status: "supported" },
  { name: "Gmail", mark: <Google size={22} />, status: "supported" },
  { name: "Outlook", mark: <Outlook size={22} />, status: "supported" },
  { name: "IMAP", mark: <Mail size={22} />, status: "supported" },
  { name: "Google Calendar", mark: <GoogleCalendar size={22} />, status: "supported" },
  { name: "Outlook Calendar", mark: <OutlookCalendar size={22} />, status: "supported" },
  { name: "X / Twitter", mark: <XTwitter size={22} />, status: "concept" },
  { name: "Messenger", mark: <Messenger size={22} />, status: "concept" },
] as const;

export function HomepageHero({ heroSection }: Props) {
  return (
    <section className="w-full border-b border-foreground/15" data-homepage-section="hero">
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1440px] flex-col px-5 sm:px-8">
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center sm:py-24 lg:py-28">
          <AgplGithubBadge />

          <h1 className="mt-7 max-w-[1120px] text-[clamp(2.75rem,6.6vw,6.25rem)] font-medium leading-[0.94] tracking-[-0.055em] text-balance">
            {/* eslint-disable react/jsx-newline */}
            {heroSection.title}{" "}
            {heroSection.titleAccent ? (
              <span className="font-serif font-normal italic tracking-[-0.035em]">{heroSection.titleAccent}</span>
            ) : null}
            {/* eslint-enable react/jsx-newline */}
          </h1>

          <div className="mt-10 w-full max-w-[780px] rounded-[28px] border border-foreground/10 bg-muted/55 p-5 text-left shadow-[0_20px_70px_-48px_rgba(0,0,0,0.8)] sm:p-6">
            <p className="max-w-[680px] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {heroSection.subtitle}
            </p>

            <div className="mt-7 flex items-end justify-between gap-4">
              <ul aria-hidden className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5">
                {CHANNELS.map((channel) => (
                  <li
                    key={channel.name}
                    className={`flex size-8 items-center justify-center rounded-full border bg-background sm:size-9 ${
                      channel.status === "concept"
                        ? "border-dashed border-foreground/35 opacity-45 grayscale"
                        : "border-foreground/10"
                    }`}
                    data-prototype-status={channel.status}
                  >
                    {channel.mark}
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="size-11 shrink-0 rounded-full bg-foreground p-0 text-background hover:bg-foreground/85"
                size="icon-lg"
              >
                <AppLink aria-label={heroSection.buttonLeftText} href={heroSection.buttonLeftHref}>
                  <ArrowUpRight className="size-5" />
                </AppLink>
              </Button>
            </div>
          </div>

          <div className="mt-6 flex w-full max-w-[780px] flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              className="h-11 rounded-full bg-foreground px-6 text-background hover:bg-foreground/85"
              size="lg"
            >
              <AppLink href={heroSection.buttonLeftHref}>
                {heroSection.buttonLeftText}

                <ArrowUpRight className="size-4" />
              </AppLink>
            </Button>

            <Button asChild className="h-11 rounded-full bg-transparent px-6" size="lg" variant="secondary">
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

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{heroSection.startFree}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-5 pb-20 sm:px-8 sm:pb-28">
        <HeroDemoIframe />
      </div>
    </section>
  );
}
