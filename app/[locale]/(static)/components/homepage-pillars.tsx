import type { ReactNode } from "react";
import type { HomepagePillars as HomepagePillarsContent } from "@/core/fumadocs/schemas/homepage";

import { BookOpen, Bot, Database, Inbox } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageMateLogo } from "./homepage-mate-logo";
import { HomepageOsController } from "./homepage-os-controller";
import { SectionHeader } from "@/components/marketing/section-header";
import { Google, Instagram, Linkedin, Outlook, Telegram, Whatsapp } from "@/components/icons/channel-icon";

const AGENT_LOGOS = ["claude", "chatgpt", "cursor"] as const;

const CHANNEL_ICONS = [Linkedin, Google, Outlook, Whatsapp, Instagram, Telegram] as const;

type PillarId = "agents" | "data" | "inbox" | "knowledge";

const PILLAR_ORDER = ["agents", "inbox", "data", "knowledge"] as const satisfies readonly PillarId[];

function PillarRow({
  description,
  icon,
  id,
  index,
  plan,
  title,
}: {
  description: string;
  icon: ReactNode;
  id: PillarId;
  index: number;
  plan: string;
  title: string;
}) {
  return (
    <li className="homepage-os-row" data-pillar-row={id} id={id}>
      <button className="homepage-os-hit" type="button">
        <span className="sr-only">{title}</span>
      </button>

      <span aria-hidden className="homepage-os-index">
        {`0${index}`}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span aria-hidden className="mk-icon-tile size-7">
            {icon}
          </span>

          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>

          <span className="mk-badge">{plan}</span>
        </div>

        <p className="mt-2 max-w-[30rem] text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}

function Plane({ children, id, label }: { children: ReactNode; id: PillarId; label: string }) {
  return (
    <div className="homepage-os-plane" data-plane={id}>
      <span className="homepage-os-plane-label">{label}</span>

      {children}
    </div>
  );
}

function Bars({ count, highlight }: { count: number; highlight?: number }) {
  return (
    <span className="grid gap-[7px]">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="homepage-os-bar"
          data-highlight={index === highlight || undefined}
          style={{ width: `${88 - index * 17}%` }}
        />
      ))}
    </span>
  );
}

function OsStack({ pillars }: { pillars: HomepagePillarsContent }) {
  const { agents, data, inbox, knowledge } = pillars;

  return (
    <div aria-hidden className="homepage-os-scene">
      <div className="homepage-os-stack">
        <Plane id="knowledge" label={knowledge.title}>
          <div className="homepage-os-sheet">
            <span className="homepage-os-sheet-title">{knowledge.doc.title}</span>

            <Bars count={3} highlight={0} />
          </div>
        </Plane>

        <Plane id="data" label={data.title}>
          <div className="flex gap-1.5">
            {data.lists.map((list, index) => (
              <span key={list} className="homepage-os-chip" data-active={index === 0 || undefined}>
                {list}
              </span>
            ))}
          </div>

          <div className="homepage-os-sheet mt-2.5">
            <span className="homepage-os-sheet-title">{data.record.name}</span>

            <Bars count={2} />
          </div>
        </Plane>

        <Plane id="inbox" label={inbox.title}>
          <div className="grid grid-cols-6 gap-1.5">
            {CHANNEL_ICONS.map((Icon) => (
              <span key={Icon.displayName} className="homepage-os-tile">
                <Icon className="size-4" size={16} />
              </span>
            ))}
          </div>

          <div className="homepage-os-sheet mt-2.5">
            <span className="homepage-os-sheet-title">{inbox.thread.name}</span>

            <Bars count={1} />
          </div>
        </Plane>

        <Plane id="agents" label={agents.title}>
          <div className="grid grid-cols-4 gap-2">
            <span data-active className="homepage-os-agent">
              <HomepageMateLogo className="size-7 rounded-[7px]" />
            </span>

            {AGENT_LOGOS.map((provider) => (
              <span key={provider} className="homepage-os-agent">
                <AiClientLogo className="size-6" provider={provider} />
              </span>
            ))}
          </div>
        </Plane>
      </div>
    </div>
  );
}

export function HomepagePillars({ pillars }: { pillars: HomepagePillarsContent }) {
  const { agents, data, inbox, knowledge } = pillars;

  return (
    <MarketingSection className="mk-section" id="pillars">
      <SectionHeader description={pillars.description} eyebrow={pillars.eyebrow} title={pillars.title} />

      <HomepageOsController
        className="homepage-os mt-16 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16"
        ids={PILLAR_ORDER}
      >
        <ol className="homepage-os-list order-2 lg:order-1">
          <PillarRow
            description={agents.description}
            icon={<Bot className="size-4" />}
            id="agents"
            index={1}
            plan={agents.plan}
            title={agents.title}
          />

          <PillarRow
            description={inbox.description}
            icon={<Inbox className="size-4" />}
            id="inbox"
            index={2}
            plan={inbox.plan}
            title={inbox.title}
          />

          <PillarRow
            description={data.description}
            icon={<Database className="size-4" />}
            id="data"
            index={3}
            plan={data.plan}
            title={data.title}
          />

          <PillarRow
            description={knowledge.description}
            icon={<BookOpen className="size-4" />}
            id="knowledge"
            index={4}
            plan={knowledge.plan}
            title={knowledge.title}
          />
        </ol>

        <div className="order-1 lg:order-2">
          <OsStack pillars={pillars} />
        </div>
      </HomepageOsController>
    </MarketingSection>
  );
}
