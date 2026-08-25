import type { CSSProperties } from "react";

import { Check } from "lucide-react";

import { VISUAL_PERSON_FIXTURES, VISUAL_PROVIDER_FIXTURES, type VisualPersonFixtureId } from "./native-fixtures";
import { PersonAvatar, ProviderMark } from "./native-visual-primitives";
import { UNIFIED_INBOX_FILM_COPY } from "./unified-inbox-film.copy";
import {
  UNIFIED_INBOX_STORYBOARD_LAYOUT,
  authoredConnectorPath,
  trimAuthoredConnector,
  type AuthoredStoryboardBox,
} from "./story-visual-layout";

import { cn } from "@/core/utils/cn";
import type { ContentLocale } from "@/i18n/locale-registry";

export const UNIFIED_INBOX_FILM_CONTRACT = {
  fps: 24,
  posterTime: 0.56,
  resolvedHold: { end: 0.78, start: 0.34 },
  seconds: 10,
  transitionWindows: [
    {
      end: 0.34,
      id: "incoming-resolve",
      minSimilarity: 0.85,
      progressField: "arrivalProgress",
      start: 0.03,
    },
    {
      end: 0.94,
      id: "semantic-reset",
      minSimilarity: 0.85,
      progressField: "resetProgress",
      start: 0.78,
    },
  ],
} as const;

type UnifiedInboxProvider = keyof (typeof UNIFIED_INBOX_STORYBOARD_LAYOUT)["wide"]["sources"];

export type UnifiedInboxFilmLocale = ContentLocale;

export type UnifiedInboxFilmBrief = {
  activeProvider: UnifiedInboxProvider;
  channels: readonly {
    person: VisualPersonFixtureId;
    provider: UnifiedInboxProvider;
  }[];
  contact: {
    detail: string;
    entity: string;
    person: VisualPersonFixtureId;
  };
  thread: {
    preview: string;
    subject: string;
  };
};

export type UnifiedInboxFilmState = {
  arrivalProgress: number;
  compositionOpacity: number;
  resetProgress: number;
  resolvedProgress: number;
  showOpeningState: boolean;
  threadProgress: number;
};

