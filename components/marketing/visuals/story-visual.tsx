import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Check, Send } from "lucide-react";

import { cn } from "@/core/utils/cn";

import {
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
  type VisualAgentProviderFixtureId,
  type VisualPersonFixtureId,
  type VisualProviderFixtureId,
  type VisualRecordFixtureId,
  type VisualStatusFixtureId,
} from "./native-fixtures";
import {
  NativeAgentProviderIdentity,
  NativeStatusBadge,
  PersonAvatar,
  PersonIdentity,
  ProviderMark,
} from "./native-visual-primitives";
import {
  type BrandIllustrationBrief,
  type VisualPlacement,
  type VisualVariant,
  validateVisualBrief,
} from "./visual-contract";
import {
  STORY_VISUAL_EDGE_LAYOUT,
  authoredConnectorPath,
  connectorDrawProgress,
  focalAccentProgress,
  focalSurfaceProgress,
  sourceRevealProgress,
  storyBeatProgress,
  trimAuthoredConnector,
  type AuthoredConnector,
  type NormalizedBox,
  type NormalizedPoint,
} from "./story-visual-layout";

export type StoryVisualTheme = "light" | "dark";

type StoryVisualProps = {
  brief: BrandIllustrationBrief;
  placement: VisualPlacement;
  t?: number;
  theme: StoryVisualTheme;
  variant: VisualVariant;
};

const ARTBOARD_ASPECT: Record<VisualPlacement, string> = {
  narrow: "aspect-[3/4]",
  split: "aspect-[4/5]",
  wide: "aspect-hero",
};

const DETAIL_DENSITY: Record<VisualPlacement, "context" | "essential" | "full"> = {
  narrow: "essential",
  split: "context",
  wide: "full",
};

const FOCAL_POSITION: Record<VisualPlacement, Record<VisualVariant, string>> = {
  narrow: {
    edge: "-right-[12%] bottom-[8%] w-[88%]",
    overlap: "right-[7%] bottom-[10%] w-[84%]",
    stage: "right-[8%] bottom-[12%] w-[84%]",
  },
  split: {
    edge: "-right-[10%] bottom-[7%] w-[86%]",
    overlap: "right-[8%] bottom-[11%] w-[82%]",
    stage: "right-[9%] bottom-[13%] w-[82%]",
  },
  wide: {
    edge: "-right-[4%] top-[17%] w-[49%]",
    overlap: "right-[7%] top-[20%] w-[48%]",
    stage: "right-[26%] top-[19%] w-[48%]",
  },
};

const CONTAINED_FOCAL_POSITION: Record<VisualPlacement, Record<VisualVariant, string>> = {
  narrow: {
    edge: "right-[2%] bottom-[8%] w-[88%]",
    overlap: FOCAL_POSITION.narrow.overlap,
    stage: FOCAL_POSITION.narrow.stage,
  },
  split: {
    edge: "right-[3%] bottom-[7%] w-[86%]",
    overlap: FOCAL_POSITION.split.overlap,
    stage: FOCAL_POSITION.split.stage,
  },
  wide: {
    edge: "right-[3%] top-[17%] w-[49%]",
    overlap: FOCAL_POSITION.wide.overlap,
    stage: FOCAL_POSITION.wide.stage,
  },
};

function normalizedTime(t: number | undefined) {
  const time = t ?? 1;
  if (!Number.isFinite(time) || time < 0 || time > 1)
    throw new Error("StoryVisual time must be normalized between zero and one");

  return time;
}

function progressStyle(progress: number, initialOpacity = 0.65, anchorGeometry = false) {
  return {
    opacity: initialOpacity + progress * (1 - initialOpacity),
    transform: anchorGeometry ? undefined : `translateY(${(1 - progress) * 8}px) scale(${0.98 + progress * 0.02})`,
  };
}

function normalizedBoxStyle(box: NormalizedBox): CSSProperties {
  return {
    height: box.height === undefined ? undefined : `${box.height}%`,
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
  };
}

function normalizedCenterStyle(point: NormalizedPoint): CSSProperties {
  return {
    left: `${point.x}%`,
    top: `${point.y}%`,
    transform: "translate(-50%, -50%)",
  };
}

function DepthPlane({
  children,
  className,
  depth,
  style,
}: {
  children: ReactNode;
  className?: string;
  depth: 1 | 2 | 3;
  style?: CSSProperties;
}) {
  return (
    <div className={className} data-depth-plane={depth} style={style}>
      {children}
    </div>
  );
}

