import type { VisualPlacement, VisualTemplate, VisualVariant } from "./visual-contract";

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type NormalizedBox = NormalizedPoint & {
  height?: number;
  width: number;
};

export type AuthoredConnector = {
  control1: NormalizedPoint;
  control2: NormalizedPoint;
  source: NormalizedPoint;
  target: NormalizedPoint;
};

type ConvergeEdgeLayout = {
  connectors: {
    2: readonly [AuthoredConnector, AuthoredConnector];
    3: readonly [AuthoredConnector, AuthoredConnector, AuthoredConnector];
  };
  focal: NormalizedBox;
};

type HandoffEdgeLayout = {
  connector: AuthoredConnector;
  cue: NormalizedPoint & { size: number };
  focal: NormalizedBox;
};

export type AuthoredStoryboardBox = NormalizedBox & {
  height: number;
};

type UnifiedInboxStoryboardLayout = {
  connector: AuthoredConnector;
  contact: AuthoredStoryboardBox;
  sources: {
    gmail: AuthoredStoryboardBox;
    linkedin: AuthoredStoryboardBox;
    whatsapp: AuthoredStoryboardBox;
  };
};

type AgentPipelineStoryboardLayout = {
  connector: AuthoredConnector;
  destination: AuthoredStoryboardBox;
  instruction: AuthoredStoryboardBox;
  origin: AuthoredStoryboardBox;
  record: AuthoredStoryboardBox & {
    follows: "x" | "y";
  };
};

export const UNIFIED_INBOX_STORYBOARD_LAYOUT = {
  narrow: {
    connector: {
      control1: { x: 19, y: 34 },
      control2: { x: 31, y: 37 },
      source: { x: 19, y: 28 },
      target: { x: 38, y: 43 },
    },
    contact: { height: 53, width: 95, x: 9, y: 43 },
    sources: {
      gmail: { height: 20, width: 30, x: 4, y: 8 },
      linkedin: { height: 20, width: 30, x: 35, y: 8 },
      whatsapp: { height: 20, width: 30, x: 66, y: 8 },
    },
  },
  wide: {
    connector: {
      control1: { x: 44, y: 23 },
      control2: { x: 48, y: 31 },
      source: { x: 38, y: 23 },
      target: { x: 54, y: 31 },
    },
    contact: { height: 84, width: 50, x: 54, y: 8 },
    sources: {
      gmail: { height: 22, width: 34, x: 4, y: 12 },
      linkedin: { height: 18, width: 34, x: 2, y: 41 },
      whatsapp: { height: 18, width: 34, x: 7, y: 70 },
    },
  },
} as const satisfies Record<"narrow" | "wide", UnifiedInboxStoryboardLayout>;

export const AGENT_PIPELINE_STORYBOARD_LAYOUT = {
  narrow: {
    connector: {
      control1: { x: 65, y: 45 },
      control2: { x: 65, y: 56 },
      source: { x: 65, y: 34 },
      target: { x: 65, y: 67 },
    },
    destination: { height: 11, width: 24, x: 5, y: 61.5 },
    instruction: { height: 14, width: 88, x: 6, y: 7 },
    origin: { height: 11, width: 24, x: 53, y: 23 },
    record: { follows: "y", height: 27, width: 62, x: 34, y: 34 },
  },
  wide: {
    connector: {
      control1: { x: 34, y: 54 },
      control2: { x: 48, y: 54 },
      source: { x: 20, y: 54 },
      target: { x: 62, y: 54 },
    },
    destination: { height: 11, width: 16, x: 54, y: 80 },
    instruction: { height: 15, width: 52, x: 5, y: 9 },
    origin: { height: 11, width: 17, x: 3, y: 48.5 },
    record: { follows: "x", height: 40, width: 38, x: 20, y: 34 },
  },
} as const satisfies Record<"narrow" | "wide", AgentPipelineStoryboardLayout>;