type UnifiedInboxArtworkPlacement = keyof typeof UNIFIED_INBOX_STORYBOARD_LAYOUT;
type UnifiedInboxArtworkScale = "film" | "preview";

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothProgress(time: number, start: number, end: number) {
  const progress = clamp((time - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function unifiedInboxFilmState(time: number): UnifiedInboxFilmState {
  const t = clamp(time);
  const resetProgress = smoothProgress(t, 0.78, 0.94);
  const showOpeningState = t >= 0.86;
  const compositionOpacity =
    t < 0.78 ? 1 : t < 0.86 ? 1 - smoothProgress(t, 0.78, 0.86) : smoothProgress(t, 0.86, 0.94);

  if (showOpeningState) {
    return {
      arrivalProgress: 0,
      compositionOpacity,
      resetProgress,
      resolvedProgress: 0,
      showOpeningState,
      threadProgress: 0,
    };
  }

  return {
    arrivalProgress: smoothProgress(t, 0.03, 0.3),
    compositionOpacity,
    resetProgress,
    resolvedProgress: smoothProgress(t, 0.28, 0.34),
    showOpeningState,
    threadProgress: smoothProgress(t, 0.18, 0.32),
  };
}

export const UNIFIED_INBOX_KEYFRAME_STATES = {
  focal: {
    arrivalProgress: 1,
    compositionOpacity: 1,
    resetProgress: 0,
    resolvedProgress: 0,
    showOpeningState: false,
    threadProgress: 1,
  },
  opening: {
    arrivalProgress: 0,
    compositionOpacity: 1,
    resetProgress: 0,
    resolvedProgress: 0,
    showOpeningState: true,
    threadProgress: 0,
  },
  resolved: {
    arrivalProgress: 1,
    compositionOpacity: 1,
    resetProgress: 0,
    resolvedProgress: 1,
    showOpeningState: false,
    threadProgress: 1,
  },
} as const satisfies Record<"focal" | "opening" | "resolved", UnifiedInboxFilmState>;

function boxStyle(box: AuthoredStoryboardBox): CSSProperties {
  return {
    height: `${box.height}%`,
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
  };
}

function InboxConnector({
  phase,
  placement,
  progress,
  scale,
}: {
  phase?: "focal" | "opening" | "resolved";
  placement: UnifiedInboxArtworkPlacement;
  progress: number;
  scale: UnifiedInboxArtworkScale;
}) {
  const connector = UNIFIED_INBOX_STORYBOARD_LAYOUT[placement].connector;
  const visibleConnector = trimAuthoredConnector(connector, progress);

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 z-10 size-full text-primary"
      data-film-connector="gmail-contact"
      data-inbox-connector="gmail-contact"
      data-inbox-phase={phase}
      data-inbox-placement={placement}
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <path
        d={authoredConnectorPath(connector, progress)}
        data-connector-draw-target={`${visibleConnector.target.x},${visibleConnector.target.y}`}
        data-connector-source={`${connector.source.x},${connector.source.y}`}
        data-connector-target={`${connector.target.x},${connector.target.y}`}
        data-motion-behavior="solid-prefix-draw"
        data-motion-progress={progress.toFixed(scale === "film" ? 4 : 3)}
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeOpacity={0.82 * progress}
        strokeWidth={scale === "film" ? 2.5 : 1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function InboxSource({
  activeProvider,
  channel,
  placement,
  progress,
  scale,
}: {
  activeProvider: UnifiedInboxProvider;
  channel: UnifiedInboxFilmBrief["channels"][number];
  placement: UnifiedInboxArtworkPlacement;
  progress: number;
  scale: UnifiedInboxArtworkScale;
}) {
  const active = channel.provider === activeProvider;
  const person = VISUAL_PERSON_FIXTURES[channel.person];
  const provider = VISUAL_PROVIDER_FIXTURES[channel.provider];
  const activeProgress = active ? progress : 0;

  return (
    <div
      className={cn(
        "absolute z-20 flex min-w-0 overflow-hidden rounded-card border bg-card shadow-sm",
        scale === "film"
          ? "items-center gap-4 px-5"
          : placement === "wide"
            ? "items-center gap-2 px-2"
            : "flex-col items-center justify-center gap-1 px-1",
        active ? "text-foreground" : "border-border text-muted-foreground opacity-60",
      )}
      data-film-source={channel.provider}
      data-film-source-state={activeProgress > 0.02 ? "active" : "quiet"}
      data-inbox-source={channel.provider}
      style={{
        ...boxStyle(UNIFIED_INBOX_STORYBOARD_LAYOUT[placement].sources[channel.provider]),
        borderColor:
          activeProgress > 0
            ? `color-mix(in srgb, var(--primary) ${Math.round(62 * activeProgress)}%, var(--border))`
            : undefined,
        boxShadow:
          activeProgress > 0
            ? `0 20px 60px color-mix(in srgb, var(--primary) ${Math.round(14 * activeProgress)}%, transparent)`
            : undefined,
        transform: active ? `translateX(${(1 - activeProgress) * -10}px)` : undefined,
      }}
    >
      <div className={cn("flex shrink-0 items-center", scale === "film" ? "-space-x-2" : "-space-x-1.5")}>
        <span
          className={cn(
            "z-10 grid shrink-0 place-items-center rounded-full border border-border bg-background",
            scale === "film" ? "p-2" : "p-1",
          )}
        >
          <ProviderMark provider={channel.provider} size={scale === "film" ? 30 : placement === "wide" ? 18 : 16} />
        </span>

        <PersonAvatar person={channel.person} size={scale === "film" ? 44 : placement === "wide" ? 26 : 20} />
      </div>

      <div className={cn("min-w-0", scale === "preview" && placement === "narrow" && "w-full text-center")}>
        {scale === "film" || placement === "wide" ? (
          <span
            className={cn(
              "block truncate leading-tight tracking-wide uppercase",
              scale === "film" ? "text-xs" : "text-[9px]",
            )}
          >
            {provider.name}
          </span>
        ) : null}

        <span
          className={cn(
            "block truncate leading-tight font-medium text-foreground",
            scale === "film" ? "mt-1 text-base" : "mt-0.5 text-[10px]",
          )}
        >
          {person.name}
        </span>
      </div>

      {active ? (
        <span
          aria-hidden="true"
          className={cn("shrink-0 rounded-full bg-primary", scale === "film" ? "ml-auto size-2.5" : "ml-auto size-1.5")}
          style={{
            opacity: activeProgress,
            transform: `scale(${0.7 + 0.3 * activeProgress})`,
          }}
        />
      ) : null}
    </div>
  );
}

function InboxContact({
  brief,
  copy,
  placement,
  resolvedProgress,
  scale,
  threadProgress,
}: {
  brief: UnifiedInboxFilmBrief;
  copy: (typeof UNIFIED_INBOX_FILM_COPY)[UnifiedInboxFilmLocale];
  placement: UnifiedInboxArtworkPlacement;
  resolvedProgress: number;
  scale: UnifiedInboxArtworkScale;
  threadProgress: number;
}) {
  const person = VISUAL_PERSON_FIXTURES[brief.contact.person];

  return (
    <div
      className={cn(
        "absolute z-20 flex min-w-0 flex-col overflow-hidden rounded-panel border bg-card shadow-2xl",
        scale === "film" ? "p-10" : placement === "wide" ? "p-[6%]" : "p-[5%]",
      )}
      data-film-contact={brief.contact.person}
      data-film-contact-entity={copy.contactEntity}
      style={{
        ...boxStyle(UNIFIED_INBOX_STORYBOARD_LAYOUT[placement].contact),
        borderColor:
          resolvedProgress > 0
            ? `color-mix(in srgb, var(--primary) ${Math.round(64 * resolvedProgress)}%, var(--border-strong))`
            : "var(--border-strong)",
        boxShadow: `0 30px 100px color-mix(in srgb, var(--primary) ${Math.round(10 + 10 * resolvedProgress)}%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <span
          className={cn(
            "font-medium tracking-wide text-muted-foreground uppercase",
            scale === "film" ? "text-sm" : "text-[9px]",
          )}
        >
          {copy.contactEntity}
        </span>

        <span
          aria-label={copy.matchedLabel}
          className={cn(
            "grid place-items-center rounded-full bg-primary text-primary-foreground",
            scale === "film" ? "size-9" : "size-5",
          )}
          style={{
            opacity: resolvedProgress,
            transform: `scale(${0.7 + 0.3 * resolvedProgress})`,
          }}
        >
          <Check aria-hidden="true" className={scale === "film" ? "size-5" : "size-3"} strokeWidth={2.5} />
        </span>
      </div>

      <div className={cn("flex min-w-0 items-center", scale === "film" ? "mt-8 gap-5" : "mt-[6%] gap-[6%]")}>
        <PersonAvatar person={brief.contact.person} size={scale === "film" ? 66 : placement === "wide" ? 34 : 30} />

        <div className="min-w-0">
          <p className={cn("truncate leading-tight font-medium", scale === "film" ? "text-2xl" : "text-xs sm:text-sm")}>
            {person.name}
          </p>

          <p
            className={cn(
              "line-clamp-2 leading-snug text-muted-foreground",
              scale === "film" ? "mt-2 text-sm" : "mt-1 text-[9px]",
            )}
          >
            {copy.contactDetail}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mt-auto flex min-w-0 items-start rounded-card border border-primary/45 bg-primary/7",
          scale === "film" ? "gap-5 p-6" : "gap-[6%] p-[5%]",
        )}
        data-film-thread-state={threadProgress >= 1 ? (resolvedProgress > 0 ? "resolved" : "incoming") : "waiting"}
        style={{ opacity: 0.25 + 0.75 * threadProgress }}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full border border-border bg-card",
            scale === "film" ? "p-2" : "p-1",
          )}
        >
          <ProviderMark provider={brief.activeProvider} size={scale === "film" ? 30 : 18} />
        </span>

        <div className="grid min-w-0 flex-1">
          <div
            aria-hidden="true"
            className={cn("col-start-1 row-start-1", scale === "film" ? "space-y-3 py-2" : "space-y-1.5 py-0.5")}
            style={{ opacity: 1 - threadProgress }}
          >
            <div className={cn("w-4/5 rounded-full bg-placeholder", scale === "film" ? "h-3" : "h-1.5")} />

            <div className={cn("w-1/2 rounded-full bg-muted", scale === "film" ? "h-3" : "h-1.5")} />
          </div>

          <div className="col-start-1 row-start-1" style={{ opacity: threadProgress }}>
            <p className={cn("line-clamp-2 leading-tight font-medium", scale === "film" ? "text-lg" : "text-[10px]")}>
              {copy.threadSubject}
            </p>

            {scale === "film" || placement === "wide" ? (
              <p
                className={cn(
                  "line-clamp-2 text-muted-foreground",
                  scale === "film" ? "mt-3 text-sm leading-relaxed" : "mt-1.5 text-[9px] leading-tight",
                )}
              >
                {copy.threadPreview}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function UnifiedInboxArtwork({
  brief,
  locale = "en",
  phase,
  placement,
  scale,
  state,
}: {
  brief: UnifiedInboxFilmBrief;
  locale?: UnifiedInboxFilmLocale;
  phase?: "focal" | "opening" | "resolved";
  placement: UnifiedInboxArtworkPlacement;
  scale: UnifiedInboxArtworkScale;
  state: UnifiedInboxFilmState;
}) {
  const copy = UNIFIED_INBOX_FILM_COPY[locale];

  return (
    <div
      className="relative size-full"
      data-inbox-artwork-placement={placement}
      data-inbox-artwork-scale={scale}
      style={{ opacity: state.compositionOpacity }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute rounded-full bg-primary/12 blur-3xl",
          placement === "wide" ? "top-[8%] right-[1%] size-[62%]" : "right-[-12%] bottom-[2%] size-[78%]",
        )}
      />

      <InboxConnector phase={phase} placement={placement} progress={state.arrivalProgress} scale={scale} />

      {brief.channels.map((channel) => (
        <InboxSource
          key={channel.provider}
          activeProvider={brief.activeProvider}
          channel={channel}
          placement={placement}
          progress={state.arrivalProgress}
          scale={scale}
        />
      ))}

      <InboxContact
        brief={brief}
        copy={copy}
        placement={placement}
        resolvedProgress={state.resolvedProgress}
        scale={scale}
        threadProgress={state.threadProgress}
      />
    </div>
  );
}

export function UnifiedInboxFilm({
  brief,
  locale = "en",
  t,
}: {
  brief: UnifiedInboxFilmBrief;
  locale?: UnifiedInboxFilmLocale;
  t: number;
}) {
  const state = unifiedInboxFilmState(t);
  const copy = UNIFIED_INBOX_FILM_COPY[locale];

  return (
    <div
      aria-label={copy.ariaLabel}
      className="relative isolate h-[920px] w-[1280px] overflow-hidden bg-sidebar text-foreground"
      data-film-arrival-progress={state.arrivalProgress.toFixed(4)}
      data-film-composition-opacity={state.compositionOpacity.toFixed(4)}
      data-film-opening-state={state.showOpeningState ? "1" : "0"}
      data-film-reset-progress={state.resetProgress.toFixed(4)}
      data-film-resolved-progress={state.resolvedProgress.toFixed(4)}
      data-film-thread-progress={state.threadProgress.toFixed(4)}
      data-scene-film="unified-inbox"
      role="img"
    >
      <div className="absolute inset-[7.8%_7%]">
        <UnifiedInboxArtwork brief={brief} locale={locale} placement="wide" scale="film" state={state} />
      </div>
    </div>
  );
}
