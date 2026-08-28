import type { ReactNode } from "react";

import { Boxes, Code2, ContactRound, Database, Link2, MousePointer2, Send, Server } from "lucide-react";

import { VISUAL_PLACEMENTS, type BrandIllustrationBrief } from "@/components/marketing/visuals/visual-contract";
import { cn } from "@/core/utils/cn";
import { formattingTagFor, type ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_CONVERSATION_FIXTURES,
  VISUAL_DEAL_BOARD_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_SET_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  type VisualRecordFixtureId,
} from "./visuals/native-fixtures";
import {
  NativeAgentProviderIdentity,
  NativeRecordIdentity,
  PersonIdentity,
  ProviderIdentity,
  ProviderMark,
} from "./visuals/native-visual-primitives";
import { VisualArtboard } from "./visuals/visual-artboard";

type Props = {
  brief: BrandIllustrationBrief;
  locale: ContentLocale;
};

type SupportingSubject = BrandIllustrationBrief["supportingSubjects"][number];

function VerticalConnector({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      className={cn("block w-px text-border-strong", className)}
      preserveAspectRatio="none"
      viewBox="0 0 1 1"
    >
      <path
        d="M 0.5 0 C 0.5 0.33 0.5 0.67 0.5 1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Artboard({ brief, children }: Pick<Props, "brief"> & { children: ReactNode }) {
  const missingPlacements = VISUAL_PLACEMENTS.filter((placement) => !brief.placements.includes(placement));

  if (missingPlacements.length > 0)
    throw new Error(`${brief.id} does not support ${missingPlacements.join(", ")} acquisition placement(s)`);

  return (
    <VisualArtboard
      aria-label={brief.takeaway}
      className="aspect-[3/4] min-h-[32rem] sm:aspect-hero sm:min-h-[30rem] lg:aspect-[4/5] lg:min-h-0"
      data-acquisition-responsive-placements="narrow:base wide:sm split:lg"
      data-acquisition-visual={brief.id}
      data-detail-budget="narrow:2 wide:4 split:3"
      data-story-pathway={brief.pathway}
      data-supported-placements={brief.placements.join(" ")}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_82%_80%_at_50%_50%,black,transparent_92%)]"
      />

      <div
        aria-hidden
        className="absolute -right-[22%] -top-[34%] size-[78%] rounded-full border border-border bg-card/30"
      />

      {children}
    </VisualArtboard>
  );
}

function deploymentSupportCopy(subject: SupportingSubject, labels: readonly string[], index: number) {
  if (subject.id.includes("postgres")) {
    return {
      detail: "PostgreSQL 16",
      icon: Database,
      label: labels.find((label) => /postgres/iu.test(label)) ?? "PostgreSQL",
    };
  }
  if (subject.id.includes("source")) {
    return {
      detail: "AGPL-3.0",
      icon: Code2,
      label: labels.find((label) => /agpl|source/iu.test(label)) ?? "AGPL core",
    };
  }
  return {
    detail: "REST · Webhooks · MCP",
    icon: Server,
    label: labels.find((label) => /mcp|client/iu.test(label)) ?? labels[index] ?? "MCP",
  };
}

function DeploymentSupportNode({
  index,
  labels,
  subject,
}: {
  index: number;
  labels: readonly string[];
  subject: SupportingSubject;
}) {
  const copy = deploymentSupportCopy(subject, labels, index);
  const SupportIcon = copy.icon;

  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3"
      data-visual-subject={subject.id}
    >
      {subject.form === "agent-cue" && subject.agentProvider in VISUAL_AGENT_PROVIDER_FIXTURES ? (
        <>
          <NativeAgentProviderIdentity iconSize={18} provider={subject.agentProvider} />

          <span className="ml-auto text-[10px] text-muted-foreground">{copy.label}</span>
        </>
      ) : (
        <>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
            <SupportIcon aria-hidden className="size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{copy.label}</p>

            <p className="mt-1 truncate text-[10px] text-muted-foreground">{copy.detail}</p>
          </div>

          <div aria-hidden className="hidden w-10 shrink-0 space-y-1 sm:block">
            <div className="h-1 rounded-full bg-placeholder" />

            <div className="h-1 w-2/3 rounded-full bg-muted" />
          </div>
        </>
      )}
    </div>
  );
}

