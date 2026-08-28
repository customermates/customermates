import type { CSSProperties, ReactNode } from "react";
import type { HomepageVisualLabels } from "@/core/fumadocs/schemas/homepage";

import { Check, MousePointer2, Send } from "lucide-react";

import {
  NativeAgentProviderIdentity,
  NativeStatusBadge,
  PersonAvatar,
  PersonIdentity,
  ProviderIdentity,
  ProviderMark,
} from "@/components/marketing/visuals/native-visual-primitives";
import {
  VISUAL_CONVERSATION_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_SET_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  type VisualAgentProviderFixtureId,
  type VisualProviderFixtureId,
  type VisualRecordFixtureId,
} from "@/components/marketing/visuals/native-fixtures";
import { COMPOUND_CONNECTOR_STROKE } from "@/components/marketing/visuals/story-visual-layout";
import { VisualArtboard as MarketingVisualArtboard } from "@/components/marketing/visuals/visual-artboard";
import { cn } from "@/core/utils/cn";
import { formattingTagFor, type ContentLocale } from "@/i18n/locale-registry";

type VisualProps = {
  className?: string;
  labels: HomepageVisualLabels;
  locale: ContentLocale;
};

type VisualArtboardName = "agent-record" | "human-handoff" | "omnichannel-record" | "pipeline";

const STAGE_CROP_CLASSES: Record<VisualArtboardName, string> = {
  "agent-record": "-right-[22%] -top-[38%] rotate-[-12deg]",
  "human-handoff": "-bottom-[72%] -left-[36%] rotate-[14deg]",
  "omnichannel-record": "-right-[24%] -top-[42%] rotate-[-10deg]",
  pipeline: "-top-[46%] left-[34%] rotate-[4deg]",
};

function HomepageVisualArtboard({
  children,
  className,
  label,
  name,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  name: VisualArtboardName;
}) {
  return (
    <MarketingVisualArtboard
      aria-label={label}
      className={cn(
        "[background-image:radial-gradient(circle_at_18%_12%,color-mix(in_oklab,var(--foreground)_6%,transparent),transparent_34%),radial-gradient(circle_at_82%_78%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_42%)]",
        className,
      )}
      data-homepage-visual={name}
    >
      <div
        aria-hidden
        className="absolute inset-0 z-0 opacity-45 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_76%_72%_at_50%_50%,black,transparent_86%)]"
      />

      <div
        aria-hidden
        className={cn(
          "absolute z-0 h-[72%] w-[68%] rounded-full border border-border bg-card/25",
          STAGE_CROP_CLASSES[name],
        )}
      />

      {children}
    </MarketingVisualArtboard>
  );
}

export function HomepageAgentRecordVisual({ className, labels, locale }: VisualProps) {
  const conversation = VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"];
  const person = VISUAL_PERSON_FIXTURES[conversation.person];

  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[31rem] sm:aspect-[8/5] sm:min-h-0", className)}
      label={`${labels.agentActivity}: ${person.name}`}
      name="agent-record"
    >
      <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 800 500">
        <path
          d="M205 138 C292 138 300 218 363 218"
          fill="none"
          stroke="var(--border-strong)"
          strokeLinecap="butt"
          strokeWidth="1.5"
        />

        <path
          d="M437 318 C486 368 571 365 615 325"
          fill="none"
          stroke="var(--border-strong)"
          strokeLinecap="butt"
          strokeWidth="1.5"
        />
      </svg>

      <div className="absolute left-[8%] top-[9%] z-10 rounded-full border border-border bg-card px-3 py-2 shadow-sm sm:left-[10%] sm:top-[20%]">
        <NativeAgentProviderIdentity iconSize={20} provider="claude" />

        <span aria-hidden className="mt-1.5 flex items-center gap-1 pl-7">
          <span className="size-1 rounded-full bg-primary" />

          <span className="size-1 rounded-full bg-primary/65" />

          <span className="size-1 rounded-full bg-primary/30" />
        </span>
      </div>

      <div className="absolute left-[12%] top-[35%] z-10 w-[76%] overflow-hidden rounded-card border border-border bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:left-[36%] sm:top-[24%] sm:w-[46%] sm:p-7">
        <div
          className="-mx-5 flex items-start justify-between gap-4 border-b border-border px-5 pb-5 sm:-mx-7 sm:px-7"
          data-homepage-rules="full-bleed"
        >
          <div>
            <p className="text-meta">{labels.connectedRecord}</p>

            <div className="mt-3 flex items-center gap-3">
              <PersonAvatar person={conversation.person} size={42} />

              <div>
                <p className="font-medium">{person.name}</p>

                <p className="mt-0.5 text-xs text-muted-foreground">{labels.customerRecord}</p>
              </div>
            </div>
          </div>

          <ProviderIdentity className="text-[10px]" iconSize={16} provider={conversation.provider} />
        </div>

        <div className="mt-5 rounded-xl bg-muted p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {labels.latestActivity}
            </p>

            <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />

              {labels.open}
            </span>
          </div>

          <p className="mt-2 text-xs font-medium">{conversation.localizedSubject[locale]}</p>

          <div className="mt-3 space-y-2">
            <div className="h-1.5 w-[88%] rounded-full bg-placeholder" />

            <div className="h-1.5 w-[62%] rounded-full bg-muted" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-[7%] right-[7%] z-20 flex items-center gap-2 rounded-xl border border-border-strong bg-card p-2 shadow-lg sm:bottom-[13%] sm:right-[8%]">
        <span className="grid size-7 place-items-center rounded-lg bg-success/15 text-success">
          <Check aria-hidden className="size-4" strokeWidth={2.25} />
        </span>

        <span className="pr-1 text-xs font-medium">{labels.readyForReview}</span>
      </div>
    </HomepageVisualArtboard>
  );
}

