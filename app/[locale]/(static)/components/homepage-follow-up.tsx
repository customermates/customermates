import type { HomepageFollowUp as HomepageFollowUpContent } from "@/core/fumadocs/schemas/homepage";

import type { CSSProperties } from "react";

import { ArrowLeft, ArrowRight, Bot, Clock, FilePen, Pencil, Send, Trash2, Zap } from "lucide-react";

import { FOLLOW_UP_ANIM, FOLLOW_UP_CSS, at } from "./homepage-follow-up-motion";
import { Google, Linkedin } from "@/components/icons/channel-icon";
import { InView } from "@/components/marketing/in-view";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";
import { MateOrb } from "@/components/mate/mate-orb";
import { cn } from "@/core/utils/cn";

type Review = HomepageFollowUpContent["review"];
type Draft = Review["drafts"]["sent"];

const WORD_STEP = 0.08;

function StepCaption({
  index,
  start,
  step,
}: {
  index: number;
  start: number;
  step: HomepageFollowUpContent["steps"][number];
}) {
  return (
    <div className="hfu-at mb-4 flex gap-3 text-left" style={at(start)}>
      <span
        aria-hidden
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-medium text-foreground tabular-nums"
      >
        {index}
      </span>

      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight text-foreground">{step.title}</p>

        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.description}</p>
      </div>
    </div>
  );
}

function Arrow({ t }: { t: number }) {
  return (
    <span aria-hidden className="hfu-at mx-auto hidden lg:mt-24 lg:block" style={at(t)}>
      <ArrowRight className="hfu-pulse size-5 text-muted-foreground" />
    </span>
  );
}

function SayItOnce({ prompt, t0 }: { prompt: HomepageFollowUpContent["prompt"]; t0: number }) {
  const words = prompt.text.split(" ");
  const sent = t0 + words.length * WORD_STEP + 0.3;

  return (
    <figure className="homepage-spotlight text-left">
      <blockquote className="homepage-spotlight-body min-h-[5.25rem] text-[0.9375rem] leading-7 text-foreground">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="hfu-at" style={at(t0 + index * WORD_STEP)}>
            {`${word} `}
          </span>
        ))}
      </blockquote>

      <div className="homepage-spotlight-footer">
        <span className="homepage-spotlight-to">{prompt.from}</span>

        <span className="homepage-agent-chip homepage-agent-chip-active">
          <MateOrb />

          {prompt.agent}
        </span>

        <span aria-hidden className="homepage-spotlight-send hfu-at ml-auto" style={at(sent)}>
          <Send className="size-3.5" />
        </span>
      </div>
    </figure>
  );
}

const STEP_ICONS = { agent: Bot, draft: FilePen, when: Zap } as const;
const STEP_ORDER = ["when", "agent", "draft"] as const;

