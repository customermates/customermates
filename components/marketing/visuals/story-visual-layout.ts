import type { VisualPathway, VisualPlacement } from "./visual-contract";

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

type ConvergeGoldenLayout = {
  connectors: {
    2: readonly [AuthoredConnector, AuthoredConnector];
    3: readonly [AuthoredConnector, AuthoredConnector, AuthoredConnector];
  };
  focal: NormalizedBox;
};

type HandoffGoldenLayout = {
  connector: AuthoredConnector;
  cue: NormalizedPoint & { size: number };
  focal: NormalizedBox;
};

export const GOLDEN_LAYOUT = {
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
  } satisfies Record<VisualPlacement, ConvergeGoldenLayout>,
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
  } satisfies Record<VisualPlacement, HandoffGoldenLayout>,
} as const;

function formatCoordinate(value: number) {
  const rounded = Math.round(value * 100_000) / 100_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function authoredConnectorPath(connector: AuthoredConnector) {
  const { control1, control2, source, target } = connector;
  return `M${formatCoordinate(source.x)} ${formatCoordinate(source.y)} C${formatCoordinate(control1.x)} ${formatCoordinate(control1.y)} ${formatCoordinate(control2.x)} ${formatCoordinate(control2.y)} ${formatCoordinate(target.x)} ${formatCoordinate(target.y)}`;
}

export function goldenConnectorCount(pathway: VisualPathway, supportingSubjectCount: number) {
  if (pathway === "focus") return 0;
  if (pathway === "handoff") return 1;
  return supportingSubjectCount === 2 || supportingSubjectCount === 3 ? supportingSubjectCount : 0;
}