type OrbitPoint = readonly [x: number, y: number];

type OrbitLayout = {
  node: OrbitPoint;
  target: OrbitPoint;
};

type OrbitNode = {
  desktop: OrbitLayout;
  mobile: OrbitLayout;
  provider: VisualProviderFixtureId;
};

const ORBIT_NODES = [
  {
    desktop: { node: [120, 112], target: [275, 245] },
    mobile: { node: [85, 85], target: [126, 260] },
    provider: "gmail",
  },
  {
    desktop: { node: [95, 310], target: [275, 310] },
    mobile: { node: [55, 330], target: [126, 340] },
    provider: "outlook",
  },
  {
    desktop: { node: [220, 552], target: [365, 505] },
    mobile: { node: [160, 660], target: [220, 460] },
    provider: "imap",
  },
  {
    desktop: { node: [500, 62], target: [500, 180] },
    mobile: { node: [300, 55], target: [300, 205] },
    provider: "telegram",
  },
  {
    desktop: { node: [880, 112], target: [725, 245] },
    mobile: { node: [515, 85], target: [474, 260] },
    provider: "linkedin",
  },
  {
    desktop: { node: [905, 310], target: [725, 310] },
    mobile: { node: [545, 330], target: [474, 340] },
    provider: "whatsapp",
  },
  {
    desktop: { node: [780, 552], target: [635, 505] },
    mobile: { node: [440, 660], target: [380, 460] },
    provider: "instagram",
  },
] as const satisfies readonly OrbitNode[];

type OrbitPositionStyle = CSSProperties &
  Record<"--orbit-desktop-x" | "--orbit-desktop-y" | "--orbit-mobile-x" | "--orbit-mobile-y", string>;

function orbitPositionStyle({ desktop, mobile }: OrbitNode): OrbitPositionStyle {
  return {
    "--orbit-desktop-x": `${desktop.node[0] / 10}%`,
    "--orbit-desktop-y": `${(desktop.node[1] / 620) * 100}%`,
    "--orbit-mobile-x": `${mobile.node[0] / 6}%`,
    "--orbit-mobile-y": `${(mobile.node[1] / 760) * 100}%`,
  };
}