function AutomationCard({
  active,
  agent,
  automation,
  start,
}: {
  active: number;
  agent: string;
  automation: HomepageFollowUpContent["automation"];
  start: number;
}) {
  return (
    <div className="homepage-desk-window text-left">
      <div className="homepage-desk-thread-head">
        <span aria-hidden className="mk-icon-tile">
          <Zap className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-medium text-foreground">{automation.title}</p>

          <p className="truncate text-xs text-muted-foreground">{automation.subtitle}</p>
        </div>

        <span className="hfu-toggle">
          <i aria-hidden />

          {automation.inactive}

          <span className="hfu-toggle hfu-toggle-on hfu-at" style={at(active)}>
            <i aria-hidden />

            {automation.active}
          </span>
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {STEP_ORDER.map((kind, index) => {
          const Icon = STEP_ICONS[kind];

          return (
            <div key={kind} className="hfu-at" style={at(start + index * 0.6)}>
              {index > 0 ? <div aria-hidden className="hfu-link" /> : null}

              <div className="hfu-node">
                <p className="hfu-node-kind">
                  {kind === "agent" ? <MateOrb className="size-3.5" /> : <Icon aria-hidden className="size-3.5" />}

                  {automation.kinds[kind]}

                  {kind === "agent" ? <span className="hfu-tag">{agent}</span> : null}
                </p>

                <p className="hfu-node-text">{automation.steps[kind]}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type DeckCardProps = {
  anim: string;
  badge: string;
  draft: Draft;
  resting: boolean;
  stamp?: { anim: string; kind: "later" | "sent"; label: string };
};

function DeckCard({ anim, badge, draft, resting, stamp }: DeckCardProps) {
  const Icon = draft.channel === "linkedin" ? Linkedin : Google;

  return (
    <div
      aria-hidden={!resting || undefined}
      className={cn("hfu-card hfu-loop", !resting && "hfu-transient")}
      style={{ animationName: anim } as CSSProperties}
    >
      {stamp ? (
        <span className="hfu-stamp hfu-loop" data-kind={stamp.kind} style={{ animationName: stamp.anim }}>
          {stamp.label}
        </span>
      ) : null}

      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0" size={16} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-medium text-foreground">{draft.name}</p>

          <p className="truncate text-xs text-muted-foreground">{draft.company}</p>
        </div>

        <span className="homepage-desk-draft-badge">
          <MateOrb className="size-3.5" />

          {badge}
        </span>
      </div>

      <div className="hfu-draft-box">{draft.text}</div>
    </div>
  );
}

function DraftDeck({ review }: { review: Review }) {
  const lastCount = review.counts.length - 1;

  return (
    <div className="homepage-desk-window text-left">
      <div className="homepage-desk-thread-head">
        <p className="flex-1 text-[0.8125rem] font-semibold text-foreground">{review.title}</p>

        <span className="hfu-swap text-xs text-muted-foreground">
          {review.counts.map((count, index) => (
            <span
              key={FOLLOW_UP_ANIM.count[index]}
              className={cn("hfu-at", index < lastCount && "hfu-transient")}
              style={{ animationName: FOLLOW_UP_ANIM.count[index] }}
            >
              {count}
            </span>
          ))}
        </span>
      </div>

      <div className="px-4 pt-4 pb-5 sm:px-5">
        <div className="hfu-deck">
          <DeckCard resting anim={FOLLOW_UP_ANIM.next} badge={review.badge} draft={review.drafts.next} />

          <DeckCard
            anim={FOLLOW_UP_ANIM.later}
            badge={review.badge}
            draft={review.drafts.later}
            resting={false}
            stamp={{ anim: FOLLOW_UP_ANIM.laterStamp, kind: "later", label: review.later }}
          />

          <DeckCard
            anim={FOLLOW_UP_ANIM.sent}
            badge={review.badge}
            draft={review.drafts.sent}
            resting={false}
            stamp={{ anim: FOLLOW_UP_ANIM.sentStamp, kind: "sent", label: review.sent }}
          />
        </div>

        <div aria-hidden className="hfu-actions">
          <span className="hfu-action" data-kind="delete">
            <Trash2 className="size-4" />
          </span>

          <span className="hfu-action">
            <Clock className="size-4" />
          </span>

          <span className="hfu-action" data-kind="send">
            <Send className="size-4" />
          </span>

          <span className="hfu-action">
            <Pencil className="size-4" />
          </span>
        </div>

        <p className="hfu-hint">{review.hint}</p>
      </div>
    </div>
  );
}

export function HomepageFollowUp({ followUp }: { followUp: HomepageFollowUpContent }) {
  const [say, build, review] = followUp.steps;

  return (
    <MarketingSection className="mk-section" id="follow-up">
      <style>{FOLLOW_UP_CSS}</style>

      <SectionHeader description={followUp.description} eyebrow={followUp.eyebrow} title={followUp.title} />

      <div className="mx-auto mt-12 max-w-[76rem]">
        <div aria-label={followUp.label} className="mk-stage homepage-desk-stage" role="group">
          <InView
            amount={0.3}
            className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4"
          >
            <div className="min-w-0">
              <StepCaption index={1} start={0} step={say} />

              <SayItOnce prompt={followUp.prompt} t0={0.3} />
            </div>

            <Arrow t={2.7} />

            <div className="min-w-0">
              <StepCaption index={2} start={2.9} step={build} />

              <div className="hfu-at" style={at(3)}>
                <AutomationCard
                  active={5.1}
                  agent={followUp.prompt.agent}
                  automation={followUp.automation}
                  start={3.3}
                />
              </div>
            </div>

            <Arrow t={5.4} />

            <div className="min-w-0">
              <StepCaption index={3} start={5.6} step={review} />

              <div className="hfu-at" style={at(5.7)}>
                <DraftDeck review={followUp.review} />

                <div aria-hidden className="hfu-swipes">
                  <span
                    className="hfu-swipe hfu-at"
                    data-dir="right"
                    style={{ animationName: FOLLOW_UP_ANIM.hintRight }}
                  >
                    {followUp.review.swipeRight}

                    <ArrowRight className="size-3.5" />
                  </span>

                  <span className="hfu-swipe hfu-at" data-dir="left" style={{ animationName: FOLLOW_UP_ANIM.hintLeft }}>
                    <ArrowLeft className="size-3.5" />

                    {followUp.review.swipeLeft}
                  </span>
                </div>
              </div>
            </div>
          </InView>
        </div>
      </div>
    </MarketingSection>
  );
}