function DeploymentVisual({ brief }: Props) {
  const labels = brief.semanticLabels.map(({ text }) => text);
  const supports = brief.supportingSubjects.filter(
    (subject) => subject.form === "context-card" || subject.form === "agent-cue",
  );

  const source = supports.find((subject) => subject.id.includes("source"));
  const database = supports.find((subject) => subject.id.includes("postgres"));
  const client = supports.find((subject) => subject.id.includes("client"));

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[8%] inset-y-[7%] z-10 flex flex-col justify-center">
        {source ? (
          <div className="mx-auto flex w-[86%] flex-col">
            <DeploymentSupportNode index={supports.indexOf(source)} labels={labels} subject={source} />

            <VerticalConnector className="mx-auto h-4" />
          </div>
        ) : null}

        <div
          className="rounded-card border border-border-strong bg-card p-4 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-5"
          data-visual-subject={brief.focalSubject.id}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Boxes aria-hidden className="size-5" />
              </span>

              <div className="min-w-0">
                <p className="text-meta">Docker Compose</p>

                <p className="mt-1 truncate font-medium">{brief.focalLabel?.text ?? "Customermates"}</p>
              </div>
            </div>

            <span className="hidden items-center gap-1 rounded-full border border-border px-2 py-1 text-[9px] text-muted-foreground sm:flex">
              <Server aria-hidden className="size-3" />

              <span aria-hidden className="flex gap-1">
                <span className="size-1.5 rounded-sm bg-primary" />

                <span className="size-1.5 rounded-sm bg-primary/45" />
              </span>
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-primary/25 bg-primary/6 p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <Boxes aria-hidden className="size-4" />
              </span>

              <div aria-hidden className="min-w-0 flex-1 space-y-1.5">
                <div className="h-1.5 w-1/2 rounded-full bg-placeholder" />

                <div className="h-1.5 w-3/4 rounded-full bg-muted" />
              </div>
            </div>
          </div>

          {database ? (
            <>
              <VerticalConnector className="mx-auto h-3" />

              <DeploymentSupportNode index={supports.indexOf(database)} labels={labels} subject={database} />
            </>
          ) : null}
        </div>

        {client ? (
          <div className="mx-auto flex w-[86%] flex-col">
            <VerticalConnector className="mx-auto h-4" />

            <DeploymentSupportNode index={supports.indexOf(client)} labels={labels} subject={client} />
          </div>
        ) : null}
      </div>
    </Artboard>
  );
}

