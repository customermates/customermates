import type { CSSProperties, ReactNode } from "react";

import { Layers3, MousePointer2 } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { getVisualDealBoardColumns, type VisualDealBoardColumn } from "./visuals/deal-board-visual-data";
import { NativeStatusBadge, PersonIdentity, ProviderIdentity, ProviderMark } from "./visuals/native-visual-primitives";
import {
  VISUAL_CONVERSATION_FIXTURES,
  VISUAL_DEAL_BOARD_FIXTURES,
  VISUAL_PROVIDER_FIXTURES,
  VISUAL_PROVIDER_SET_FIXTURES,
  VISUAL_RECORD_ASSIGNEE_FIXTURES,
  VISUAL_RECORD_FIXTURES,
} from "./visuals/native-fixtures";
import {
  OMNICHANNEL_PROVIDER_ORDER,
  OMNICHANNEL_SPLIT_GEOMETRY,
  type OmnichannelBox,
} from "./visuals/omnichannel-visual-geometry";
import { type BrandIllustrationBrief, type VisualBrief, validateVisualBrief } from "./visuals/visual-contract";

function DepthPlane({ children, className, depth }: { children: ReactNode; className?: string; depth: 1 | 2 | 3 }) {
  return (
    <div className={className} data-depth-plane={depth}>
      {children}
    </div>
  );
}

function validateConvergeShape(brief: BrandIllustrationBrief) {
  const focalFixtures = brief.focalSubject.form === "record" ? brief.focalSubject.fixtures : undefined;
  const providerSets = brief.supportingSubjects.filter((subject) => subject.form === "provider-set");

  if (
    !focalFixtures?.person ||
    !focalFixtures.conversation ||
    brief.supportingSubjects.length !== 1 ||
    providerSets.length !== 1 ||
    providerSets[0]?.fixtures?.providerSet !== "unified-inbox" ||
    !brief.factReferences.includes("product:conversation-record-association") ||
    !brief.factReferences.includes("product:unified-inbox-channel-set") ||
    brief.accentTarget !== brief.focalSubject.id ||
    !brief.focalLabel ||
    brief.semanticLabels.length !== 2
  ) {
    throw new Error(
      "The email pilot needs one fixture-backed customer record and the approved unified-inbox provider set",
    );
  }
}

function validateHandoffShape(brief: BrandIllustrationBrief) {
  const focalFixtures = brief.focalSubject.form === "signal" ? brief.focalSubject.fixtures : undefined;
  const boards = brief.supportingSubjects.filter((subject) => subject.form === "kanban-board");
  const actions = brief.supportingSubjects.filter((subject) => subject.form === "human-action");

  if (
    !focalFixtures?.person ||
    !focalFixtures.record ||
    !focalFixtures.status ||
    VISUAL_RECORD_ASSIGNEE_FIXTURES[focalFixtures.record] !== focalFixtures.person ||
    focalFixtures.record !== "deal-digital-customer-platform" ||
    brief.supportingSubjects.length !== 2 ||
    boards.length !== 1 ||
    boards[0]?.fixtures?.dealBoard !== "demo-status-board" ||
    actions.length !== 1 ||
    actions[0]?.fixtures?.person !== focalFixtures.person ||
    !brief.factReferences.includes("product:deal-kanban-movement") ||
    !brief.factReferences.includes("product:deal-weighted-values") ||
    brief.accentTarget !== brief.focalSubject.id ||
    !brief.focalLabel ||
    brief.semanticLabels.length !== 2
  )
    throw new Error("The pipeline pilot needs one seeded deal, one seeded board, and one matching human drag action");
}

export function validateFeaturePagePilotVisualBrief(value: unknown): BrandIllustrationBrief {
  const brief = validateVisualBrief(value);
  if (brief.kind !== "brand-illustration") throw new Error("Feature pilot visuals only render brand illustrations");
  if (brief.id.startsWith("golden.")) throw new Error("Feature pilot visuals cannot publish a golden benchmark");
  if (brief.placements.length !== 1 || brief.placements[0] !== "split")
    throw new Error("Feature pilot visuals require the split placement");

  if (brief.pathway === "converge") validateConvergeShape(brief);
  else if (brief.pathway === "handoff") validateHandoffShape(brief);
  else throw new Error("The current feature pilots support only converge and handoff pathways");

  return brief;
}