function OrbitConnectors() {
  return (
    <>
      <svg
        aria-hidden
        className="absolute inset-0 hidden size-full sm:block"
        preserveAspectRatio="none"
        viewBox="0 0 1000 620"
      >
        {ORBIT_NODES.map(({ desktop, provider }) => (
          <path
            key={provider}
            d={`M${desktop.node.join(" ")} L${desktop.target.join(" ")}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeLinecap="butt"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      <svg
        aria-hidden
        className="absolute inset-0 size-full sm:hidden"
        preserveAspectRatio="none"
        viewBox="0 0 600 760"
      >
        {ORBIT_NODES.map(({ mobile, provider }) => (
          <path
            key={provider}
            d={`M${mobile.node.join(" ")} L${mobile.target.join(" ")}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeLinecap="butt"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </>
  );
}

export function HomepageOmnichannelVisual({ className, label, labels, locale }: VisualProps & { label: string }) {
  const approvedProviders = new Set(VISUAL_PROVIDER_SET_FIXTURES["unified-inbox"].providers);
  const activeConversation = VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"];

  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[34rem] sm:aspect-[8/5] sm:min-h-0", className)}
      label={label}
      name="omnichannel-record"
    >
      <OrbitConnectors />

      {ORBIT_NODES.filter(({ provider }) => approvedProviders.has(provider)).map((orbitNode) => (
        <span
          key={orbitNode.provider}
          className={cn(
            "absolute left-[var(--orbit-mobile-x)] top-[var(--orbit-mobile-y)] z-10 grid size-12 -translate-1/2 place-items-center rounded-full border border-border bg-card shadow-sm sm:left-[var(--orbit-desktop-x)] sm:top-[var(--orbit-desktop-y)] sm:size-14",
            orbitNode.provider === activeConversation.provider
              ? "border-primary/50 ring-4 ring-primary/10"
              : "opacity-75",
          )}
          style={orbitPositionStyle(orbitNode)}
        >
          <ProviderMark provider={orbitNode.provider} size={22} />
        </span>
      ))}

      <div className="absolute left-1/2 top-[27%] z-20 w-[58%] -translate-x-1/2 overflow-hidden rounded-card border border-border bg-card p-4 shadow-xl shadow-black/10 dark:shadow-black/30 sm:top-[29%] sm:w-[45%] sm:p-6">
        <p className="text-meta">{labels.customerRecord}</p>

        <div className="mt-3 flex items-center gap-3">
          <PersonAvatar person="anna-mueller" size={44} />

          <div className="min-w-0">
            <p className="truncate font-medium">{VISUAL_PERSON_FIXTURES["anna-mueller"].name}</p>

            <p className="mt-1 text-xs text-muted-foreground">{labels.connectedRecord}</p>
          </div>
        </div>

        <div className="-mx-4 mt-5 border-t border-border px-4 pt-4 sm:-mx-6 sm:px-6" data-homepage-rules="full-bleed">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {labels.latestActivity}
            </p>

            <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />

              {labels.open}
            </span>
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2">
            <ProviderIdentity className="text-[10px]" iconSize={16} provider={activeConversation.provider} />

            <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

            <p className="min-w-0 truncate text-[11px] font-medium">{activeConversation.localizedSubject[locale]}</p>
          </div>

          <div aria-hidden className="mt-2 space-y-1.5 pl-6">
            <div className="h-1.5 w-full rounded-full bg-placeholder" />

            <div className="h-1.5 w-[68%] rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </HomepageVisualArtboard>
  );
}

const HANDOFF_AGENT_PROVIDERS = [
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[18%]",
    mobile: "left-[6%] top-[10%]",
    provider: "chatgpt",
    y: 90,
  },
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[36%]",
    mobile: "right-[6%] top-[10%]",
    provider: "claude",
    y: 180,
  },
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[54%]",
    mobile: "left-[6%] top-[22%]",
    provider: "cursor",
    y: 270,
  },
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[72%]",
    mobile: "right-[6%] top-[22%]",
    provider: "gemini",
    y: 360,
  },
] as const satisfies readonly {
  desktop: string;
  mobile: string;
  provider: VisualAgentProviderFixtureId;
  y: number;
}[];

