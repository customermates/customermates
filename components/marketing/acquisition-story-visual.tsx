import type { ReactNode } from "react";

import { ArrowRight, Boxes, Code2, Database, MousePointer2, Send, Server } from "lucide-react";

import type { BrandIllustrationBrief } from "@/components/marketing/visuals/visual-contract";
import type { ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
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

function Artboard({ brief, children }: Pick<Props, "brief"> & { children: ReactNode }) {
  return (
    <VisualArtboard
      aria-label={brief.takeaway}
      className="aspect-[5/4] min-h-[25rem] border border-border bg-sidebar shadow-[0_28px_80px_-56px_rgba(0,0,0,0.75)] sm:min-h-0"
      data-acquisition-visual={brief.id}
      data-story-pathway={brief.pathway}
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

function DeploymentVisual({ brief }: Props) {
  const labels = brief.semanticLabels.map(({ text }) => text);
  const supports = brief.supportingSubjects.filter(
    (subject) => subject.form === "context-card" || subject.form === "agent-cue",
  );

  function supportCopy(id: string, index: number) {
    if (id.includes("postgres")) {
      return {
        detail: "PostgreSQL 16",
        icon: Database,
        label: labels.find((label) => /postgres/iu.test(label)) ?? "PostgreSQL",
      };
    }
    if (id.includes("source")) {
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

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[8%] inset-y-[10%] z-10 flex flex-col justify-center">
        <div className="rounded-card border border-border-strong bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
              <Boxes aria-hidden className="size-5" />
            </span>

            <div>
              <p className="text-meta">Docker Compose</p>

              <p className="mt-1 font-medium">{brief.focalLabel?.text ?? "Customermates"}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {supports.map((subject, index) => {
              const copy = supportCopy(subject.id, index);
              const SupportIcon = copy.icon;

              return (
                <div
                  key={subject.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                    <SupportIcon aria-hidden className="size-4" />
                  </span>

                  <div className="min-w-0">
                    <p className="text-xs font-medium">{copy.label}</p>

                    <p className="mt-1 text-[10px] text-muted-foreground">{copy.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[10px] font-medium text-muted-foreground shadow-sm">
          <Server aria-hidden className="size-3.5" />

          {brief.takeaway}
        </div>
      </div>
    </Artboard>
  );
}

function InboxVisual({ brief }: Props) {
  const fixtureId = brief.focalSubject.fixtures?.providerSet;
  if (!fixtureId) throw new Error(`${brief.id} needs a provider-set fixture`);
  const providers = VISUAL_PROVIDER_SET_FIXTURES[fixtureId].providers;

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[7%] top-[9%] z-10 flex flex-wrap justify-center gap-2 sm:gap-3">
        {providers.map((provider) => (
          <span
            key={provider}
            className="grid size-10 place-items-center rounded-full border border-border bg-card shadow-sm sm:size-11"
          >
            <ProviderMark provider={provider} size={20} />
          </span>
        ))}
      </div>

      <div className="absolute inset-x-[10%] bottom-[10%] z-20 overflow-hidden rounded-card border border-border-strong bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:inset-x-[15%] sm:p-6">
        <p className="text-meta">{brief.focalLabel?.text}</p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <PersonIdentity person="anna-mueller" size={40} />

          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
            {brief.semanticLabels[0]?.text}
          </span>
        </div>

        <div className="-mx-5 mt-5 border-t border-border px-5 pt-4 sm:-mx-6 sm:px-6">
          <ProviderIdentity className="text-[10px]" iconSize={16} provider="gmail" />

          <div aria-hidden className="mt-3 space-y-2">
            <div className="h-1.5 w-[88%] rounded-full bg-placeholder" />

            <div className="h-1.5 w-[62%] rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </Artboard>
  );
}

const BOARD_STATUSES = ["deal-open", "deal-won", "deal-lost"] as const;

function recordForStatus(records: readonly VisualRecordFixtureId[], status: (typeof BOARD_STATUSES)[number]) {
  return records.find((record) => VISUAL_RECORD_FIXTURES[record].status === status);
}

function PipelineVisual({ brief, locale }: Props) {
  const fixtureId = brief.focalSubject.fixtures?.dealBoard;
  if (!fixtureId) throw new Error(`${brief.id} needs a deal-board fixture`);
  const board = VISUAL_DEAL_BOARD_FIXTURES[fixtureId];

  return (
    <Artboard brief={brief}>
      <div className="absolute inset-x-[5%] inset-y-[8%] z-10 grid grid-cols-3 gap-2 sm:gap-3">
        {BOARD_STATUSES.map((status) => {
          const record = recordForStatus(board.records, status);

          return (
            <div key={status} className="min-w-0 border-l border-border pl-2 sm:pl-3">
              <div className="border-b border-border pb-3">
                <span
                  className={`block size-1.5 rounded-full ${
                    status === "deal-open" ? "bg-warning" : status === "deal-won" ? "bg-success" : "bg-destructive"
                  }`}
                />
              </div>

              {record ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card p-2.5 shadow-sm sm:p-3">
                  <NativeRecordIdentity locale={locale} record={record} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-[18%] bottom-[7%] z-20 rounded-xl border border-border-strong bg-card px-4 py-3 shadow-xl shadow-black/10 dark:shadow-black/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-meta">{brief.focalLabel?.text}</p>

            <p className="mt-1 text-xs font-medium">{brief.takeaway}</p>
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
      <div className="absolute left-[7%] top-[12%] z-10 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
        <NativeAgentProviderIdentity iconSize={19} provider={agent.agentProvider} />
      </div>

      <ArrowRight aria-hidden className="absolute left-[31%] top-[18%] z-10 size-5 text-border-strong sm:left-[29%]" />

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