function AmbientPlane() {
  return (
    <DepthPlane className="pointer-events-none absolute inset-0" depth={1}>
      <div className="absolute -right-[18%] top-[4%] size-[80%] rounded-full bg-primary/15 blur-3xl" />
    </DepthPlane>
  );
}

function boxStyle(box: OmnichannelBox): CSSProperties {
  return {
    height: `${box.height}%`,
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
  };
}

function ConvergePilotVisual({ brief }: { brief: BrandIllustrationBrief }) {
  const focalFixtures = brief.focalSubject.form === "record" ? brief.focalSubject.fixtures : undefined;
  const providerSetSubject = brief.supportingSubjects.find((subject) => subject.form === "provider-set");
  const providerSetId = providerSetSubject?.fixtures?.providerSet;
  const person = focalFixtures?.person;
  const conversationId = focalFixtures?.conversation;
  const recordLabel = brief.focalLabel?.text;
  const conversationLabel = brief.semanticLabels[0]?.text;
  const associationLabel = brief.semanticLabels[1]?.text;
  if (!person || !conversationId || !providerSetId || !recordLabel || !conversationLabel || !associationLabel)
    throw new Error("The validated email pilot lost its fixtures or localized labels");

  const conversation = VISUAL_CONVERSATION_FIXTURES[conversationId];
  const providerSet = VISUAL_PROVIDER_SET_FIXTURES[providerSetId].providers;
  if (
    providerSet.length !== OMNICHANNEL_PROVIDER_ORDER.length ||
    providerSet.some((provider, index) => provider !== OMNICHANNEL_PROVIDER_ORDER[index])
  )
    throw new Error("The unified-inbox provider fixture no longer matches its authored orbit");

  return (
    <>
      <AmbientPlane />

      <DepthPlane className="absolute inset-0" depth={2}>
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full text-border-strong"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {OMNICHANNEL_SPLIT_GEOMETRY.connectors.map(({ provider, source, target }) => (
            <path
              key={provider}
              d={`M ${source.x} ${source.y} L ${target.x} ${target.y}`}
              data-connector-provider={provider}
              data-connector-source={`${source.x},${source.y}`}
              data-connector-target={`${target.x},${target.y}`}
              pathLength="1"
              stroke="currentColor"
              strokeLinecap="butt"
              strokeOpacity={provider === conversation.provider ? "0.88" : "0.52"}
              strokeWidth={provider === conversation.provider ? "1.5" : "1"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {OMNICHANNEL_SPLIT_GEOMETRY.satellites.map(({ box, provider }) => {
          const active = provider === conversation.provider;

          return (
            <span
              key={provider}
              aria-label={VISUAL_PROVIDER_FIXTURES[provider].name}
              className={cn(
                "absolute grid place-items-center rounded-xl border bg-card",
                active ? "border-border-strong shadow-lg shadow-primary/10" : "border-border-strong",
              )}
              data-active-source={active ? "true" : undefined}
              data-visual-subject={`${providerSetSubject.id}.${provider}`}
              style={boxStyle(box)}
            >
              <ProviderMark decorative className="size-[56%]" provider={provider} size={28} />
            </span>
          );
        })}
      </DepthPlane>

      <DepthPlane className="absolute inset-0" depth={3}>
        <div
          className="absolute flex flex-col rounded-card border border-primary/70 bg-card p-[4.5%] shadow-xl shadow-primary/10 ring-1 ring-primary/20"
          data-focal-object="true"
          data-visual-subject={brief.focalSubject.id}
          style={boxStyle(OMNICHANNEL_SPLIT_GEOMETRY.record)}
        >
          <span className="text-[8px] leading-none font-medium tracking-wide text-muted-foreground uppercase sm:text-[9px]">
            {recordLabel}
          </span>

          <PersonIdentity className="mt-[7%]" person={person} size={32} />

          <div
            className="mt-auto rounded-lg border border-border bg-background/80 p-2.5"
            data-native-conversation={conversationId}
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <ProviderIdentity className="text-[8px] sm:text-[9px]" iconSize={15} provider={conversation.provider} />

              <span className="shrink-0 rounded-full bg-primary px-1.5 py-1 text-[7px] leading-none font-medium text-primary-foreground sm:text-[8px]">
                {associationLabel}
              </span>
            </div>

            <span className="mt-2 block text-[7px] font-medium tracking-wide text-muted-foreground uppercase sm:text-[8px]">
              {conversationLabel}
            </span>

            <span className="mt-1 block text-[8px] leading-snug font-medium sm:text-[9px]">
              {conversation.localizedSubject[brief.locale]}
            </span>
          </div>
        </div>
      </DepthPlane>
    </>
  );
}

const PIPELINE_COPY = {
  de: { quantity: "Menge", weight: "Gewichtung" },
  en: { quantity: "Quantity", weight: "Weight" },
} as const;

function KanbanColumn({
  column,
  dealValueLabel,
  focalRecord,
  locale,
  weightedValueLabel,
}: {
  column: VisualDealBoardColumn;
  dealValueLabel: string;
  focalRecord: keyof typeof VISUAL_RECORD_FIXTURES;
  locale: BrandIllustrationBrief["locale"];
  weightedValueLabel: string;
}) {
  return (
    <section
      className="min-w-0 rounded-card border border-border bg-background/65 p-2"
      data-kanban-column={column.id}
      data-kanban-column-count={column.count}
      data-kanban-column-total={column.totalValue}
      data-kanban-column-weighted={column.weightedValue}
    >
      <div className="flex items-center justify-between gap-1">
        <NativeStatusBadge className="h-4 px-1.5 text-[7px]" locale={locale} status={column.id} />

        <span className="flex shrink-0 items-center gap-1 text-[7px] text-muted-foreground">
          <Layers3 aria-hidden="true" className="size-2.5" strokeWidth={1.75} />

          {column.count}
        </span>
      </div>

      <div className="mt-2 space-y-1 border-b border-border pb-2 text-[7px] leading-none sm:text-[8px]">
        <div className="flex items-center justify-between gap-1">
          <span className="text-muted-foreground">{dealValueLabel}</span>

          <span className="font-medium tabular-nums">{column.formattedTotalValue}</span>
        </div>

        <div className="flex items-center justify-between gap-1">
          <span className="text-muted-foreground">{weightedValueLabel}</span>

          <span className="font-medium tabular-nums">{column.formattedWeightedValue}</span>
        </div>

        <div className="flex items-center justify-between gap-1 text-muted-foreground">
          <span>{PIPELINE_COPY[locale].weight}</span>

          <span className="tabular-nums">{column.weight}%</span>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        {column.deals.map((deal) => {
          if (deal.id === focalRecord) {
            return (
              <div
                key={deal.id}
                className="h-[clamp(11.5rem,47vw,12rem)] w-full"
                data-drag-footprint="matched"
                data-drag-source-gap={deal.id}
              />
            );
          }

          return (
            <article
              key={deal.id}
              className="rounded-lg border border-border bg-card p-2"
              data-deal-value={deal.totalValue}
              data-native-record={deal.id}
            >
              <span className="block text-[7px] leading-tight font-medium sm:text-[8px]">{deal.name}</span>

              <span className="mt-1 block text-[7px] tabular-nums text-muted-foreground">
                {deal.formattedTotalValue}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HandoffPilotVisual({ brief }: { brief: BrandIllustrationBrief }) {
  const fixtures = brief.focalSubject.form === "signal" ? brief.focalSubject.fixtures : undefined;
  const dealLabel = brief.focalLabel?.text;
  const dealValueLabel = brief.semanticLabels[0]?.text;
  const weightedValueLabel = brief.semanticLabels[1]?.text;
  if (!fixtures?.person || !fixtures.record || !fixtures.status || !dealLabel || !dealValueLabel || !weightedValueLabel)
    throw new Error("The validated pipeline pilot lost its focal fixtures or localized labels");

  if (fixtures.record !== "deal-digital-customer-platform")
    throw new Error("The pipeline pilot requires its authored focal deal");

  const boardSubject = brief.supportingSubjects.find((subject) => subject.form === "kanban-board");
  const actionSubject = brief.supportingSubjects.find((subject) => subject.form === "human-action");
  const boardId = boardSubject?.fixtures?.dealBoard;
  if (!boardId || !VISUAL_DEAL_BOARD_FIXTURES[boardId] || !actionSubject)
    throw new Error("The validated pipeline pilot lost its board or drag action");

  const focalRecordId = fixtures.record;
  const focalRecord = VISUAL_RECORD_FIXTURES[focalRecordId];
  if (!focalRecord.totalQuantity) throw new Error("The focal pipeline fixture needs quantity detail");

  const columns = getVisualDealBoardColumns(boardId, brief.locale).slice(0, 3);
  const focalDeal = columns.flatMap((column) => column.deals).find((deal) => deal.id === focalRecordId);
  if (!focalDeal) throw new Error("The focal pipeline fixture is missing from the seeded board");
  const copy = PIPELINE_COPY[brief.locale];

  return (
    <>
      <AmbientPlane />

      <DepthPlane className="absolute inset-y-[6%] left-[4%] w-[140%]" depth={2}>
        <div
          className="grid size-full grid-cols-3 gap-[1.25%]"
          data-visual-board={boardId}
          data-visual-subject={boardSubject.id}
        >
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              dealValueLabel={dealValueLabel}
              focalRecord={focalRecordId}
              locale={brief.locale}
              weightedValueLabel={weightedValueLabel}
            />
          ))}
        </div>
      </DepthPlane>

      <DepthPlane className="pointer-events-none absolute inset-0" depth={3}>
        <article
          className="absolute left-[28%] flex h-[clamp(11.5rem,47vw,12rem)] w-[44%] flex-col rounded-card border border-primary/70 bg-card p-3 shadow-xl shadow-primary/15 ring-1 ring-primary/20"
          data-deal-value={focalRecord.totalValue}
          data-drag-footprint="matched"
          data-drag-state="intermediary"
          data-focal-object="true"
          data-native-record={focalRecordId}
          data-native-record-assignee={fixtures.person}
          data-visual-subject={brief.focalSubject.id}
          data-weighted-value={focalRecord.weightedValue}
          style={{ top: "clamp(24%, 8vw, 32%)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] leading-none font-medium tracking-wide text-muted-foreground uppercase sm:text-[9px]">
              {dealLabel}
            </span>

            <NativeStatusBadge className="h-4 px-1.5 text-[7px]" locale={brief.locale} status={fixtures.status} />
          </div>

          <span className="mt-2 block text-[10px] leading-tight font-medium sm:text-xs">{focalRecord.name}</span>

          <div className="mt-2 grid grid-cols-2 gap-2 border-y border-border py-2 text-[7px] sm:text-[8px]">
            <span className="min-w-0">
              <span className="block text-muted-foreground">{dealValueLabel}</span>

              <span className="mt-1 block font-medium tabular-nums">{focalDeal.formattedTotalValue}</span>
            </span>

            <span className="min-w-0">
              <span className="block text-muted-foreground">{weightedValueLabel}</span>

              <span className="mt-1 block font-medium tabular-nums">{focalDeal.formattedWeightedValue}</span>
            </span>
          </div>

          <span className="mt-2 min-w-0 text-[7px] text-muted-foreground sm:text-[8px]">
            <span className="flex items-center gap-1">
              <Layers3 aria-hidden="true" className="size-2.5 shrink-0" strokeWidth={1.75} />

              {copy.quantity}
            </span>

            <span className="mt-1 block font-medium tabular-nums text-foreground">{focalRecord.totalQuantity}</span>
          </span>

          <div className="mt-auto border-t border-border pt-2">
            <PersonIdentity person={fixtures.person} size={22} />
          </div>

          <span
            className="absolute -right-3 -bottom-3 grid size-7 place-items-center rounded-full border border-border-strong bg-foreground text-background shadow-lg"
            data-drag-pointer="true"
            data-visual-subject={actionSubject.id}
          >
            <MousePointer2 aria-hidden="true" className="size-4 fill-current" strokeWidth={1.5} />
          </span>
        </article>
      </DepthPlane>
    </>
  );
}

export function FeaturePagePilotVisual({ brief: value, description }: { brief: VisualBrief; description: string }) {
  const brief = validateFeaturePagePilotVisualBrief(value);

  return (
    <div
      aria-label={description}
      className={cn(
        "relative isolate w-full overflow-hidden bg-sidebar text-foreground",
        brief.pathway === "converge" ? "aspect-square" : "aspect-[4/3]",
      )}
      data-feature-page-pilot-visual={brief.id}
      data-story-pathway={brief.pathway}
      data-story-theme="inherit"
      role="img"
    >
      {brief.pathway === "converge" ? <ConvergePilotVisual brief={brief} /> : null}

      {brief.pathway === "handoff" ? <HandoffPilotVisual brief={brief} /> : null}
    </div>
  );
}
