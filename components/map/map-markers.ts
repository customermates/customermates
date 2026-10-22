import type { PointFeature } from "supercluster";
import type { MapViewPoint } from "./map-types";

import Supercluster from "supercluster";

import { ChartColor } from "@/features/widget/widget-display.schema";

import {
  MAX_ZOOM,
  TILE_SIZE,
  isValidCoordinate,
  project,
  toScreen,
  visibleWorldBounds,
  worldToLonLatBounds,
  type Camera,
  type MapSize,
  type ScreenPoint,
  type WorldPoint,
} from "./map-geometry";

export const DEFAULT_CLUSTER_COLOR = ChartColor.primary1;
export const PIN_RADIUS_MIN = 5;
export const PIN_RADIUS_MAX = 14;
export const PIN_RADIUS_DEFAULT = 6;
const CLUSTER_RADIUS = 40;
export const CLUSTER_DIAMETER_MIN = 24;
export const CLUSTER_DIAMETER_MAX = 52;
const MARKER_MARGIN = 0.25;
const SPREAD_GAP = 4;
const SPREAD_CIRCLE_LIMIT = 8;

type PointProperties = { index: number; group: number };
type ClusterTally = { tally: Record<number, number> };

export type ClusterIndex = {
  index: Supercluster<PointProperties, ClusterTally>;
  points: readonly MapViewPoint[];
  groupColors: readonly ChartColor[];
};

export type PinMarker = {
  kind: "pin";
  key: string;
  id: string;
  world: WorldPoint;
  offset: ScreenPoint;
  color: ChartColor;
  radius: number;
  focusable: boolean;
};

export type ClusterMarker = {
  kind: "cluster";
  key: string;
  clusterId: number;
  world: WorldPoint;
  count: number;
  color: ChartColor | null;
  diameter: number;
  expansionZoom: number;
  focusable: boolean;
};

export type MapMarker = PinMarker | ClusterMarker;

export type MarkerSpread = { clusterId: number; world: WorldPoint; ids: readonly string[] };

export function pinRadius(weight: number | null, maxWeight: number) {
  if (weight === null || !Number.isFinite(weight)) return PIN_RADIUS_DEFAULT;
  if (!(maxWeight > 0)) return PIN_RADIUS_MIN;
  const share = Math.min(1, Math.max(0, weight) / maxWeight);
  return PIN_RADIUS_MIN + (PIN_RADIUS_MAX - PIN_RADIUS_MIN) * Math.sqrt(share);
}

export function maxWeightOf(weights: Iterable<number | null>) {
  let max = 0;
  for (const weight of weights) if (weight !== null && Number.isFinite(weight) && weight > max) max = weight;
  return max;
}

export function clusterDiameter(count: number) {
  return Math.min(
    CLUSTER_DIAMETER_MAX,
    Math.max(CLUSTER_DIAMETER_MIN, Math.round(20 + 4 * Math.log2(Math.max(1, count)))),
  );
}

export function majorityGroup(tally: Readonly<Record<number, number>>, total: number) {
  for (const [group, count] of Object.entries(tally)) if (count * 2 > total) return Number(group);
  return null;
}

export function clusterColor(
  tally: Readonly<Record<number, number>>,
  total: number,
  groupColors: readonly ChartColor[],
): ChartColor | null {
  if (Object.keys(tally).length === 0) return DEFAULT_CLUSTER_COLOR;
  const group = majorityGroup(tally, total);
  return group === null ? null : (groupColors[group] ?? null);
}

function mergeTally(left: Readonly<Record<number, number>>, right: Readonly<Record<number, number>>) {
  const merged: Record<number, number> = { ...left };
  for (const [group, count] of Object.entries(right)) merged[Number(group)] = (merged[Number(group)] ?? 0) + count;
  return merged;
}

export function createClusterIndex(points: readonly MapViewPoint[]): ClusterIndex {
  const groupIndexes = new Map<string, number>();
  const groupColors: ChartColor[] = [];
  const features: PointFeature<PointProperties>[] = [];
  points.forEach((point, index) => {
    if (!isValidCoordinate(point.lon, point.lat)) return;
    let group = -1;
    if (point.group !== null) {
      group = groupIndexes.get(point.group) ?? groupColors.length;
      if (group === groupColors.length) {
        groupIndexes.set(point.group, group);
        groupColors.push(point.color);
      }
    }
    features.push({
      type: "Feature",
      properties: { index, group },
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
    });
  });
  const index = new Supercluster<PointProperties, ClusterTally>({
    radius: CLUSTER_RADIUS,
    extent: TILE_SIZE,
    maxZoom: MAX_ZOOM,
    map: ({ group }) => ({ tally: group < 0 ? {} : { [group]: 1 } }),
    reduce: (accumulated, properties) => {
      accumulated.tally = mergeTally(accumulated.tally, properties.tally);
    },
  });
  index.load(features);
  return { index, points, groupColors };
}

function clusterQueryZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(0, Math.round(zoom)));
}