function InboxVisual({ brief }: Props) {
  const fixtureId = brief.focalSubject.fixtures?.providerSet;
  if (!fixtureId) throw new Error(`${brief.id} needs a provider-set fixture`);
  const providers = VISUAL_PROVIDER_SET_FIXTURES[fixtureId].providers;
  const conversationList = brief.supportingSubjects.find((subject) => subject.id === "conversation-list");
  const contactContext = brief.supportingSubjects.find((subject) => subject.id === "contact-context");
  const conversationId = conversationList?.fixtures?.conversation;
  const contactPerson = contactContext?.fixtures?.person;
  if (!conversationList || !contactContext || !conversationId || !contactPerson)
    throw new Error(`${brief.id} needs fixture-bound conversation and contact context`);
  const conversation = VISUAL_CONVERSATION_FIXTURES[conversationId];
  if (conversation.person !== contactPerson)
    throw new Error(`${brief.id} must bind the conversation participant to the contact context`);

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[7%] top-[9%] bottom-[70%] z-10 flex flex-col items-center lg:bottom-[66%]">
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {providers.map((provider, index) => (
            <span
              key={provider}
              className={`${index > 3 ? "hidden sm:grid" : "grid"} size-10 place-items-center rounded-full border border-border bg-card shadow-sm sm:size-11`}
            >
              <ProviderMark provider={provider} size={20} />
            </span>
          ))}
        </div>

        <VerticalConnector className="min-h-3 flex-1" />
      </div>

      <div className="absolute inset-x-[7%] bottom-[7%] top-[30%] z-20 overflow-hidden rounded-card border border-border-strong bg-card shadow-xl shadow-black/10 dark:shadow-black/30 lg:top-[34%] lg:bottom-[14%]">
        <div className="grid size-full grid-rows-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)] sm:grid-rows-1">
          <div className="flex min-h-0 flex-col p-4 sm:p-5" data-visual-subject={conversationList.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-meta">{brief.semanticLabels[0]?.text ?? brief.focalLabel?.text}</p>

              <span className="size-2 rounded-full bg-primary shadow-[0_0_0_4px] shadow-primary/10" />
            </div>

            <div className="mt-auto rounded-xl border border-primary/25 bg-primary/6 p-3">
              <div className="flex items-center justify-between gap-2">
                <PersonIdentity className="max-w-28" person={conversation.person} size={30} />

                <ProviderIdentity className="text-[9px]" iconSize={15} provider={conversation.provider} />
              </div>

              <p className="mt-3 line-clamp-2 text-[10px] leading-snug font-medium">
                {conversation.localizedSubject[brief.locale]}
              </p>
            </div>

            <div className="mt-2 mb-auto hidden items-center gap-2 rounded-lg border border-border bg-background p-2 sm:flex sm:mb-0 lg:mb-auto">
              <ProviderMark provider="outlook" size={15} />

              <div aria-hidden className="min-w-0 flex-1 space-y-1">
                <div className="h-1 w-3/4 rounded-full bg-placeholder" />

                <div className="h-1 w-1/2 rounded-full bg-muted" />
              </div>
            </div>

            <div className="mt-2 mb-auto hidden items-center gap-2 rounded-lg border border-border bg-background p-2 sm:flex lg:hidden">
              <ProviderMark provider="linkedin" size={15} />

              <div aria-hidden className="min-w-0 flex-1 space-y-1">
                <div className="h-1 w-2/3 rounded-full bg-placeholder" />

                <div className="h-1 w-2/5 rounded-full bg-muted" />
              </div>
            </div>
          </div>

          <div
            className="flex flex-col border-t border-border bg-background/45 p-4 sm:border-t-0 sm:border-l sm:p-5"
            data-visual-subject={contactContext.id}
          >
            <p className="text-meta">{brief.semanticLabels[1]?.text}</p>

            <div className="mt-auto pt-3">
              <PersonIdentity person={contactPerson} size={36} />
            </div>

            <div className="mt-4 mb-auto grid grid-cols-2 gap-2 sm:grid-cols-1">
              <span className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[9px] text-muted-foreground">
                <ContactRound aria-hidden className="size-3.5 text-primary" />

                <span aria-hidden className="h-1 w-8 rounded-full bg-placeholder" />
              </span>

              <span className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[9px] text-muted-foreground">
                <Link2 aria-hidden className="size-3.5 text-primary" />

                <span aria-hidden className="h-1 w-6 rounded-full bg-muted" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Artboard>
  );
}

const BOARD_STATUSES = ["deal-open", "deal-won", "deal-lost"] as const;

function recordsForStatus(records: readonly VisualRecordFixtureId[], status: (typeof BOARD_STATUSES)[number]) {
  return records.filter((record) => VISUAL_RECORD_FIXTURES[record].status === status).slice(0, 2);
}

