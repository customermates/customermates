import type { MapViewPoint } from "../map-types";

import { describe, expect, it } from "vitest";

import { ChartColor } from "@/features/widget/widget-display.schema";

import { MAX_ZOOM, project } from "../map-geometry";
import {
  CLUSTER_DIAMETER_MAX,
  CLUSTER_DIAMETER_MIN,
  DEFAULT_CLUSTER_COLOR,
  PIN_RADIUS_DEFAULT,
  PIN_RADIUS_MAX,
  PIN_RADIUS_MIN,
  clusterColor,
  clusterDiameter,
  clusterLeafIds,
  computeMarkers,
  createClusterIndex,
  majorityGroup,
  maxWeightOf,
  pinRadius,
  spreadOffsets,
  type ClusterMarker,
  type MapMarker,
  type PinMarker,
} from "../map-markers";

const SIZE = { width: 800, height: 400 };

function point(
  id: string,
  lat: number,
  lon: number,
  group: string | null = null,
  weight: number | null = null,
): MapViewPoint {
  return { id, lat, lon, group, color: group === "b" ? ChartColor.secondary1 : ChartColor.primary1, weight };
}

function cameraOn(lat: number, lon: number, zoom: number) {
  return { ...project(lon, lat), zoom };
}

const pins = (markers: MapMarker[]) => markers.filter((marker): marker is PinMarker => marker.kind === "pin");
const clusters = (markers: MapMarker[]) =>
  markers.filter((marker): marker is ClusterMarker => marker.kind === "cluster");

describe("pin radius", () => {
  it("uses the default for points without a weight", () => {
    expect(pinRadius(null, 100)).toBe(PIN_RADIUS_DEFAULT);
    expect(pinRadius(Number.NaN, 100)).toBe(PIN_RADIUS_DEFAULT);
  });

  it("scales the radius with the square root of the weight among the visible points", () => {
    expect(pinRadius(100, 100)).toBe(PIN_RADIUS_MAX);
    expect(pinRadius(25, 100)).toBe(PIN_RADIUS_MIN + (PIN_RADIUS_MAX - PIN_RADIUS_MIN) / 2);
    expect(pinRadius(0, 100)).toBe(PIN_RADIUS_MIN);
    expect(pinRadius(-5, 100)).toBe(PIN_RADIUS_MIN);
    expect(pinRadius(400, 100)).toBe(PIN_RADIUS_MAX);
    expect(pinRadius(10, 0)).toBe(PIN_RADIUS_MIN);
  });

  it("takes the largest positive finite weight", () => {
    expect(maxWeightOf([3, null, 12, Number.POSITIVE_INFINITY, -40])).toBe(12);
    expect(maxWeightOf([null, -1])).toBe(0);
  });
});

describe("cluster appearance", () => {
  it("grows the bubble with the count inside fixed bounds", () => {
    expect(clusterDiameter(2)).toBe(CLUSTER_DIAMETER_MIN);
    expect(clusterDiameter(12)).toBeGreaterThan(clusterDiameter(7));
    expect(clusterDiameter(1_000_000)).toBe(CLUSTER_DIAMETER_MAX);
  });

  it("takes the colour of a group that holds more than half of the points", () => {
    const colors = [ChartColor.primary1, ChartColor.secondary1];
    expect(majorityGroup({ 0: 2, 1: 1 }, 3)).toBe(0);
    expect(clusterColor({ 0: 2, 1: 1 }, 3, colors)).toBe(ChartColor.primary1);
    expect(clusterColor({ 1: 3 }, 4, colors)).toBe(ChartColor.secondary1);
  });

  it("leaves mixed groups without a colour and draws ungrouped points in the primary colour", () => {
    const colors = [ChartColor.primary1, ChartColor.secondary1];
    expect(clusterColor({ 0: 2, 1: 2 }, 4, colors)).toBeNull();
    expect(clusterColor({ 0: 1 }, 3, colors)).toBeNull();
    expect(clusterColor({}, 5, colors)).toBe(DEFAULT_CLUSTER_COLOR);
    expect(DEFAULT_CLUSTER_COLOR).toBe(ChartColor.primary1);
  });

  it("leaves a cluster without a majority uncoloured and colours one of ungrouped points primary", () => {
    const mixed = createClusterIndex([
      point("x1", 48.1, 11.5, "a"),
      point("x2", 48.1, 11.5, "b"),
      point("x3", 48.1, 11.5, "b"),
      point("x4", 48.1, 11.5, "a"),
    ]);
    const ungrouped = createClusterIndex([point("u1", 48.1, 11.5), point("u2", 48.1, 11.5)]);
    const camera = cameraOn(48.1, 11.5, 5);
    const colorOf = (index: ReturnType<typeof createClusterIndex>) =>
      clusters(computeMarkers({ clusters: index, camera, size: SIZE, selectedId: null, spread: null }))[0]?.color;
    expect(colorOf(mixed)).toBeNull();
    expect(colorOf(ungrouped)).toBe(DEFAULT_CLUSTER_COLOR);
  });
});