export const STORY_VISUAL_EDGE_LAYOUT = {
  converge: {
    narrow: {
      connectors: {
        2: [
          {
            control1: { x: 30, y: 29 },
            control2: { x: 39, y: 34 },
            source: { x: 30, y: 18 },
            target: { x: 42, y: 41.75 },
          },
          {
            control1: { x: 70, y: 29 },
            control2: { x: 61, y: 34 },
            source: { x: 70, y: 18 },
            target: { x: 58, y: 41.75 },
          },
        ],
        3: [
          {
            control1: { x: 22.2, y: 30 },
            control2: { x: 34, y: 35 },
            source: { x: 22.2, y: 19.4 },
            target: { x: 38, y: 41.75 },
          },
          {
            control1: { x: 51.4, y: 29 },
            control2: { x: 50, y: 35 },
            source: { x: 51.4, y: 14 },
            target: { x: 50, y: 41.75 },
          },
          {
            control1: { x: 79.6, y: 30 },
            control2: { x: 66, y: 35 },
            source: { x: 79.6, y: 20 },
            target: { x: 62, y: 41.75 },
          },
        ],
      },
      focal: { width: 88, x: 24, y: 41.75 },
    },
    split: {
      connectors: {
        2: [
          {
            control1: { x: 30, y: 33 },
            control2: { x: 39, y: 40 },
            source: { x: 30, y: 18 },
            target: { x: 42, y: 49.5 },
          },
          {
            control1: { x: 70, y: 33 },
            control2: { x: 61, y: 40 },
            source: { x: 70, y: 18 },
            target: { x: 58, y: 49.5 },
          },
        ],
        3: [
          {
            control1: { x: 18.3, y: 33 },
            control2: { x: 34, y: 38 },
            source: { x: 18.3, y: 16.9 },
            target: { x: 38, y: 49.5 },
          },
          {
            control1: { x: 48.1, y: 31 },
            control2: { x: 50, y: 38 },
            source: { x: 48.1, y: 11.9 },
            target: { x: 50, y: 49.5 },
          },
          {
            control1: { x: 82.9, y: 33 },
            control2: { x: 67, y: 38 },
            source: { x: 82.9, y: 17.9 },
            target: { x: 62, y: 49.5 },
          },
        ],
      },
      focal: { width: 86, x: 24, y: 49.5 },
    },
    wide: {
      connectors: {
        2: [
          {
            control1: { x: 39, y: 35 },
            control2: { x: 45, y: 42 },
            source: { x: 27.5, y: 35 },
            target: { x: 55, y: 42 },
          },
          {
            control1: { x: 34, y: 70 },
            control2: { x: 45, y: 58 },
            source: { x: 16.5, y: 70 },
            target: { x: 55, y: 58 },
          },
        ],
        3: [
          {
            control1: { x: 38, y: 25 },
            control2: { x: 44, y: 35 },
            source: { x: 27.5, y: 25 },
            target: { x: 55, y: 35 },
          },
          {
            control1: { x: 31, y: 50 },
            control2: { x: 42, y: 50 },
            source: { x: 11.5, y: 50 },
            target: { x: 55, y: 50 },
          },
          {
            control1: { x: 34, y: 80 },
            control2: { x: 44, y: 65 },
            source: { x: 17.5, y: 80 },
            target: { x: 55, y: 65 },
          },
        ],
      },
      focal: { width: 49, x: 55, y: 17 },
    },
  } satisfies Record<VisualPlacement, ConvergeEdgeLayout>,
  handoff: {
    narrow: {
      connector: {
        control1: { x: 21, y: 32 },
        control2: { x: 31, y: 38 },
        source: { x: 21, y: 21 },
        target: { x: 35, y: 43.5 },
      },
      cue: { size: 18, x: 21, y: 21 },
      focal: { width: 88, x: 10, y: 43.5 },
    },
    split: {
      connector: {
        control1: { x: 21, y: 34 },
        control2: { x: 31, y: 42 },
        source: { x: 21, y: 21 },
        target: { x: 35, y: 49.5 },
      },
      cue: { size: 18, x: 21, y: 21 },
      focal: { width: 86, x: 11, y: 49.5 },
    },
    wide: {
      connector: {
        control1: { x: 28, y: 36.8 },
        control2: { x: 37, y: 35 },
        source: { x: 16.5, y: 36.8 },
        target: { x: 48, y: 35 },
      },
      cue: { size: 11, x: 16.5, y: 36.8 },
      focal: { width: 49, x: 48, y: 17 },
    },
  } satisfies Record<VisualPlacement, HandoffEdgeLayout>,
} as const;

