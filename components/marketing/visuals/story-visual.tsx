import type { CSSProperties, ReactNode } from "react";
import { Send } from "lucide-react";

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
import { type GoldenVisualBrief, validateGoldenVisualBrief } from "./goldens";
import type { VisualPlacement } from "./visual-contract";
import {
  GOLDEN_LAYOUT,
  authoredConnectorPath,
  connectorDrawProgress,
  focalAccentProgress,
  focalSurfaceProgress,
  sourceRevealProgress,
  trimAuthoredConnector,
  type AuthoredConnector,
  type NormalizedBox,
  type NormalizedPoint,
} from "./story-visual-layout";

export type GoldenStoryVisualTheme = "light" | "dark";

type GoldenStoryVisualProps = {
  brief: GoldenVisualBrief;
  placement: VisualPlacement;
  t?: number;
  theme: GoldenStoryVisualTheme;
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

const FOCUS_FOCAL_POSITION: Record<VisualPlacement, string> = {
  narrow: "right-[2%] bottom-[8%] w-[88%]",
  split: "right-[3%] bottom-[7%] w-[86%]",
  wide: "right-[3%] top-[17%] w-[49%]",
};

function normalizedTime(t: number | undefined) {
  const time = t ?? 1;
  if (!Number.isFinite(time) || time < 0 || time > 1)
    throw new Error("GoldenStoryVisual time must be normalized between zero and one");

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

function AmbientField({ placement }: { placement: VisualPlacement }) {
  return (
    <DepthPlane className="pointer-events-none absolute inset-0" depth={1}>
      <div
        className={cn(
          "absolute rounded-full bg-primary/15 blur-3xl",
          placement === "wide" ? "right-[8%] top-[8%] size-[54%]" : "-right-[18%] bottom-[4%] size-[82%]",
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
  subject: GoldenVisualBrief["supportingSubjects"][number];
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
  subjectPrefix,
  time,
}: {
  connectors: readonly AuthoredConnector[];
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
            strokeOpacity={index === 0 ? 0.72 : 0.32}
            strokeWidth={index === 0 ? 1.25 : 1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function convergeGoldenConnectors(placement: VisualPlacement, count: number) {
  const connectors = GOLDEN_LAYOUT.converge[placement].connectors;
  if (count === 2) return connectors[2];
  if (count === 3) return connectors[3];
  throw new Error("Converge connector geometry supports two or three sources");
}

function ConvergeSupports({
  placement,
  subjects,
  time,
}: {
  placement: VisualPlacement;
  subjects: GoldenVisualBrief["supportingSubjects"];
  time: number;
}) {
  const connectors = convergeGoldenConnectors(placement, subjects.length);

  return (
    <DepthPlane className="absolute inset-0" depth={2}>
      <ConnectorLayer connectors={connectors} subjectPrefix="connector" time={time} />

      {subjects.map((subject, index) => {
        const connector = connectors[index];
        if (!connector) throw new Error(`${subject.id} is missing authored connector geometry`);

        return (
          <div key={subject.id} className="absolute" style={normalizedCenterStyle(connector.source)}>
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
  person,
  placement,
  progress,
  provider,
}: {
  label?: string;
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
    </div>
  );
}

function ConvergeVisual({ brief, placement, t }: Pick<GoldenStoryVisualProps, "brief" | "placement" | "t">) {
  const time = normalizedTime(t);
  const focalProgress = focalSurfaceProgress(time);
  const accentProgress = focalAccentProgress(time);
  const person = brief.focalSubject.fixtures?.person;
  const activeSource = brief.supportingSubjects.find((subject) => subject.fixtures?.person);
  const provider = activeSource?.fixtures?.provider;
  if (!person || !provider) throw new Error("Converge requires a fixture-backed active source and matching record");

  return (
    <>
      <AmbientField placement={placement} />

      <ConvergeSupports placement={placement} subjects={brief.supportingSubjects} time={time} />

      <FocalPlane
        anchorGeometry
        className=""
        initialOpacity={0.14}
        style={normalizedBoxStyle(GOLDEN_LAYOUT.converge[placement].focal)}
        t={focalProgress}
      >
        <RecordAnchor
          label={brief.focalLabel?.text}
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
}: {
  placement: VisualPlacement;
  provider: VisualAgentProviderFixtureId;
  subjectId: string;
}) {
  const cue = GOLDEN_LAYOUT.handoff[placement].cue;

  return (
    <NativeAgentProviderIdentity
      className={cn(
        "absolute z-10 rounded-full border border-border-strong bg-card px-2 py-1.5 text-[9px] text-foreground shadow-sm",
      )}
      iconSize={placement === "wide" ? 18 : 16}
      motionSubject={subjectId}
      provider={provider}
      style={normalizedCenterStyle(cue)}
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
}: {
  label?: string;
  person: VisualPersonFixtureId;
  placement: VisualPlacement;
}) {
  return (
    <div
      className={cn(
        "absolute z-10 flex items-center gap-2 rounded-xl border border-border-strong bg-card p-1.5 shadow-lg",
        "bottom-[4%]",
        "right-[18%]",
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

function HandoffVisual({ brief, placement, t }: Pick<GoldenStoryVisualProps, "brief" | "placement" | "t">) {
  const time = normalizedTime(t);
  const layout = GOLDEN_LAYOUT.handoff[placement];
  const sendLabel = brief.semanticLabels[0]?.text;
  const person = brief.focalSubject.fixtures?.person;
  const provider = brief.focalSubject.fixtures?.provider;
  const agent = brief.supportingSubjects.find((subject) => subject.form === "agent-cue");
  const human = brief.supportingSubjects.find((subject) => subject.form === "human-action")?.fixtures?.person;
  if (!person || !provider || !agent || !human)
    throw new Error("Handoff requires fixture-backed draft, agent provider, and human identities");

  return (
    <>
      <AmbientField placement={placement} />

      <DepthPlane className="absolute inset-0" depth={2}>
        <ConnectorLayer connectors={[layout.connector]} subjectPrefix="handoff-connector" time={time} />

        <AgentCue placement={placement} provider={agent.agentProvider} subjectId={agent.id} />
      </DepthPlane>

      <FocalPlane anchorGeometry className="" style={normalizedBoxStyle(layout.focal)} t={focalSurfaceProgress(time)}>
        <div className="relative">
          <DraftArtifact label={brief.focalLabel?.text} person={person} placement={placement} provider={provider} />

          <HumanAction label={sendLabel} person={human} placement={placement} />
        </div>
      </FocalPlane>
    </>
  );
}

function recordFixtures(subject: GoldenVisualBrief["supportingSubjects"][number]) {
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
  subject: GoldenVisualBrief["supportingSubjects"][number];
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
  subjects: GoldenVisualBrief["supportingSubjects"];
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
  placement,
  record,
  status,
}: {
  label?: string;
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

function FocusVisual({ brief, placement, t }: Pick<GoldenStoryVisualProps, "brief" | "placement" | "t">) {
  const { person, record, status } = brief.focalSubject.fixtures ?? {};
  const inspectorLabel = brief.semanticLabels[0]?.text;
  if (person && !inspectorLabel) throw new Error("Focus person fixtures require a localized inspector label");

  return (
    <>
      <AmbientField placement={placement} />

      <ContextPlane placement={placement} subjects={brief.supportingSubjects} />

      <FocalPlane className={FOCUS_FOCAL_POSITION[placement]} t={t}>
        <div className="relative">
          {person && inspectorLabel ? (
            <InspectorCue label={inspectorLabel} person={person} placement={placement} />
          ) : null}

          <SignalArtifact label={brief.focalLabel?.text} placement={placement} record={record} status={status} />
        </div>
      </FocalPlane>
    </>
  );
}

export function GoldenStoryVisual({ brief, placement, t, theme }: GoldenStoryVisualProps) {
  const validated = validateGoldenVisualBrief(brief);
  const time = normalizedTime(t);

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
      data-detail-density={DETAIL_DENSITY[placement]}
      data-golden-placement={placement}
      data-story-pathway={validated.pathway}
      data-story-theme={theme}
      data-story-visual={validated.id}
      role="img"
    >
      {validated.pathway === "converge" ? <ConvergeVisual brief={validated} placement={placement} t={time} /> : null}

      {validated.pathway === "handoff" ? <HandoffVisual brief={validated} placement={placement} t={time} /> : null}

      {validated.pathway === "focus" ? <FocusVisual brief={validated} placement={placement} t={time} /> : null}
    </div>
  );
}