export function HomepageHandoffVisual({ className, labels }: VisualProps) {
  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[33rem] sm:aspect-[8/5] sm:min-h-[25rem] xl:min-h-0", className)}
      label={`${labels.draft}. ${labels.humanDecision}.`}
      name="human-handoff"
    >
      <svg
        aria-hidden
        className="absolute inset-0 z-[1] hidden size-full sm:block"
        preserveAspectRatio="none"
        viewBox="0 0 800 500"
      >
        <path
          d={`${HANDOFF_AGENT_PROVIDERS.map(({ y }) => `M232 ${y} C285 ${y} 285 225 320 225`).join(" ")} M320 225 H350`}
          fill="none"
          stroke={COMPOUND_CONNECTOR_STROKE}
          strokeLinecap="butt"
          strokeWidth="1.5"
        />
      </svg>

      <svg
        aria-hidden
        className="absolute inset-0 z-[1] size-full sm:hidden"
        preserveAspectRatio="none"
        viewBox="0 0 600 760"
      >
        <path
          d="M264 76 H300 M336 76 H300 M264 167 H300 M336 167 H300 M300 76 V243"
          fill="none"
          stroke={COMPOUND_CONNECTOR_STROKE}
          strokeLinecap="butt"
          strokeWidth="1.5"
        />
      </svg>

      {HANDOFF_AGENT_PROVIDERS.map(({ desktop, mobile, provider }) => (
        <div
          key={provider}
          className={cn(
            "absolute z-10 w-[38%] -translate-y-1/2 rounded-full border border-border bg-card px-3 shadow-sm sm:w-[23%]",
            provider === "chatgpt"
              ? "flex h-[3.25rem] flex-col items-start justify-center py-2"
              : "flex h-10 items-center py-2",
            mobile,
            desktop,
          )}
        >
          <NativeAgentProviderIdentity className="text-[10px] sm:text-xs" iconSize={18} provider={provider} />

          {provider === "chatgpt" ? (
            <span aria-hidden className="mt-1 flex h-1 items-center gap-1 pl-6">
              <span className="size-1 rounded-full bg-primary" />

              <span className="size-1 rounded-full bg-primary/65" />

              <span className="size-1 rounded-full bg-primary/30" />
            </span>
          ) : null}
        </div>
      ))}

      <div className="absolute left-[8%] top-[32%] z-20 w-[84%] overflow-hidden rounded-card border border-border bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:left-[43.75%] sm:top-[10%] sm:w-[52.25%] sm:p-7">
        <div
          className="-mx-5 flex items-center justify-between gap-3 border-b border-border px-5 pb-4 sm:-mx-7 sm:px-7"
          data-homepage-rules="full-bleed"
        >
          <span className="rounded-md bg-foreground/5 px-2.5 py-1 text-[11px] font-medium">{labels.draft}</span>

          <ProviderIdentity className="text-[10px]" iconSize={16} provider="linkedin" />
        </div>

        <div className="mt-4">
          <p className="text-meta mb-2">{labels.recipient}</p>

          <PersonIdentity person="leon-becker" size={30} />
        </div>

        <div className="mt-5 space-y-2.5">
          <div className="h-1.5 w-[92%] rounded-full bg-placeholder" />

          <div className="h-1.5 w-[76%] rounded-full bg-muted" />

          <div className="h-1.5 w-[54%] rounded-full bg-muted" />
        </div>

        <div
          className="-mx-5 mt-6 flex items-center justify-between gap-3 border-t border-border px-5 pt-4 sm:-mx-7 sm:px-7"
          data-homepage-rules="full-bleed"
        >
          <span className="min-w-0">
            <span className="text-[9px] text-muted-foreground">{labels.humanDecision}</span>

            <PersonIdentity className="mt-1 max-w-32" person="max-bergmann" size={28} />
          </span>

          <span className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
            {labels.reviewAndSend}

            <Send aria-hidden className="size-3.5" />
          </span>
        </div>
      </div>
    </HomepageVisualArtboard>
  );
}

const currencyFormatters = new Map<ContentLocale, Intl.NumberFormat>();

function formatMoney(locale: ContentLocale, amount: number) {
  let formatter = currencyFormatters.get(locale);

  if (!formatter) {
    formatter = new Intl.NumberFormat(formattingTagFor(locale), {
      currency: "EUR",
      maximumFractionDigits: 0,
      notation: "compact",
      style: "currency",
    });
    currencyFormatters.set(locale, formatter);
  }

  return formatter.format(amount);
}