describe("markers", () => {
  const munich = [
    point("m1", 48.137, 11.575, "a", 10),
    point("m2", 48.155, 11.6, "a", 20),
    point("m3", 48.12, 11.55, "b", 30),
  ];
  const berlin = point("berlin", 52.52, 13.405, "b", 100);
  const index = createClusterIndex([...munich, berlin, point("broken", Number.NaN, 4, "a")]);
  const overview = cameraOn(50.3, 12.5, 5);

  it("clusters nearby points with their count and majority colour", () => {
    const markers = computeMarkers({ clusters: index, camera: overview, size: SIZE, selectedId: null, spread: null });
    const [cluster] = clusters(markers);
    expect(clusters(markers)).toHaveLength(1);
    expect(cluster).toMatchObject({ count: 3, color: ChartColor.primary1, focusable: true });
    expect(cluster?.expansionZoom).toBeGreaterThan(5);
    expect(pins(markers).map((marker) => marker.id)).toEqual(["berlin"]);
  });

  it("shows single pins once zoomed past the expansion zoom", () => {
    const markers = computeMarkers({
      clusters: index,
      camera: cameraOn(48.137, 11.575, MAX_ZOOM),
      size: SIZE,
      selectedId: null,
      spread: null,
    });
    expect(clusters(markers)).toHaveLength(0);
    expect(new Set(pins(markers).map((marker) => marker.id))).toEqual(new Set(["m1", "m2", "m3"]));
  });

  it("sizes the visible pins against the largest visible weight", () => {
    const markers = computeMarkers({
      clusters: index,
      camera: cameraOn(48.137, 11.575, MAX_ZOOM),
      size: SIZE,
      selectedId: null,
      spread: null,
    });
    const radius = Object.fromEntries(pins(markers).map((marker) => [marker.id, marker.radius]));
    expect(radius.m3).toBe(PIN_RADIUS_MAX);
    expect(radius.m1).toBeCloseTo(PIN_RADIUS_MIN + (PIN_RADIUS_MAX - PIN_RADIUS_MIN) * Math.sqrt(10 / 30), 9);
  });

  it("keeps the selected point visible as a pin inside a cluster", () => {
    const markers = computeMarkers({ clusters: index, camera: overview, size: SIZE, selectedId: "m2", spread: null });
    expect(clusters(markers)[0]?.count).toBe(3);
    expect(pins(markers).map((marker) => marker.id)).toContain("m2");
  });

  it("orders markers top to bottom for the tab sequence", () => {
    const markers = computeMarkers({ clusters: index, camera: overview, size: SIZE, selectedId: null, spread: null });
    expect(markers.map((marker) => marker.key)).toEqual(["pin:berlin", expect.stringMatching(/^cluster:/)]);
  });

  it("marks markers outside the view as not focusable", () => {
    const markers = computeMarkers({
      clusters: index,
      camera: cameraOn(52.52, 18.9, 7),
      size: SIZE,
      selectedId: null,
      spread: null,
    });
    expect(pins(markers).find((marker) => marker.id === "berlin")?.focusable).toBe(false);
  });

  it("spreads the points of a cluster around its centre", () => {
    const same = createClusterIndex([point("s1", 48.1, 11.5), point("s2", 48.1, 11.5), point("s3", 48.1, 11.5)]);
    const camera = cameraOn(48.1, 11.5, MAX_ZOOM);
    const [cluster] = clusters(computeMarkers({ clusters: same, camera, size: SIZE, selectedId: null, spread: null }));
    if (!cluster) throw new Error("expected a cluster");
    expect(cluster.count).toBe(3);
    expect(cluster.expansionZoom).toBeGreaterThan(MAX_ZOOM);
    const ids = clusterLeafIds(same, cluster.clusterId);
    expect(new Set(ids)).toEqual(new Set(["s1", "s2", "s3"]));
    const spread = computeMarkers({
      clusters: same,
      camera,
      size: SIZE,
      selectedId: null,
      spread: { clusterId: cluster.clusterId, world: cluster.world, ids },
    });
    expect(clusters(spread)).toHaveLength(0);
    const offsets = pins(spread).map((marker) => `${Math.round(marker.offset.x)},${Math.round(marker.offset.y)}`);
    expect(new Set(offsets).size).toBe(3);
    expect(pins(spread).every((marker) => marker.world === cluster.world)).toBe(true);
  });
});

describe("spread offsets", () => {
  it("places a few points on a circle and many on a spiral without overlap", () => {
    for (const count of [2, 5, 8, 9, 40]) {
      const offsets = spreadOffsets(count, 20);
      expect(offsets).toHaveLength(count);
      for (let left = 0; left < count; left += 1) {
        for (let right = left + 1; right < count; right += 1) {
          const a = offsets[left];
          const b = offsets[right];
          if (!a || !b) throw new Error("missing offset");
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });
});