export const STORY_VISUAL_MOTION = {
  connector: {
    end: 0.5,
    stagger: 0.06,
    start: 0.22,
  },
  focalAccent: { end: 0.68, start: 0.56 },
  focalSurface: { end: 0.28, start: 0.12 },
  resolvedStart: 0.68,
  source: {
    end: 0.16,
    stagger: 0.04,
    start: 0,
  },
} as const;

export function storyBeatProgress(time: number, start: number, end: number) {
  const linear = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return 1 - (1 - linear) ** 3;
}

export function connectorDrawProgress(time: number, index = 0) {
  const { end, stagger, start } = STORY_VISUAL_MOTION.connector;
  return storyBeatProgress(time, start + index * stagger, end + index * stagger);
}

export function sourceRevealProgress(time: number, index = 0) {
  const { end, stagger, start } = STORY_VISUAL_MOTION.source;
  return storyBeatProgress(time, start + index * stagger, end + index * stagger);
}

export function focalSurfaceProgress(time: number) {
  const { end, start } = STORY_VISUAL_MOTION.focalSurface;
  return storyBeatProgress(time, start, end);
}

export function focalAccentProgress(time: number) {
  const { end, start } = STORY_VISUAL_MOTION.focalAccent;
  return storyBeatProgress(time, start, end);
}

function interpolatePoint(from: NormalizedPoint, to: NormalizedPoint, progress: number): NormalizedPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

export function trimAuthoredConnector(connector: AuthoredConnector, progress: number): AuthoredConnector {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw new Error("Connector trim progress must be normalized between zero and one");

  if (progress === 1) return connector;
  if (progress === 0) {
    return {
      control1: connector.source,
      control2: connector.source,
      source: connector.source,
      target: connector.source,
    };
  }

  const sourceControl = interpolatePoint(connector.source, connector.control1, progress);
  const middleControl = interpolatePoint(connector.control1, connector.control2, progress);
  const targetControl = interpolatePoint(connector.control2, connector.target, progress);
  const prefixControl = interpolatePoint(sourceControl, middleControl, progress);
  const suffixControl = interpolatePoint(middleControl, targetControl, progress);

  return {
    control1: sourceControl,
    control2: prefixControl,
    source: connector.source,
    target: interpolatePoint(prefixControl, suffixControl, progress),
  };
}

function formatCoordinate(value: number) {
  const rounded = Math.round(value * 100_000) / 100_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function authoredConnectorPath(connector: AuthoredConnector, progress = 1) {
  const { control1, control2, source, target } = trimAuthoredConnector(connector, progress);
  return `M${formatCoordinate(source.x)} ${formatCoordinate(source.y)} C${formatCoordinate(control1.x)} ${formatCoordinate(control1.y)} ${formatCoordinate(control2.x)} ${formatCoordinate(control2.y)} ${formatCoordinate(target.x)} ${formatCoordinate(target.y)}`;
}

export function visibleConnectorCount(
  template: VisualTemplate,
  variant: VisualVariant,
  supportingSubjectCount: number,
) {
  if (variant !== "edge" || template === "focus") return 0;
  if (template === "handoff") return 1;
  return supportingSubjectCount === 2 || supportingSubjectCount === 3 ? supportingSubjectCount : 0;
}
