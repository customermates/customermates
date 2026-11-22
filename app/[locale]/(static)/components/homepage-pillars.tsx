import type { CSSProperties, ReactNode } from "react";
import { MateOrb } from "@/components/mate/mate-orb";
import type { HomepagePillars as HomepagePillarsContent } from "@/core/fumadocs/schemas/homepage";

import { BookOpen, Bot, Database, Inbox } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";
import { Google, Instagram, Linkedin, Outlook, Telegram, Whatsapp } from "@/components/icons/channel-icon";

import { HomepageMateBubble } from "./homepage-mate-bubble";

const AGENT_LOGOS = ["claude", "chatgpt", "cursor"] as const;

const CHANNEL_ICONS = [Linkedin, Google, Outlook, Whatsapp, Instagram, Telegram] as const;

type PillarId = "agents" | "data" | "inbox" | "knowledge";

type StackCardProps = {
  bubble: string;
  children: ReactNode;
  description: string;
  icon: ReactNode;
  id: PillarId;
  index: number;
  plan: string;
  title: string;
};

function StackCard({ bubble, children, description, icon, id, index, plan, title }: StackCardProps) {
  return (
    <li className="homepage-stack-card" data-pillar={id} id={id} style={{ "--stack-index": index } as CSSProperties}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span aria-hidden className="mk-icon-tile">
            {icon}
          </span>

          <span className="mk-badge mk-badge-strong">{plan}</span>
        </div>

        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">{title}</h3>

        <p className="mk-body mt-3 max-w-[30rem]">{description}</p>
      </div>

      <div aria-hidden className="homepage-stack-shot">
        <HomepageMateBubble className="-top-4 left-4 sm:left-6">{bubble}</HomepageMateBubble>

        {children}
      </div>
    </li>
  );
}

export function HomepagePillars({ pillars }: { pillars: HomepagePillarsContent }) {
  const { agents, data, inbox, knowledge } = pillars;

  return (
    <MarketingSection className="mk-section" id="pillars">
      <SectionHeader description={pillars.description} eyebrow={pillars.eyebrow} title={pillars.title} />

      <ol className="homepage-stack" data-homepage-stack="">
        <StackCard
          bubble={agents.bubble}
          description={agents.description}
          icon={<Bot className="size-4" />}
          id="agents"
          index={0}
          plan={agents.plan}
          title={agents.title}
        >
          <div className="grid grid-cols-4 gap-2">
            <span data-active className="homepage-stack-tile">
              <MateOrb className="size-6" />
            </span>

            {AGENT_LOGOS.map((provider) => (
              <span key={provider} className="homepage-stack-tile">
                <AiClientLogo className="size-5" provider={provider} />
              </span>
            ))}
          </div>

          <div className="homepage-stack-sheet mt-3">
            {agents.clients.map((client) => (
              <p key={client.name} className="flex items-baseline justify-between gap-3">
                <span className="homepage-stack-sheet-title">{client.name}</span>

                <span className="homepage-stack-line text-right">{client.detail}</span>
              </p>
            ))}
          </div>
        </StackCard>

        <StackCard
          bubble={inbox.bubble}
          description={inbox.description}
          icon={<Inbox className="size-4" />}
          id="inbox"
          index={1}
          plan={inbox.plan}
          title={inbox.title}
        >
          <div className="grid grid-cols-6 gap-2">
            {CHANNEL_ICONS.map((Icon, index) => (
              <span key={Icon.displayName} className="homepage-stack-tile" data-active={index === 0 || undefined}>
                <Icon className="size-4" size={16} />
              </span>
            ))}
          </div>

          <div className="homepage-stack-sheet mt-3">
            <span className="homepage-stack-sheet-title">{inbox.thread.name}</span>

            <span className="homepage-stack-line">{inbox.thread.preview}</span>

            <span className="mk-badge w-fit">{inbox.thread.linkedTo}</span>
          </div>
        </StackCard>

        <StackCard
          bubble={data.bubble}
          description={data.description}
          icon={<Database className="size-4" />}
          id="data"
          index={2}
          plan={data.plan}
          title={data.title}
        >
          <div className="flex flex-wrap gap-1.5">
            {data.lists.map((list, index) => (
              <span key={list} className={index === 0 ? "mk-badge mk-badge-strong" : "mk-badge"}>
                {list}
              </span>
            ))}
          </div>

          <div className="homepage-stack-sheet mt-3">
            <span className="homepage-stack-sheet-title">{data.record.name}</span>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {data.record.fields.map((field) => (
                <div key={field.label} className="min-w-0">
                  <dt className="homepage-stack-line">{field.label}</dt>

                  <dd className="truncate text-xs font-medium text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </StackCard>

        <StackCard
          bubble={knowledge.bubble}
          description={knowledge.description}
          icon={<BookOpen className="size-4" />}
          id="knowledge"
          index={3}
          plan={knowledge.plan}
          title={knowledge.title}
        >
          <div className="homepage-stack-sheet">
            <span className="homepage-stack-sheet-title">{knowledge.doc.title}</span>

            <ul className="grid gap-1.5">
              {knowledge.doc.lines.map((line) => (
                <li key={line} className="homepage-stack-line">
                  {line}
                </li>
              ))}
            </ul>

            <span className="mk-badge w-fit">{knowledge.doc.usedBy}</span>
          </div>
        </StackCard>
      </ol>
    </MarketingSection>
  );
}