function formatDealValue(record: VisualRecordFixtureId, locale: ContentLocale, kind: "total" | "weighted") {
  const fixture = VISUAL_RECORD_FIXTURES[record];
  const value = kind === "total" ? fixture.totalValue : fixture.weightedValue;

  return new Intl.NumberFormat(formattingTagFor(locale), {
    compactDisplay: "short",
    currency: fixture.currency,
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function PipelineVisual({ brief, locale }: Props) {
  const fixtureId = brief.focalSubject.fixtures?.dealBoard;
  if (!fixtureId) throw new Error(`${brief.id} needs a deal-board fixture`);
  const board = VISUAL_DEAL_BOARD_FIXTURES[fixtureId];

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[5%] top-[7%] bottom-[24%] z-10 grid grid-cols-3 gap-2 sm:gap-3">
        {BOARD_STATUSES.map((status) => {
          const records = recordsForStatus(board.records, status);

          return (
            <div key={status} className="flex min-w-0 flex-col border-l border-border pl-2 sm:pl-3">
              <div className="border-b border-border pb-3">
                <span
                  className={`block size-1.5 rounded-full ${
                    status === "deal-open" ? "bg-warning" : status === "deal-won" ? "bg-success" : "bg-destructive"
                  }`}
                />
              </div>

              <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 py-4">
                {records.map((record, index) => (
                  <div
                    key={record}
                    className={`${index > 0 ? "hidden sm:block" : "block"} overflow-hidden rounded-xl border bg-card p-2.5 sm:p-3 ${
                      status === "deal-open" && index === 0
                        ? "border-primary/35 shadow-lg shadow-primary/10"
                        : "border-border shadow-sm"
                    }`}
                    data-visual-subject={brief.focalSubject.id}
                  >
                    <NativeRecordIdentity locale={locale} record={record} />

                    <div className="mt-3 hidden border-t border-border pt-2 sm:block">
                      <p className="text-[9px] font-medium text-foreground/80">
                        {formatDealValue(record, locale, "total")}
                      </p>

                      <p className="mt-1 hidden text-[8px] text-primary sm:block">
                        {`${brief.semanticLabels[1]?.text}: ${formatDealValue(record, locale, "weighted")}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-[12%] bottom-[6%] z-20 rounded-xl border border-border-strong bg-card px-4 py-3 shadow-xl shadow-black/10 dark:shadow-black/30">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-meta">{brief.focalLabel?.text}</p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {brief.semanticLabels.map(({ text }) => (
                <span key={text} className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-medium text-primary">
                  {text}
                </span>
              ))}
            </div>
          </div>

          <MousePointer2 aria-hidden className="size-5 shrink-0 fill-card text-foreground" strokeWidth={1.5} />
        </div>
      </div>
    </Artboard>
  );
}

function HandoffVisual({ brief }: Props) {
  const agent = brief.supportingSubjects.find((subject) => subject.form === "agent-cue");
  const human = brief.supportingSubjects.find((subject) => subject.form === "human-action");
  const recipient = brief.focalSubject.fixtures?.person;
  const provider = brief.focalSubject.fixtures?.provider;
  if (
    !agent ||
    !(agent.agentProvider in VISUAL_AGENT_PROVIDER_FIXTURES) ||
    !human?.fixtures?.person ||
    !recipient ||
    !provider
  )
    throw new Error(`${brief.id} needs agent, draft, recipient, and human fixtures`);

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[15%] top-[8%] bottom-[75%] z-10 flex flex-col items-center">
        <div className="rounded-full border border-border bg-card px-3 py-2 shadow-sm">
          <NativeAgentProviderIdentity iconSize={19} provider={agent.agentProvider} />
        </div>

        <VerticalConnector className="flex-1" />
      </div>

      <div className="absolute inset-x-[9%] bottom-[9%] top-[25%] z-20 overflow-hidden rounded-card border border-border-strong bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:inset-x-[15%] sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <span className="rounded-md bg-foreground/5 px-2.5 py-1 text-[10px] font-medium">
            {brief.focalLabel?.text}
          </span>

          <ProviderIdentity className="text-[10px]" iconSize={16} provider={provider} />
        </div>

        <div className="mt-4">
          <p className="text-meta">{VISUAL_PERSON_FIXTURES[recipient].name}</p>

          <div aria-hidden className="mt-4 space-y-2.5">
            <div className="h-1.5 w-[92%] rounded-full bg-placeholder" />

            <div className="h-1.5 w-[76%] rounded-full bg-muted" />

            <div className="h-1.5 w-[54%] rounded-full bg-muted" />
          </div>
        </div>

        <div className="-mx-5 mt-5 flex items-center justify-between gap-3 border-t border-border px-5 pt-4 sm:-mx-6 sm:px-6">
          <PersonIdentity className="max-w-32" person={human.fixtures.person} size={28} />

          <span className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
            {brief.semanticLabels[0]?.text}

            <Send aria-hidden className="size-3.5" />
          </span>
        </div>
      </div>
    </Artboard>
  );
}

export function AcquisitionStoryVisual(props: Props) {
  switch (props.brief.focalSubject.form) {
    case "context-card":
      return <DeploymentVisual {...props} />;
    case "provider-set":
      return <InboxVisual {...props} />;
    case "kanban-board":
      return <PipelineVisual {...props} />;
    case "draft":
      return <HandoffVisual {...props} />;
    default:
      throw new Error(`${props.brief.id} uses unsupported focal form ${props.brief.focalSubject.form}`);
  }
}
