import type { VisualProviderFixtureId } from "./native-fixtures";

export const OMNICHANNEL_PROVIDER_ORDER = [
  "gmail",
  "outlook",
  "linkedin",
  "whatsapp",
  "telegram",
  "instagram",
  "imap",
] as const satisfies readonly VisualProviderFixtureId[];

export type OmnichannelProviderId = (typeof OMNICHANNEL_PROVIDER_ORDER)[number];

export type OmnichannelPoint = Readonly<{
  x: number;
  y: number;
}>;

export type OmnichannelBox = OmnichannelPoint &
  Readonly<{
    height: number;
    width: number;
  }>;

export type OmnichannelSatellite = Readonly<{
  angleDegrees: number;
  box: OmnichannelBox;
  center: OmnichannelPoint;
  index: number;
  provider: OmnichannelProviderId;
}>;

export type OmnichannelConnector = Readonly<{
  provider: OmnichannelProviderId;
  source: OmnichannelPoint;
  target: OmnichannelPoint;
}>;

export type OmnichannelSplitGeometry = Readonly<{
  connectors: readonly OmnichannelConnector[];
  record: OmnichannelBox;
  satellites: readonly OmnichannelSatellite[];
  viewBox: OmnichannelBox;
}>;

export const OMNICHANNEL_SPLIT_RECORD_BOX = {
  height: 56,
  width: 42,
  x: 29,
  y: 22,
} as const satisfies OmnichannelBox;

export const OMNICHANNEL_SPLIT_VIEW_BOX = {
  height: 100,
  width: 100,
  x: 0,
  y: 0,
} as const satisfies OmnichannelBox;

export const OMNICHANNEL_SPLIT_ORBIT = {
  center: { x: 50, y: 50 },
  radiusX: 38,
  radiusY: 40,
  satelliteSize: 9,
  startAngleDegrees: -90,
} as const;

const COORDINATE_PRECISION = 1_000_000;

function coordinate(value: number) {
  const rounded = Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function omnichannelBoxCenter(box: OmnichannelBox): OmnichannelPoint {
  return {
    x: coordinate(box.x + box.width / 2),
    y: coordinate(box.y + box.height / 2),
  };
}

export function omnichannelSatelliteCenter(provider: OmnichannelProviderId): OmnichannelPoint {
  const index = OMNICHANNEL_PROVIDER_ORDER.indexOf(provider);
  const angleDegrees = OMNICHANNEL_SPLIT_ORBIT.startAngleDegrees + (index * 360) / OMNICHANNEL_PROVIDER_ORDER.length;
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: coordinate(OMNICHANNEL_SPLIT_ORBIT.center.x + Math.cos(angleRadians) * OMNICHANNEL_SPLIT_ORBIT.radiusX),
    y: coordinate(OMNICHANNEL_SPLIT_ORBIT.center.y + Math.sin(angleRadians) * OMNICHANNEL_SPLIT_ORBIT.radiusY),
  };
}

export function omnichannelSatelliteBox(provider: OmnichannelProviderId): OmnichannelBox {
  const center = omnichannelSatelliteCenter(provider);
  const size = OMNICHANNEL_SPLIT_ORBIT.satelliteSize;

  return {
    height: size,
    width: size,
    x: coordinate(center.x - size / 2),
    y: coordinate(center.y - size / 2),
  };
}

export function omnichannelRayToBoxBoundary(box: OmnichannelBox, toward: OmnichannelPoint): OmnichannelPoint {
  const center = omnichannelBoxCenter(box);
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;

  if (deltaX === 0 && deltaY === 0) throw new Error("A connector ray needs two distinct box centres");

  const horizontalScale = deltaX === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(deltaX);
  const verticalScale = deltaY === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(deltaY);
  const scale = Math.min(horizontalScale, verticalScale);

  return {
    x: coordinate(center.x + deltaX * scale),
    y: coordinate(center.y + deltaY * scale),
  };
}

export function omnichannelConnectorBetweenBoxes(
  provider: OmnichannelProviderId,
  sourceBox: OmnichannelBox,
  targetBox: OmnichannelBox,
): OmnichannelConnector {
  if (omnichannelBoxesOverlap(sourceBox, targetBox))
    throw new Error(`${provider} satellite overlaps the centred customer record`);

  const sourceCenter = omnichannelBoxCenter(sourceBox);
  const targetCenter = omnichannelBoxCenter(targetBox);

  return {
    provider,
    source: omnichannelRayToBoxBoundary(sourceBox, targetCenter),
    target: omnichannelRayToBoxBoundary(targetBox, sourceCenter),
  };
}

export function omnichannelBoxesOverlap(left: OmnichannelBox, right: OmnichannelBox) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function createOmnichannelSplitGeometry(): OmnichannelSplitGeometry {
  const record = OMNICHANNEL_SPLIT_RECORD_BOX;
  const satellites = OMNICHANNEL_PROVIDER_ORDER.map((provider, index) => {
    const angleDegrees = coordinate(
      OMNICHANNEL_SPLIT_ORBIT.startAngleDegrees + (index * 360) / OMNICHANNEL_PROVIDER_ORDER.length,
    );
    const center = omnichannelSatelliteCenter(provider);

    return {
      angleDegrees,
      box: omnichannelSatelliteBox(provider),
      center,
      index,
      provider,
    } satisfies OmnichannelSatellite;
  });
  const connectors = satellites.map(({ box, provider }) => omnichannelConnectorBetweenBoxes(provider, box, record));

  return {
    connectors,
    record,
    satellites,
    viewBox: OMNICHANNEL_SPLIT_VIEW_BOX,
  };
}

export const OMNICHANNEL_SPLIT_GEOMETRY = createOmnichannelSplitGeometry();