function PipelineCard({
  className,
  compact = false,
  labels,
  locale,
  record,
}: {
  className?: string;
  compact?: boolean;
  labels: HomepageVisualLabels;
  locale: ContentLocale;
  record: VisualRecordFixtureId;
}) {
  const fixture = VISUAL_RECORD_FIXTURES[record];

  return (
    <div
      className={cn("overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm", className)}
      data-native-record={record}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[11px] leading-snug font-medium sm:text-xs">{fixture.name}</p>

        <NativeStatusBadge
          className={compact ? "hidden md:inline-flex" : "hidden sm:inline-flex"}
          locale={locale}
          status={fixture.status}
        />
      </div>

      <div
        className={cn("-mx-3 mt-3 grid-cols-2 gap-2 border-y border-border p-3", compact ? "hidden md:grid" : "grid")}
        data-homepage-rules="full-bleed"
      >
        <div>
          <p className="text-[8px] leading-tight text-muted-foreground uppercase sm:text-[9px]">{labels.dealValue}</p>

          <p className="mt-1 text-[10px] font-medium tabular-nums sm:text-xs">
            {formatMoney(locale, fixture.totalValue)}
          </p>
        </div>

        <div>
          <p className="text-[8px] leading-tight text-muted-foreground uppercase sm:text-[9px]">
            {labels.weightedValue}
          </p>

          <p className="mt-1 text-[10px] font-medium tabular-nums sm:text-xs">
            {formatMoney(locale, fixture.weightedValue)}
          </p>
        </div>
      </div>

      <div className={cn("mt-3 items-center justify-between", compact ? "hidden md:flex" : "flex")}>
        <PersonAvatar decorative person={fixture.assignee} size={24} />

        <span className="text-[9px] text-muted-foreground">{VISUAL_PERSON_FIXTURES[fixture.assignee].name}</span>
      </div>
    </div>
  );
}

const PIPELINE_RECORDS = {
  active: "deal-digital-customer-platform",
  lost: "deal-process-automation",
  open: "deal-data-analytics",
  won: "deal-crm-rollout",
} as const satisfies Record<string, VisualRecordFixtureId>;

export function HomepagePipelineVisual({ className, labels, locale }: VisualProps) {
  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[35rem] sm:aspect-[8/5] sm:min-h-0", className)}
      label={`${labels.pipeline}: ${VISUAL_RECORD_FIXTURES[PIPELINE_RECORDS.active].name}`}
      name="pipeline"
    >
      <div className="absolute inset-x-[5%] inset-y-[8%] grid grid-cols-3 gap-2 sm:inset-x-[7%] sm:gap-4">
        {[
          { label: labels.open, status: "deal-open" as const },
          { label: labels.won, status: "deal-won" as const },
          { label: labels.lost, status: "deal-lost" as const },
        ].map(({ label, status }) => (
          <div key={status} className="min-w-0 border-l border-border pl-2 sm:pl-4">
            <div
              className="-ml-2 flex items-center gap-2 border-b border-border pb-3 pl-2 sm:-ml-4 sm:pl-4"
              data-homepage-rules="full-bleed"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "deal-open" && "bg-warning",
                  status === "deal-won" && "bg-success",
                  status === "deal-lost" && "bg-destructive",
                )}
              />

              <span className="truncate text-[10px] font-medium sm:text-xs">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <PipelineCard
        compact
        className="absolute left-[8%] top-[24%] z-10 w-[27%] brightness-75 saturate-50 sm:left-[9%] sm:w-[25%]"
        labels={labels}
        locale={locale}
        record={PIPELINE_RECORDS.open}
      />

      <PipelineCard
        compact
        className="absolute left-[38%] top-[20%] z-10 w-[25%] brightness-[0.7] saturate-50 sm:left-[39%]"
        labels={labels}
        locale={locale}
        record={PIPELINE_RECORDS.won}
      />

      <PipelineCard
        compact
        className="absolute right-[7%] top-[28%] z-10 w-[26%] brightness-50 saturate-50"
        labels={labels}
        locale={locale}
        record={PIPELINE_RECORDS.lost}
      />

      <PipelineCard
        className="absolute left-[27%] top-[52%] z-20 w-[46%] border-border shadow-xl shadow-black/10 dark:shadow-black/30 sm:left-[27%] sm:top-[46%] sm:w-[46%]"
        labels={labels}
        locale={locale}
        record={PIPELINE_RECORDS.active}
      />

      <MousePointer2
        aria-hidden
        className="absolute bottom-[10%] left-[66%] z-30 size-7 fill-card text-foreground drop-shadow-md sm:bottom-[13%] sm:left-[64%] sm:size-8"
        strokeWidth={1.5}
      />
    </HomepageVisualArtboard>
  );
}