function AmbientField({ placement, variant }: { placement: VisualPlacement; variant: VisualVariant }) {
  return (
    <DepthPlane className="pointer-events-none absolute inset-0" depth={1}>
      <div
        className={cn(
          "absolute rounded-full bg-primary/15 blur-3xl",
          placement === "wide" ? "right-[8%] top-[8%] size-[54%]" : "-right-[18%] bottom-[4%] size-[82%]",
          variant === "stage" &&
            (placement === "wide" ? "right-[28%] top-[10%] size-[46%]" : "right-[8%] bottom-[9%] size-[72%]"),
        )}
      />
    </DepthPlane>
  );
}

function FocalPlane({
  anchorGeometry = false,
  children,
  className,
  initialOpacity,
  style,
  t,
}: {
  anchorGeometry?: boolean;
  children: ReactNode;
  className: string;
  initialOpacity?: number;
  style?: CSSProperties;
  t?: number;
}) {
  return (
    <DepthPlane className={cn("absolute", className)} depth={3} style={style}>
      <div data-focal-object="true" style={progressStyle(normalizedTime(t), initialOpacity, anchorGeometry)}>
        {children}
      </div>
    </DepthPlane>
  );
}

function SourceMark({
  active,
  placement,
  progress,
  subject,
}: {
  active: boolean;
  placement: VisualPlacement;
  progress: number;
  subject: BrandIllustrationBrief["supportingSubjects"][number];
}) {
  const provider = subject.fixtures?.provider;
  if (!provider) throw new Error(`${subject.id} needs a provider fixture`);
  const person = subject.fixtures?.person;
  const providerFixture = VISUAL_PROVIDER_FIXTURES[provider];

  return (
    <div
      className={cn(
        "relative flex items-center border bg-card shadow-sm",
        placement === "wide" && active ? "gap-2 rounded-xl py-2 pr-2.5 pl-2" : "justify-center rounded-full",
        active
          ? placement === "wide"
            ? "min-h-12 min-w-12 border-border-strong shadow-lg shadow-black/5"
            : "size-12 border-border-strong shadow-lg shadow-black/5"
          : "size-10 border-border opacity-75",
      )}
      data-active-source={active ? "true" : undefined}
      data-motion-progress={progress.toFixed(3)}
      data-motion-subject={subject.id}
      style={{
        opacity: (active ? 0.42 : 0.22) + progress * (active ? 0.58 : 0.6),
        transform: `translateY(${(1 - progress) * 10}px) scale(${0.94 + progress * 0.06})`,
      }}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background">
        <ProviderMark provider={provider} size={active ? 21 : 19} />
      </span>

      {active && person && placement === "wide" ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <PersonAvatar person={person} size={24} />

          <span className="max-w-20 text-[10px] leading-tight font-medium">{VISUAL_PERSON_FIXTURES[person].name}</span>
        </span>
      ) : null}

      <span className="sr-only">{providerFixture.name}</span>

      {active ? (
        <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-primary ring-2 ring-card" />
      ) : null}
    </div>
  );
}

