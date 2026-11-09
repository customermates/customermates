import type { CSSProperties } from "react";
import type { HomepageDesk } from "@/core/fumadocs/schemas/homepage";

import { CheckCircle2, CornerDownRight } from "lucide-react";

import { Linkedin } from "@/components/icons/channel-icon";

import { InView } from "@/components/marketing/in-view";

import { HomepageMateLogo } from "./homepage-mate-logo";

type Props = {
  desk: HomepageDesk;
};

type DeskItem = HomepageDesk["today"]["sections"][number]["items"][number];

function delay(seconds: number): CSSProperties {
  return { "--desk-delay": `${seconds}s` } as CSSProperties;
}

function addedStep(today: HomepageDesk["today"]): DeskItem {
  const items = today.sections.flatMap((section) => section.items);

  return items.find((item) => item.state === "added") ?? items[0];
}

export function HomepageFollowUpDesk({ desk }: Props) {
  const { agent, conversation, draft, today } = desk;
  const step = addedStep(today);

  return (
    <figure data-homepage-desk aria-label={desk.label} className="homepage-desk">
      <InView className="mk-stage homepage-desk-stage">
        <div className="homepage-desk-window homepage-desk-thread">
          <div className="homepage-desk-thread-head">
            <Linkedin className="size-5 shrink-0" size={20} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-medium text-foreground">{conversation.name}</p>

              <p className="truncate text-xs text-muted-foreground">
                {`${conversation.company} · ${conversation.label}`}
              </p>
            </div>

            <span className="text-xs text-muted-foreground tabular-nums">{conversation.time}</span>
          </div>

          <div className="homepage-desk-thread-body">
            <p className="homepage-desk-message desk-reveal" style={delay(0.3)}>
              {conversation.message}
            </p>

            <div className="homepage-desk-draft desk-reveal" style={delay(1)}>
              <p className="homepage-desk-draft-badge">
                <HomepageMateLogo className="size-4 rounded-[4px]" />

                <span className="relative">
                  <span className="desk-intent-working inline-flex items-center gap-1.5">
                    {agent.intent}

                    <span aria-hidden className="homepage-desk-dots">
                      <span />

                      <span />

                      <span />
                    </span>
                  </span>

                  <span className="desk-intent-done absolute inset-0 whitespace-nowrap">{draft.badge}</span>
                </span>
              </p>

              <div className="desk-reveal" style={delay(2.5)}>
                <p className="mt-2.5 text-[0.8125rem] leading-6 text-foreground">{draft.text}</p>

                <div className="mt-3.5 flex items-center justify-end gap-2">
                  <span className="homepage-desk-button">{draft.edit}</span>

                  <span className="homepage-desk-button homepage-desk-button-primary">
                    <CornerDownRight aria-hidden className="size-3.5" />

                    {draft.send}
                  </span>
                </div>
              </div>
            </div>

            <p className="homepage-desk-event desk-reveal" style={delay(3.1)}>
              <span>{agent.done}</span>
            </p>

            <div className="homepage-desk-row homepage-desk-row-added desk-reveal" style={delay(3.4)}>
              <CheckCircle2 aria-hidden className="homepage-desk-row-icon" />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-foreground">{step.title}</span>

                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{step.meta}</span>
              </span>

              <span className="homepage-desk-added-tag">
                <HomepageMateLogo className="size-3 rounded-[3px]" />

                {today.addedBy}
              </span>

              {step.owner ? (
                <span aria-hidden className="homepage-desk-avatar">
                  {step.owner}
                </span>
              ) : (
                <span className="homepage-desk-assign">{today.assign}</span>
              )}
            </div>
          </div>
        </div>
      </InView>
    </figure>
  );
}
