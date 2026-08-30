import type { CSSProperties, ReactNode } from "react";

import { Boxes, BriefcaseBusiness, CircleDollarSign, Code2, ContactRound, Database, Send } from "lucide-react";

import { VISUAL_PLACEMENTS, type BrandIllustrationBrief } from "@/components/marketing/visuals/visual-contract";
import { cn } from "@/core/utils/cn";
import { formattingTagFor, type ContentLocale } from "@/i18n/locale-registry";

import {
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_CONVERSATION_FIXTURES,
  VISUAL_DEAL_BOARD_FIXTURES,
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

type Placement = "narrow" | "split" | "wide";

type ConnectorEndpoint = string | readonly string[];

type Connector = {
  d: string;
  source: ConnectorEndpoint;
  target: ConnectorEndpoint;
};

const PLACEMENT_CLASS: Record<Placement, string> = {
  narrow: "absolute inset-0 sm:hidden",
  split: "absolute inset-0 hidden lg:block",
  wide: "absolute inset-0 hidden sm:block lg:hidden",
};

const DETAIL_DENSITY: Record<Placement, string> = {
  narrow: "essential",
  split: "context",
  wide: "full",
};

const VIEW_BOX: Record<Placement, string> = {
  narrow: "0 0 600 800",
  split: "0 0 800 1000",
  wide: "0 0 1000 560",
};

function requiredFocalLabel(brief: BrandIllustrationBrief) {
  if (!brief.focalLabel) throw new Error(`${brief.id} needs a focal label`);
  return brief.focalLabel.text;
}

function requiredSemanticLabel(brief: BrandIllustrationBrief, index: number) {
  const label = brief.semanticLabels[index];
  if (!label) throw new Error(`${brief.id} needs semantic label ${index + 1}`);
  return label.text;
}

function VisualLabel({
  children,
  kind,
  subjectId,
}: {
  children: ReactNode;
  kind: "focal" | "semantic";
  subjectId: string;
}) {
  return (
    <span
      className="text-xs leading-relaxed font-medium"
      data-visual-label={kind}
      data-visual-label-subject={subjectId}
    >
      {children}
    </span>
  );
}

function Scene({ children, placement }: { children: ReactNode; placement: Placement }) {
  return (
    <div
      aria-hidden
      className={PLACEMENT_CLASS[placement]}
      data-detail-density={DETAIL_DENSITY[placement]}
      data-visual-placement={placement}
    >
      {children}
    </div>
  );
}

function ConnectorLayer({ connectors, placement }: { connectors: readonly Connector[]; placement: Placement }) {
  const endpointIds = (endpoint: ConnectorEndpoint) => (typeof endpoint === "string" ? [endpoint] : endpoint).join(" ");

  return (
    <svg
      aria-hidden
      className="absolute inset-0 size-full text-border-strong"
      data-connector-placement={placement}
      preserveAspectRatio="none"
      viewBox={VIEW_BOX[placement]}
    >
      {connectors.map((connector) => (
        <path
          key={`${endpointIds(connector.source)}:${endpointIds(connector.target)}`}
          d={connector.d}
          data-connector-source={endpointIds(connector.source)}
          data-connector-target={endpointIds(connector.target)}
          fill="none"
          stroke="currentColor"
          strokeLinecap="butt"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
      ))}
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
      data-detail-unit="semantic-object"
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

function DeploymentScene({ brief, placement }: Pick<Props, "brief"> & { placement: Placement }) {
  const database = brief.supportingSubjects.find((subject) => subject.id.includes("postgres"));
  const client = brief.supportingSubjects.find((subject) => subject.id.includes("client"));
  if (!database || !client || client.form !== "agent-cue")
    throw new Error(`${brief.id} needs PostgreSQL and MCP-client support subjects`);

  if (!(client.agentProvider in VISUAL_AGENT_PROVIDER_FIXTURES))
    throw new Error(`${brief.id} uses an unavailable AI-client fixture`);

  const focalStyle: CSSProperties =
    placement === "wide"
      ? { left: "34%", top: "19%", width: "32%" }
      : placement === "split"
        ? { left: "10%", top: "35%", width: "80%" }
        : { left: "8%", top: "40%", width: "84%" };
  const databaseStyle: CSSProperties =
    placement === "wide"
      ? { left: "5%", top: "35%", width: "24%" }
      : placement === "split"
        ? { left: "16%", top: "10%", width: "68%" }
        : { left: "12%", top: "11%", width: "76%" };
  const clientStyle: CSSProperties =
    placement === "wide" ? { right: "5%", top: "35%", width: "24%" } : { bottom: "9%", left: "16%", width: "68%" };
  const connectors: Record<Placement, readonly Connector[]> = {
    narrow: [
      {
        d: "M300 176 C300 224 300 280 300 328",
        source: database.id,
        target: brief.focalSubject.id,
      },
    ],
    split: [
      {
        d: "M400 174 C400 240 400 300 400 358",
        source: database.id,
        target: brief.focalSubject.id,
      },
      {
        d: "M400 596 C400 680 400 790 400 858",
        source: brief.focalSubject.id,
        target: client.id,
      },
    ],
    wide: [
      {
        d: "M282 232 C306 232 324 232 348 232",
        source: database.id,
        target: brief.focalSubject.id,
      },
      {
        d: "M652 222 C676 222 694 222 718 222",
        source: brief.focalSubject.id,
        target: client.id,
      },
    ],
  };

  return (
    <Scene placement={placement}>
      <ConnectorLayer connectors={connectors[placement]} placement={placement} />

      <div
        className="absolute z-10 rounded-xl border border-border bg-background p-3 shadow-sm"
        data-detail-id={database.id}
        data-detail-priority={2}
        data-visual-subject={database.id}
        style={databaseStyle}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
            <Database aria-hidden className="size-4" />
          </span>

          <VisualLabel kind="semantic" subjectId={database.id}>
            {requiredSemanticLabel(brief, 0)}
          </VisualLabel>
        </div>
      </div>

      <div
        className="absolute z-20 rounded-card border border-border-strong bg-card p-4 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-5"
        data-detail-id={brief.focalSubject.id}
        data-detail-priority={1}
        data-focal-object="true"
        data-visual-subject={brief.focalSubject.id}
        style={focalStyle}
      >
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Boxes aria-hidden className="size-5" />
          </span>

          <VisualLabel kind="focal" subjectId={brief.focalSubject.id}>
            {requiredFocalLabel(brief)}
          </VisualLabel>
        </div>

        <div aria-hidden className="mt-4 space-y-2.5 rounded-xl border border-primary/25 bg-primary/6 p-4">
          <div className="h-2 w-1/2 rounded-full bg-placeholder" />

          <div className="h-2 w-4/5 rounded-full bg-muted" />

          <div className="h-2 w-2/3 rounded-full bg-muted" />
        </div>
      </div>

      {placement !== "narrow" ? (
        <div
          className="absolute z-10 rounded-xl border border-border bg-background p-3 shadow-sm"
          data-detail-id={client.id}
          data-detail-priority={3}
          data-visual-subject={client.id}
          style={clientStyle}
        >
          <div className="flex items-center justify-between gap-3">
            <NativeAgentProviderIdentity
              className="text-xs"
              iconSize={18}
              provider={client.agentProvider}
              visualSubject={client.id}
            />

            <VisualLabel kind="semantic" subjectId={client.id}>
              {requiredSemanticLabel(brief, 1)}
            </VisualLabel>
          </div>
        </div>
      ) : null}
    </Scene>
  );
}

function DeploymentVisual({ brief }: Props) {
  return (
    <Artboard brief={brief}>
      <DeploymentScene brief={brief} placement="narrow" />

      <DeploymentScene brief={brief} placement="wide" />

      <DeploymentScene brief={brief} placement="split" />
    </Artboard>
  );
}

function OpenSourceScene({ brief, placement }: Pick<Props, "brief"> & { placement: Placement }) {
  const source = brief.supportingSubjects.find((subject) => subject.id.includes("source"));
  const database = brief.supportingSubjects.find((subject) => subject.id.includes("postgres"));
  if (!source || !database) throw new Error(`${brief.id} needs source-code and PostgreSQL support subjects`);

  const focalStyle: CSSProperties =
    placement === "wide"
      ? { left: "48%", top: "23%", width: "43%" }
      : placement === "split"
        ? { left: "12%", top: "45%", width: "76%" }
        : { left: "8%", top: "43%", width: "84%" };
  const sourceStyle: CSSProperties =
    placement === "wide"
      ? { left: "8%", top: "17%", width: "29%" }
      : {
          left: placement === "split" ? "8%" : "11%",
          top: "12%",
          width: placement === "split" ? "38%" : "78%",
        };
  const databaseStyle: CSSProperties =
    placement === "wide" ? { left: "8%", top: "59%", width: "29%" } : { right: "8%", top: "12%", width: "38%" };
  const connectors: Record<Placement, readonly Connector[]> = {
    narrow: [
      {
        d: "M300 184 C300 236 300 292 300 352",
        source: source.id,
        target: brief.focalSubject.id,
      },
    ],
    split: [
      {
        d: "M216 212 C216 300 310 320 400 360 M584 212 C584 300 490 320 400 360 M400 360 C400 400 400 430 400 458",
        source: [source.id, database.id],
        target: brief.focalSubject.id,
      },
    ],
    wide: [
      {
        d: "M362 132 C410 132 418 228 450 280 M362 366 C410 366 418 326 450 280 M450 280 C464 280 476 280 488 280",
        source: [source.id, database.id],
        target: brief.focalSubject.id,
      },
    ],
  };

  return (
    <Scene placement={placement}>
      <ConnectorLayer connectors={connectors[placement]} placement={placement} />

      <div
        className="absolute z-10 rounded-xl border border-border bg-background p-3 shadow-sm"
        data-detail-id={source.id}
        data-detail-priority={2}
        data-visual-subject={source.id}
        style={sourceStyle}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
            <Code2 aria-hidden className="size-4" />
          </span>

          <VisualLabel kind="semantic" subjectId={source.id}>
            {requiredSemanticLabel(brief, 0)}
          </VisualLabel>
        </div>
      </div>

      {placement !== "narrow" ? (
        <div
          className="absolute z-10 rounded-xl border border-border bg-background p-3 shadow-sm"
          data-detail-id={database.id}
          data-detail-priority={3}
          data-visual-subject={database.id}
          style={databaseStyle}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
              <Database aria-hidden className="size-4" />
            </span>

            <VisualLabel kind="semantic" subjectId={database.id}>
              {requiredSemanticLabel(brief, 1)}
            </VisualLabel>
          </div>
        </div>
      ) : null}

      <div
        className="absolute z-20 rounded-card border border-border-strong bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30"
        data-detail-id={brief.focalSubject.id}
        data-detail-priority={1}
        data-focal-object="true"
        data-visual-subject={brief.focalSubject.id}
        style={focalStyle}
      >
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Boxes aria-hidden className="size-5" />
          </span>

          <VisualLabel kind="focal" subjectId={brief.focalSubject.id}>
            {requiredFocalLabel(brief)}
          </VisualLabel>
        </div>

        <div aria-hidden className="mt-4 grid grid-cols-2 gap-2">
          <span className="h-16 rounded-xl border border-border bg-background" />

          <span className="h-16 rounded-xl border border-primary/25 bg-primary/6" />
        </div>
      </div>
    </Scene>
  );
}

function OpenSourceEvaluationVisual({ brief }: Props) {
  return (
    <Artboard brief={brief}>
      <OpenSourceScene brief={brief} placement="narrow" />

      <OpenSourceScene brief={brief} placement="wide" />

      <OpenSourceScene brief={brief} placement="split" />
    </Artboard>
  );
}

function InboxScene({ brief, placement }: Pick<Props, "brief"> & { placement: Placement }) {
  const fixtureId = brief.focalSubject.fixtures?.providerSet;
  const conversationList = brief.supportingSubjects.find((subject) => subject.id === "conversation-list");
  const contactContext = brief.supportingSubjects.find((subject) => subject.id === "contact-context");
  const conversationId = conversationList?.fixtures?.conversation;
  const contactPerson = contactContext?.fixtures?.person;
  if (!fixtureId || !conversationList || !contactContext || !conversationId || !contactPerson)
    throw new Error(`${brief.id} needs provider, conversation, and contact fixtures`);

  const providers = VISUAL_PROVIDER_SET_FIXTURES[fixtureId].providers;
  const conversation = VISUAL_CONVERSATION_FIXTURES[conversationId];
  if (conversation.person !== contactPerson)
    throw new Error(`${brief.id} must bind the conversation participant to the contact context`);

  const focalStyle: CSSProperties =
    placement === "wide"
      ? { left: "7%", top: "16%", width: "47%" }
      : placement === "split"
        ? { left: "10%", top: "9%", width: "80%" }
        : { left: "8%", top: "10%", width: "84%" };
  const conversationStyle: CSSProperties =
    placement === "wide"
      ? { right: "7%", top: "14%", width: "31%" }
      : placement === "split"
        ? { left: "8%", top: "50%", width: "51%" }
        : { left: "8%", top: "53%", width: "84%" };
  const contactStyle: CSSProperties =
    placement === "wide" ? { right: "7%", top: "58%", width: "31%" } : { right: "8%", top: "58%", width: "29%" };
  const connectors: Record<Placement, readonly Connector[]> = {
    narrow: [
      {
        d: "M300 256 C300 310 300 370 300 432",
        source: brief.focalSubject.id,
        target: conversationList.id,
      },
    ],
    split: [
      {
        d: "M400 250 C400 310 400 345 400 370 M400 370 C400 430 266 438 266 508 M400 370 C400 452 684 460 684 588",
        source: brief.focalSubject.id,
        target: [conversationList.id, contactContext.id],
      },
    ],
    wide: [
      {
        d: "M532 245 C552 245 565 245 580 245 M580 245 C598 230 602 170 628 170 M580 245 C598 265 602 380 628 380",
        source: brief.focalSubject.id,
        target: [conversationList.id, contactContext.id],
      },
    ],
  };

  return (
    <Scene placement={placement}>
      <ConnectorLayer connectors={connectors[placement]} placement={placement} />

      <div
        className="absolute z-20 rounded-card border border-border-strong bg-card p-4 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-5"
        data-detail-id={brief.focalSubject.id}
        data-detail-priority={1}
        data-focal-object="true"
        data-visual-subject={brief.focalSubject.id}
        style={focalStyle}
      >
        <VisualLabel kind="focal" subjectId={brief.focalSubject.id}>
          {requiredFocalLabel(brief)}
        </VisualLabel>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {providers.map((provider, index) => (
            <span
              key={provider}
              className={cn(
                "grid size-11 place-items-center rounded-full border border-border bg-background shadow-sm",
                placement === "narrow" && index > 3 && "hidden",
              )}
            >
              <ProviderMark provider={provider} size={20} />
            </span>
          ))}
        </div>
      </div>

      <div
        className="absolute z-10 rounded-xl border border-border bg-background p-4 shadow-sm"
        data-detail-id={conversationList.id}
        data-detail-priority={2}
        data-visual-subject={conversationList.id}
        style={conversationStyle}
      >
        <VisualLabel kind="semantic" subjectId={conversationList.id}>
          {requiredSemanticLabel(brief, 0)}
        </VisualLabel>

        <div className="mt-3 rounded-xl border border-primary/25 bg-primary/6 p-3">
          <div className="flex items-center justify-between gap-2">
            <PersonIdentity className="max-w-32" person={conversation.person} size={30} />

            <ProviderIdentity className="text-[11px]" iconSize={15} provider={conversation.provider} />
          </div>

          {placement === "wide" ? (
            <p className="mt-3 line-clamp-2 text-xs leading-snug font-medium">
              {conversation.localizedSubject[brief.locale]}
            </p>
          ) : null}
        </div>
      </div>

      {placement !== "narrow" ? (
        <div
          className="absolute z-10 rounded-xl border border-border bg-background p-4 shadow-sm"
          data-detail-id={contactContext.id}
          data-detail-priority={3}
          data-visual-subject={contactContext.id}
          style={contactStyle}
        >
          <VisualLabel kind="semantic" subjectId={contactContext.id}>
            {requiredSemanticLabel(brief, 1)}
          </VisualLabel>

          <PersonIdentity className="mt-3" person={contactPerson} size={34} />
        </div>
      ) : null}
    </Scene>
  );
}

function InboxVisual({ brief }: Props) {
  return (
    <Artboard brief={brief}>
      <InboxScene brief={brief} placement="narrow" />

      <InboxScene brief={brief} placement="wide" />

      <InboxScene brief={brief} placement="split" />
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

function PipelineScene({ brief, locale, placement }: Props & { placement: Placement }) {
  const fixtureId = brief.focalSubject.fixtures?.dealBoard;
  if (!fixtureId) throw new Error(`${brief.id} needs a deal-board fixture`);
  const board = VISUAL_DEAL_BOARD_FIXTURES[fixtureId];
  const context = brief.supportingSubjects[0];
  const value = brief.supportingSubjects[1];
  const featured = recordsForStatus(board.records, "deal-open")[0] ?? board.records[0];
  if (!context || !value || !featured) throw new Error(`${brief.id} needs two support subjects and a featured deal`);

  const boardStyle: CSSProperties =
    placement === "wide"
      ? { bottom: "19%", left: "5%", right: "5%", top: "7%" }
      : {
          bottom: "24%",
          left: placement === "split" ? "6%" : "5%",
          right: placement === "split" ? "6%" : "5%",
          top: "7%",
        };

  return (
    <Scene placement={placement}>
      <div
        className="absolute z-20 grid grid-cols-3 grid-rows-[auto_minmax(0,1fr)] content-start gap-2 rounded-card border border-border-strong bg-card p-3 shadow-xl shadow-black/10 dark:shadow-black/30 sm:gap-3 sm:p-4"
        data-detail-id={brief.focalSubject.id}
        data-detail-priority={1}
        data-focal-object="true"
        data-visual-subject={brief.focalSubject.id}
        style={boardStyle}
      >
        <span className="col-span-3">
          <VisualLabel kind="focal" subjectId={brief.focalSubject.id}>
            {requiredFocalLabel(brief)}
          </VisualLabel>
        </span>

        <div className="col-span-3 grid min-h-0 grid-cols-3 gap-2 sm:gap-3">
          {BOARD_STATUSES.map((status) => (
            <div key={status} className="flex min-w-0 flex-col border-l border-border pl-2 sm:pl-3">
              <span
                className={cn(
                  "block size-1.5 rounded-full",
                  status === "deal-open" ? "bg-warning" : status === "deal-won" ? "bg-success" : "bg-destructive",
                )}
              />

              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
                {recordsForStatus(board.records, status).map((record, index) => (
                  <div
                    key={record}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-background p-2.5 shadow-sm sm:p-3",
                      index > 0 && placement !== "wide" && "hidden",
                      status === "deal-open" && index === 0 ? "border-primary/35" : "border-border",
                    )}
                  >
                    <NativeRecordIdentity locale={locale} record={record} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="absolute bottom-[6%] left-[8%] z-10 rounded-xl border border-border bg-background px-3 py-2.5 shadow-sm"
        data-detail-id={context.id}
        data-detail-priority={2}
        data-visual-subject={context.id}
      >
        <span className="flex items-center gap-2">
          <ContactRound aria-hidden className="size-4 text-primary" />

          <VisualLabel kind="semantic" subjectId={context.id}>
            {requiredSemanticLabel(brief, 0)}
          </VisualLabel>
        </span>
      </div>

      {placement !== "narrow" ? (
        <div
          className="absolute bottom-[6%] right-[8%] z-10 rounded-xl border border-border bg-background px-3 py-2.5 shadow-sm"
          data-detail-id={value.id}
          data-detail-priority={3}
          data-visual-subject={value.id}
        >
          <span className="flex items-center gap-2">
            <CircleDollarSign aria-hidden className="size-4 text-primary" />

            <VisualLabel kind="semantic" subjectId={value.id}>
              {requiredSemanticLabel(brief, 1)}
            </VisualLabel>
          </span>

          {placement === "wide" ? (
            <p className="mt-1 text-xs font-medium text-foreground">{formatDealValue(featured, locale, "weighted")}</p>
          ) : null}
        </div>
      ) : null}
    </Scene>
  );
}

function PipelineVisual(props: Props) {
  return (
    <Artboard brief={props.brief}>
      <PipelineScene {...props} placement="narrow" />

      <PipelineScene {...props} placement="wide" />

      <PipelineScene {...props} placement="split" />
    </Artboard>
  );
}

function AgencyScene({ brief, locale, placement }: Props & { placement: Placement }) {
  const fixtureId = brief.focalSubject.fixtures?.dealBoard;
  if (!fixtureId) throw new Error(`${brief.id} needs a deal-board fixture`);
  const board = VISUAL_DEAL_BOARD_FIXTURES[fixtureId];
  const featured = recordsForStatus(board.records, "deal-open")[0] ?? board.records[0];
  const context = brief.supportingSubjects[0];
  const value = brief.supportingSubjects[1];
  if (!featured || !context || !value) throw new Error(`${brief.id} needs a featured deal and two support subjects`);

  const focalStyle: CSSProperties =
    placement === "wide"
      ? { left: "29%", top: "17%", width: "42%" }
      : placement === "split"
        ? { left: "12%", top: "31%", width: "76%" }
        : { left: "8%", top: "28%", width: "84%" };
  const contextStyle: CSSProperties =
    placement === "wide" ? { left: "7%", top: "11%", width: "28%" } : { left: "8%", top: "8%", width: "50%" };
  const valueStyle: CSSProperties =
    placement === "wide"
      ? { bottom: "10%", right: "7%", width: "29%" }
      : {
          bottom: "9%",
          right: "8%",
          width: placement === "split" ? "45%" : "58%",
        };

  return (
    <Scene placement={placement}>
      <div
        className="absolute z-10 rounded-xl border border-border bg-background p-3 shadow-sm"
        data-detail-id={context.id}
        data-detail-priority={2}
        data-visual-subject={context.id}
        style={contextStyle}
      >
        <span className="flex items-center gap-2">
          <ContactRound aria-hidden className="size-4 text-primary" />

          <VisualLabel kind="semantic" subjectId={context.id}>
            {requiredSemanticLabel(brief, 0)}
          </VisualLabel>
        </span>
      </div>

      <div
        className="absolute z-20 rounded-card border border-border-strong bg-card p-4 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-5"
        data-detail-id={brief.focalSubject.id}
        data-detail-priority={1}
        data-focal-object="true"
        data-visual-subject={brief.focalSubject.id}
        style={focalStyle}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <VisualLabel kind="focal" subjectId={brief.focalSubject.id}>
            {requiredFocalLabel(brief)}
          </VisualLabel>

          <BriefcaseBusiness aria-hidden className="size-4 text-primary" />
        </div>

        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/6 p-3">
          <NativeRecordIdentity locale={locale} record={featured} />
        </div>
      </div>

      {placement !== "narrow" ? (
        <div
          className="absolute z-10 rounded-xl border border-border bg-background p-3 shadow-sm"
          data-detail-id={value.id}
          data-detail-priority={3}
          data-visual-subject={value.id}
          style={valueStyle}
        >
          <span className="flex items-center gap-2">
            <CircleDollarSign aria-hidden className="size-4 text-primary" />

            <VisualLabel kind="semantic" subjectId={value.id}>
              {requiredSemanticLabel(brief, 1)}
            </VisualLabel>
          </span>

          <p className="mt-1 text-xs font-medium text-foreground">{formatDealValue(featured, locale, "weighted")}</p>
        </div>
      ) : null}
    </Scene>
  );
}

function AgencyVisual(props: Props) {
  return (
    <Artboard brief={props.brief}>
      <AgencyScene {...props} placement="narrow" />

      <AgencyScene {...props} placement="wide" />

      <AgencyScene {...props} placement="split" />
    </Artboard>
  );
}

function HandoffScene({ brief, placement }: Pick<Props, "brief"> & { placement: Placement }) {
  const agent = brief.supportingSubjects.find((subject) => subject.form === "agent-cue");
  const human = brief.supportingSubjects.find((subject) => subject.form === "human-action");
  const recipient = brief.focalSubject.fixtures?.person;
  const provider = brief.focalSubject.fixtures?.provider;
  if (!agent || !human?.fixtures?.person || !recipient || !provider)
    throw new Error(`${brief.id} needs agent, draft, recipient, and human fixtures`);

  const agentStyle: CSSProperties =
    placement === "wide"
      ? { left: "7%", top: "34%" }
      : placement === "split"
        ? { left: "8%", top: "13%" }
        : { left: "7%", top: "10%" };
  const focalStyle: CSSProperties =
    placement === "wide"
      ? { left: "35%", top: "15%", width: "47%" }
      : placement === "split"
        ? { left: "13%", top: "34%", width: "74%" }
        : { left: "8%", top: "32%", width: "84%" };
  const connectors: Record<Placement, readonly Connector[]> = {
    narrow: [
      {
        d: "M160 120 C255 120 235 220 285 264",
        source: agent.id,
        target: brief.focalSubject.id,
      },
    ],
    split: [
      {
        d: "M170 160 C330 160 285 285 350 348",
        source: agent.id,
        target: brief.focalSubject.id,
      },
    ],
    wide: [
      {
        d: "M184 211 C260 211 292 178 358 178",
        source: agent.id,
        target: brief.focalSubject.id,
      },
    ],
  };

  return (
    <Scene placement={placement}>
      <ConnectorLayer connectors={connectors[placement]} placement={placement} />

      <div
        className="absolute z-10"
        data-detail-id={agent.id}
        data-detail-priority={2}
        data-visual-subject={agent.id}
        style={agentStyle}
      >
        <NativeAgentProviderIdentity
          className="rounded-full border border-border bg-card px-3 py-2 text-xs shadow-sm"
          iconSize={18}
          provider={agent.agentProvider}
          visualSubject={agent.id}
        />
      </div>

      <div
        className="absolute z-20 rounded-card border border-border-strong bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-6"
        data-detail-composite={human.id}
        data-detail-id={brief.focalSubject.id}
        data-detail-priority={1}
        data-focal-object="true"
        data-visual-subject={brief.focalSubject.id}
        style={focalStyle}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <VisualLabel kind="focal" subjectId={brief.focalSubject.id}>
            {requiredFocalLabel(brief)}
          </VisualLabel>

          <ProviderIdentity className="text-[11px]" iconSize={16} provider={provider} />
        </div>

        <div className="mt-4">
          <PersonIdentity person={recipient} size={30} />

          <div aria-hidden className="mt-4 space-y-2.5">
            <div className="h-1.5 w-[92%] rounded-full bg-placeholder" />

            {placement !== "narrow" ? <div className="h-1.5 w-[72%] rounded-full bg-muted" /> : null}

            {placement === "wide" ? <div className="h-1.5 w-[52%] rounded-full bg-muted" /> : null}
          </div>
        </div>

        <div
          className="-mx-5 mt-5 flex items-center justify-between gap-3 border-t border-border px-5 pt-4 sm:-mx-6 sm:px-6"
          data-visual-subject={human.id}
        >
          <PersonIdentity className="max-w-32" person={human.fixtures.person} size={28} />

          <span className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-primary-foreground">
            <VisualLabel kind="semantic" subjectId={human.id}>
              {requiredSemanticLabel(brief, 0)}
            </VisualLabel>

            <Send aria-hidden className="size-3.5" />
          </span>
        </div>
      </div>
    </Scene>
  );
}

function HandoffVisual({ brief }: Props) {
  return (
    <Artboard brief={brief}>
      <HandoffScene brief={brief} placement="narrow" />

      <HandoffScene brief={brief} placement="wide" />

      <HandoffScene brief={brief} placement="split" />
    </Artboard>
  );
}

export function AcquisitionStoryVisual(props: Props) {
  switch (props.brief.focalSubject.form) {
    case "context-card":
      return props.brief.id.includes(".open-source-crm.") ? (
        <OpenSourceEvaluationVisual {...props} />
      ) : (
        <DeploymentVisual {...props} />
      );
    case "provider-set":
      return <InboxVisual {...props} />;
    case "kanban-board":
      return props.brief.id.includes(".agencies.") ? <AgencyVisual {...props} /> : <PipelineVisual {...props} />;
    case "draft":
      return <HandoffVisual {...props} />;
    default:
      throw new Error(`${props.brief.id} uses unsupported focal form ${props.brief.focalSubject.form}`);
  }
}