export function spreadOffsets(count: number, spacing: number): ScreenPoint[] {
  if (count <= SPREAD_CIRCLE_LIMIT) {
    const radius = Math.max(spacing, (spacing * count) / (2 * Math.PI));
    return Array.from({ length: count }, (_, step) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * step) / count;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  }
  const offsets: ScreenPoint[] = [];
  let angle = 0;
  let distance = spacing;
  for (let step = 0; step < count; step += 1) {
    offsets.push({ x: distance * Math.cos(angle), y: distance * Math.sin(angle) });
    angle += spacing / distance;
    distance = spacing + (spacing / (2 * Math.PI)) * angle;
  }
  return offsets;
}

export function clusterLeafIds(clusters: ClusterIndex, clusterId: number) {
  return clusters.index
    .getLeaves(clusterId, Infinity)
    .map((leaf) => clusters.points[leaf.properties.index]?.id)
    .filter((id): id is string => id !== undefined);
}

type MarkerInput = {
  clusters: ClusterIndex;
  camera: Camera;
  size: MapSize;
  selectedId: string | null;
  spread: MarkerSpread | null;
};

function isOnScreen(camera: Camera, size: MapSize, world: WorldPoint, offset: ScreenPoint) {
  const { x, y } = toScreen(camera, size, world);
  const left = x + offset.x;
  const top = y + offset.y;
  return left >= 0 && left <= size.width && top >= 0 && top <= size.height;
}

function readingOrder(left: MapMarker, right: MapMarker, camera: Camera, size: MapSize) {
  const a = toScreen(camera, size, left.world);
  const b = toScreen(camera, size, right.world);
  const ay = a.y + (left.kind === "pin" ? left.offset.y : 0);
  const by = b.y + (right.kind === "pin" ? right.offset.y : 0);
  if (Math.abs(ay - by) > 0.5) return ay - by;
  return a.x + (left.kind === "pin" ? left.offset.x : 0) - (b.x + (right.kind === "pin" ? right.offset.x : 0));
}

export function computeMarkers({ clusters, camera, size, selectedId, spread }: MarkerInput): MapMarker[] {
  const { index, points, groupColors } = clusters;
  const bounds = worldToLonLatBounds(visibleWorldBounds(camera, size, MARKER_MARGIN));
  const features = index.getClusters(
    [bounds.west, bounds.south, bounds.east, bounds.north],
    clusterQueryZoom(camera.zoom),
  );
  const byId = new Map(points.map((point) => [point.id, point]));
  const pins: { point: MapViewPoint; world: WorldPoint; offset: ScreenPoint }[] = [];
  const clusterMarkers: ClusterMarker[] = [];
  for (const feature of features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const world = project(longitude, latitude);
    if (!("cluster" in feature.properties)) {
      const point = points[feature.properties.index];
      if (point) pins.push({ point, world, offset: { x: 0, y: 0 } });
      continue;
    }
    const { cluster_id: clusterId, point_count: count, tally } = feature.properties;
    if (spread?.clusterId === clusterId) continue;
    clusterMarkers.push({
      kind: "cluster",
      key: `cluster:${clusterId}`,
      clusterId,
      world,
      count,
      color: clusterColor(tally, count, groupColors),
      diameter: clusterDiameter(count),
      expansionZoom: index.getClusterExpansionZoom(clusterId),
      focusable: isOnScreen(camera, size, world, { x: 0, y: 0 }),
    });
  }
  const spreadPoints = (spread?.ids ?? []).map((id) => byId.get(id)).filter((point) => point !== undefined);
  const placed = new Set(pins.map(({ point }) => point.id));
  for (const point of spreadPoints) placed.add(point.id);
  const selected = selectedId === null ? undefined : byId.get(selectedId);
  if (selected && !placed.has(selected.id) && isValidCoordinate(selected.lon, selected.lat))
    pins.push({ point: selected, world: project(selected.lon, selected.lat), offset: { x: 0, y: 0 } });
  const visibleWeights = pins
    .filter(({ world, offset }) => isOnScreen(camera, size, world, offset))
    .map(({ point }) => point.weight);
  const maxWeight = maxWeightOf([...visibleWeights, ...spreadPoints.map((point) => point.weight)]);
  if (spread && spreadPoints.length > 0) {
    const spacing = 2 * Math.max(...spreadPoints.map((point) => pinRadius(point.weight, maxWeight))) + SPREAD_GAP;
    spreadOffsets(spreadPoints.length, spacing).forEach((offset, step) => {
      const point = spreadPoints[step];
      if (point) pins.push({ point, world: spread.world, offset });
    });
  }
  const pinMarkers: PinMarker[] = pins.map(({ point, world, offset }) => ({
    kind: "pin",
    key: `pin:${point.id}`,
    id: point.id,
    world,
    offset,
    color: point.color,
    radius: pinRadius(point.weight, maxWeight),
    focusable: isOnScreen(camera, size, world, offset),
  }));
  return [...clusterMarkers, ...pinMarkers].sort((left, right) => readingOrder(left, right, camera, size));
}