function ConnectorLayer({
  connectors,
  hidden = false,
  subjectPrefix,
  time,
}: {
  connectors: readonly AuthoredConnector[];
  hidden?: boolean;
  subjectPrefix: string;
  time: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full text-border-strong"
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {connectors.map((connector, index) => {
        const progress = connectorDrawProgress(time, index);
        const visibleConnector = trimAuthoredConnector(connector, progress);

        return (
          <path
            key={`${connector.source.x}:${connector.source.y}:${connector.target.x}:${connector.target.y}`}
            d={authoredConnectorPath(connector, progress)}
            data-connector-draw-target={`${visibleConnector.target.x},${visibleConnector.target.y}`}
            data-connector-source={`${connector.source.x},${connector.source.y}`}
            data-connector-target={`${connector.target.x},${connector.target.y}`}
            data-motion-progress={progress.toFixed(3)}
            data-motion-subject={`${subjectPrefix}-${index + 1}`}
            pathLength="1"
            stroke="currentColor"
            strokeLinecap="butt"
            strokeOpacity={hidden ? 0 : index === 0 ? 0.72 : 0.32}
            strokeWidth={index === 0 ? 1.25 : 1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function convergeEdgeConnectors(placement: VisualPlacement, count: number) {
  const connectors = STORY_VISUAL_EDGE_LAYOUT.converge[placement].connectors;
  if (count === 2) return connectors[2];
  if (count === 3) return connectors[3];
  throw new Error("Converge connector geometry supports two or three sources");
}

function ConvergeSupports({
  placement,
  subjects,
  time,
  variant,
}: {
  placement: VisualPlacement;
  subjects: BrandIllustrationBrief["supportingSubjects"];
  time: number;
  variant: VisualVariant;
}) {
  const iconClasses =
    subjects.length === 2
      ? placement === "wide"
        ? ["left-[10%] top-[27%]", "left-[12%] top-[63%]"]
        : ["left-[19%] top-[11%]", "right-[19%] top-[11%]"]
      : placement === "wide"
        ? ["left-[11%] top-[15%]", "left-[7%] top-[42%]", "left-[13%] top-[72%]"]
        : ["left-[11%] top-[11%]", "left-[42%] top-[7%]", "right-[11%] top-[13%]"];

  const edgeConnectors = convergeEdgeConnectors(placement, subjects.length);

  return (
    <DepthPlane className="absolute inset-0" depth={2}>
      <ConnectorLayer connectors={edgeConnectors} hidden={variant !== "edge"} subjectPrefix="connector" time={time} />

      {subjects.map((subject, index) => {
        const connector = edgeConnectors[index];
        if (!connector) throw new Error(`${subject.id} is missing authored connector geometry`);

        return (
          <div
            key={subject.id}
            className={cn("absolute", variant !== "edge" && iconClasses[index])}
            style={variant === "edge" ? normalizedCenterStyle(connector.source) : undefined}
          >
            <SourceMark
              active={Boolean(subject.fixtures?.person)}
              placement={placement}
              progress={sourceRevealProgress(time, index)}
              subject={subject}
            />
          </div>
        );
      })}
    </DepthPlane>
  );
}

function RecordAnchor({
  label,
  overlap,
  person,
  placement,
  progress,
  provider,
}: {
  label?: string;
  overlap: boolean;
  person: VisualPersonFixtureId;
  placement: VisualPlacement;
  progress: number;
  provider: VisualProviderFixtureId;
}) {
  const personFixture = VISUAL_PERSON_FIXTURES[person];

  return (
    <div
      className="relative rounded-card border border-border-strong bg-card p-[8%] shadow-xl shadow-primary/10"
      data-accent-target="customer-record"
      data-detail-density={DETAIL_DENSITY[placement]}
      data-motion-progress={progress.toFixed(3)}
    >
      <div className="flex items-start gap-[7%]">
        <PersonAvatar fluid className="size-[22%]" person={person} size={52} />

        <div className="min-w-0 flex-1 pt-[2%]">
          {label && placement !== "narrow" ? <p className="text-meta leading-tight">{label}</p> : null}

          <p
            className={cn(
              "break-words text-sm leading-tight font-medium sm:text-base",
              placement !== "narrow" && "mt-[5%]",
            )}
          >
            {personFixture.name}
          </p>
        </div>
      </div>

      <div className="mt-[10%] flex items-center gap-[6%] rounded-lg bg-primary/7 p-[5%]">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card">
          <ProviderMark provider={provider} size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="h-2 w-[74%] rounded-full bg-placeholder" />

          {placement === "wide" ? <div className="mt-[6%] h-2 w-[42%] rounded-full bg-muted" /> : null}
        </div>
      </div>

      {overlap ? (
        <div
          className="absolute -left-[11%] bottom-[16%] flex items-center gap-[10%] rounded-full border border-border-strong bg-card px-[5%] py-[3.5%] text-primary shadow-lg"
          data-overlap-object="true"
        >
          <ProviderMark provider={provider} size={18} />

          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.7} />
        </div>
      ) : null}
    </div>
  );
}

function ConvergeVisual({
  brief,
  placement,
  t,
  variant,
}: Pick<StoryVisualProps, "brief" | "placement" | "t" | "variant">) {
  const time = normalizedTime(t);
  const isSelectedEdge = variant === "edge";
  const focalProgress = isSelectedEdge ? focalSurfaceProgress(time) : storyBeatProgress(time, 0.48, 0.86);
  const accentProgress = isSelectedEdge ? focalAccentProgress(time) : focalProgress;
  const person = brief.focalSubject.fixtures?.person;
  const activeSource = brief.supportingSubjects.find((subject) => subject.fixtures?.person);
  const provider = activeSource?.fixtures?.provider;
  if (!person || !provider) throw new Error("Converge requires a fixture-backed active source and matching record");

  return (
    <>
      <AmbientField placement={placement} variant={variant} />

      <ConvergeSupports placement={placement} subjects={brief.supportingSubjects} time={time} variant={variant} />

      <FocalPlane
        anchorGeometry={isSelectedEdge}
        className={isSelectedEdge ? "" : FOCAL_POSITION[placement][variant]}
        initialOpacity={0.14}
        style={isSelectedEdge ? normalizedBoxStyle(STORY_VISUAL_EDGE_LAYOUT.converge[placement].focal) : undefined}
        t={focalProgress}
      >
        <RecordAnchor
          label={brief.focalLabel?.text}
          overlap={variant === "overlap"}
          person={person}
          placement={placement}
          progress={accentProgress}
          provider={provider}
        />
      </FocalPlane>
    </>
  );
}

function AgentCue({
  placement,
  provider,
  subjectId,
  variant,
}: {
  placement: VisualPlacement;
  provider: VisualAgentProviderFixtureId;
  subjectId: string;
  variant: VisualVariant;
}) {
  const cue = STORY_VISUAL_EDGE_LAYOUT.handoff[placement].cue;

  return (
    <NativeAgentProviderIdentity
      className={cn(
        "absolute z-10 rounded-full border border-border-strong bg-card px-2 py-1.5 text-[9px] text-foreground shadow-sm",
        variant !== "edge" && (placement === "wide" ? "left-[11%] top-[27%]" : "left-[12%] top-[14%]"),
      )}
      iconSize={placement === "wide" ? 18 : 16}
      motionSubject={subjectId}
      provider={provider}
      style={variant === "edge" ? normalizedCenterStyle(cue) : undefined}
    />
  );
}

function DraftArtifact({
  label,
  person,
  placement,
  provider,
}: {
  label?: string;
  person: VisualPersonFixtureId;
  placement: VisualPlacement;
  provider: VisualProviderFixtureId;
}) {
  const messageLineWidths = placement === "wide" ? ["w-[92%]", "w-[78%]", "w-[56%]"] : ["w-[92%]"];

  return (
    <div
      className={cn(
        "rounded-card border border-border-strong bg-card p-[7%] shadow-xl shadow-primary/10",
        placement === "narrow" && "pb-[25%]",
      )}
      data-detail-density={DETAIL_DENSITY[placement]}
    >
      <div className="border-b border-border pb-[5%]">
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <span className="rounded-md bg-foreground/5 px-2 py-1 text-[10px] font-medium text-foreground/80">
              {label}
            </span>
          ) : null}

          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background">
            <ProviderMark provider={provider} size={19} />
          </span>
        </div>

        <PersonIdentity className="mt-[5%] min-w-0" person={person} size={24} />
      </div>

      {placement !== "narrow" ? (
        <div className="py-[7%]">
          {messageLineWidths.map((width, index) => (
            <div key={width} className={cn("h-1.5 rounded-full bg-placeholder", index > 0 && "mt-[5%]", width)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HumanAction({
  label,
  person,
  placement,
  variant,
}: {
  label?: string;
  person: VisualPersonFixtureId;
  placement: VisualPlacement;
  variant: VisualVariant;
}) {
  return (
    <div
      className={cn(
        "absolute z-10 flex items-center gap-2 rounded-xl border border-border-strong bg-card p-1.5 shadow-lg",
        "bottom-[4%]",
        variant === "edge" ? "right-[18%]" : variant === "overlap" ? "right-[8%]" : "right-[3%]",
      )}
      data-detail-density={DETAIL_DENSITY[placement]}
      data-overlap-object="true"
    >
      <PersonIdentity className="max-w-28" person={person} size={28} />

      <span className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-xs font-medium text-primary-foreground">
        <span>{label}</span>

        <Send aria-hidden="true" className="size-3.5" />
      </span>
    </div>
  );
}

function HandoffVisual({
  brief,
  placement,
  t,
  variant,
}: Pick<StoryVisualProps, "brief" | "placement" | "t" | "variant">) {
  const time = normalizedTime(t);
  const isSelectedEdge = variant === "edge";
  const edgeLayout = STORY_VISUAL_EDGE_LAYOUT.handoff[placement];
  const sendLabel = brief.semanticLabels[0]?.text;
  const person = brief.focalSubject.fixtures?.person;
  const provider = brief.focalSubject.fixtures?.provider;
  const agent = brief.supportingSubjects.find((subject) => subject.form === "agent-cue");
  const human = brief.supportingSubjects.find((subject) => subject.form === "human-action")?.fixtures?.person;
  if (!person || !provider || !agent || !human)
    throw new Error("Handoff requires fixture-backed draft, agent provider, and human identities");

  return (
    <>
      <AmbientField placement={placement} variant={variant} />

      <DepthPlane className="absolute inset-0" depth={2}>
        {isSelectedEdge ? (
          <ConnectorLayer connectors={[edgeLayout.connector]} subjectPrefix="handoff-connector" time={time} />
        ) : null}

        <AgentCue placement={placement} provider={agent.agentProvider} subjectId={agent.id} variant={variant} />
      </DepthPlane>

      <FocalPlane
        anchorGeometry={isSelectedEdge}
        className={isSelectedEdge ? "" : CONTAINED_FOCAL_POSITION[placement][variant]}
        style={isSelectedEdge ? normalizedBoxStyle(edgeLayout.focal) : undefined}
        t={isSelectedEdge ? focalSurfaceProgress(time) : time}
      >
        <div className="relative">
          <DraftArtifact label={brief.focalLabel?.text} person={person} placement={placement} provider={provider} />

          <HumanAction label={sendLabel} person={human} placement={placement} variant={variant} />
        </div>
      </FocalPlane>
    </>
  );
}

function recordFixtures(subject: BrandIllustrationBrief["supportingSubjects"][number]) {
  const { record, status } = subject.fixtures ?? {};
  if (!record || !status) throw new Error(`${subject.id} needs a record and Status fixture`);
  return { record, status };
}

function QuietRecordCard({
  placement,
  showFixture,
  subject,
}: {
  placement: VisualPlacement;
  showFixture: boolean;
  subject: BrandIllustrationBrief["supportingSubjects"][number];
}) {
  const fixtures = subject.fixtures;
  if (!showFixture || !fixtures?.record || !fixtures.status) {
    return (
      <div
        className="rounded-card border border-border bg-card/65 p-3"
        data-detail-density={DETAIL_DENSITY[placement]}
        data-motion-subject={subject.id}
      >
        <div className="h-1.5 w-2/5 rounded-full bg-placeholder" />

        <div className="mt-2 h-1.5 w-4/5 rounded-full bg-muted" />
      </div>
    );
  }

  const { record, status } = recordFixtures(subject);
  const recordFixture = VISUAL_RECORD_FIXTURES[record];

  return (
    <div
      aria-label={`${recordFixture.name}, ${VISUAL_STATUS_FIXTURES[status].label}`}
      className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card/75 p-2.5"
      data-detail-density={DETAIL_DENSITY[placement]}
      data-motion-subject={subject.id}
      data-native-record={record}
    >
      <span className="text-[9px] leading-snug font-medium text-foreground/75">{recordFixture.name}</span>

      <NativeStatusBadge className="opacity-80" status={status} />
    </div>
  );
}

function ContextPlane({
  placement,
  subjects,
}: {
  placement: VisualPlacement;
  subjects: BrandIllustrationBrief["supportingSubjects"];
}) {
  const positions =
    placement === "wide"
      ? ["left-[8%] top-[18%] w-[31%]", "left-[13%] bottom-[16%] w-[29%]", "left-[34%] top-[7%] w-[25%]"]
      : ["left-[7%] top-[8%] w-[58%]", "right-[7%] top-[31%] w-[54%]", "left-[10%] top-[51%] w-[48%]"];

  return (
    <DepthPlane className="absolute inset-0" depth={2}>
      {subjects.map((subject, index) => (
        <div key={subject.id} className={cn("absolute", positions[index])}>
          <QuietRecordCard
            placement={placement}
            showFixture={placement === "wide" || (placement === "split" && index === 0)}
            subject={subject}
          />
        </div>
      ))}
    </DepthPlane>
  );
}

function SignalArtifact({
  label,
  overlap,
  placement,
  record,
  status,
}: {
  label?: string;
  overlap: boolean;
  placement: VisualPlacement;
  record?: VisualRecordFixtureId;
  status?: VisualStatusFixtureId;
}) {
  const recordFixture = record ? VISUAL_RECORD_FIXTURES[record] : undefined;

  return (
    <div
      className="relative rounded-card border border-border-strong bg-card p-[8%] shadow-xl shadow-primary/10"
      data-detail-density={DETAIL_DENSITY[placement]}
      data-native-record={record}
    >
      <div className="flex items-center justify-between gap-4">
        {label ? <p className="text-meta">{label}</p> : null}

        {status ? <NativeStatusBadge status={status} /> : <span className="size-2 rounded-full bg-primary" />}
      </div>

      {recordFixture ? (
        <p className="mt-[9%] break-words text-sm leading-snug font-medium sm:text-base">{recordFixture.name}</p>
      ) : (
        <div className="mt-[10%] space-y-[7%] py-[4%]">
          <div className="h-2 w-[88%] rounded-full bg-placeholder" />

          <div className="h-2 w-[62%] rounded-full bg-muted" />
        </div>
      )}

      {overlap ? (
        <div
          className="absolute -right-[7%] top-[18%] flex size-[18%] items-center justify-center rounded-full border border-primary bg-card text-primary shadow-lg"
          data-overlap-object="true"
        >
          <Check aria-hidden="true" className="size-[42%]" strokeWidth={2} />
        </div>
      ) : null}
    </div>
  );
}

function InspectorCue({
  label,
  person,
  placement,
}: {
  label: string;
  person: VisualPersonFixtureId;
  placement: VisualPlacement;
}) {
  if (placement === "narrow") return null;

  return (
    <div
      className="mb-2 ml-auto flex w-fit max-w-full items-center gap-2 rounded-xl border border-border bg-card/90 p-1.5 shadow-sm"
      data-detail-density={DETAIL_DENSITY[placement]}
      data-inspector-cue="true"
    >
      {placement === "wide" ? (
        <span className="pl-1 text-[9px] leading-none font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      ) : null}

      <PersonIdentity person={person} size={26} />
    </div>
  );
}

function FocusVisual({
  brief,
  placement,
  t,
  variant,
}: Pick<StoryVisualProps, "brief" | "placement" | "t" | "variant">) {
  const { person, record, status } = brief.focalSubject.fixtures ?? {};
  const inspectorLabel = brief.semanticLabels[0]?.text;
  if (person && !inspectorLabel) throw new Error("Focus person fixtures require a localized inspector label");

  return (
    <>
      <AmbientField placement={placement} variant={variant} />

      <ContextPlane placement={placement} subjects={brief.supportingSubjects} />

      <FocalPlane className={CONTAINED_FOCAL_POSITION[placement][variant]} t={t}>
        <div className="relative">
          {person && inspectorLabel ? (
            <InspectorCue label={inspectorLabel} person={person} placement={placement} />
          ) : null}

          <SignalArtifact
            label={brief.focalLabel?.text}
            overlap={variant === "overlap"}
            placement={placement}
            record={record}
            status={status}
          />
        </div>
      </FocalPlane>
    </>
  );
}

export function StoryVisual({ brief, placement, t, theme, variant }: StoryVisualProps) {
  const validated = validateVisualBrief(brief);
  const time = normalizedTime(t);
  if (validated.kind !== "brand-illustration") throw new Error("StoryVisual renders brand illustrations only");

  if (!validated.placements.includes(placement))
    throw new Error(`${validated.id} does not request the ${placement} placement`);

  return (
    <div
      aria-label={validated.takeaway}
      className={cn(
        "relative isolate w-full overflow-hidden bg-sidebar text-foreground",
        ARTBOARD_ASPECT[placement],
        theme === "dark" ? "dark" : "light",
      )}
      data-composition={`${placement}:${variant}`}
      data-detail-density={DETAIL_DENSITY[placement]}
      data-story-template={validated.template}
      data-story-theme={theme}
      data-story-visual={validated.id}
      role="img"
    >
      {validated.template === "converge" ? (
        <ConvergeVisual brief={validated} placement={placement} t={time} variant={variant} />
      ) : null}

      {validated.template === "handoff" ? (
        <HandoffVisual brief={validated} placement={placement} t={time} variant={variant} />
      ) : null}

      {validated.template === "focus" ? (
        <FocusVisual brief={validated} placement={placement} t={time} variant={variant} />
      ) : null}
    </div>
  );
}
