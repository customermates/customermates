import type { Geometry, Position } from "geojson";
import type { GeometryObject, Topology } from "topojson-specification";

import { feature } from "topojson-client";

import { TILE_SIZE, boundsIntersect, projectLatitude, projectLongitude, type WorldBounds } from "./map-geometry";

export const BASEMAP_URL = "/maps/v1/";
export const WORLD_FILE = "world.json";
export const DETAIL_ZOOM = 5;

export type Polyline = Float64Array;
export type BasemapPlace = {
  x: number;
  y: number;
  minZoom: number;
  name: string;
  names: Readonly<Record<string, string>>;
};
type BasemapStateLines = { minZoom: number; lines: Polyline[] };
export type BasemapLayers = {
  land: Polyline[];
  coast: Polyline[];
  borders: Polyline[];
  states: BasemapStateLines[];
  places: BasemapPlace[];
};
type BasemapRegion = { id: string; file: string; bounds: WorldBounds };
export type BasemapWorld = { layers: BasemapLayers; regions: BasemapRegion[] };
type BasemapFetcher = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

type BasemapFeature = { geometry: Geometry | null; properties: Record<string, unknown> | null };

const EDGE_TOLERANCE = 1e-6;
const REGION_ID = /^(\d+)\/(\d+)\/(\d+)$/;

function projectPositions(positions: readonly Position[]): Polyline {
  const line = new Float64Array(positions.length * 2);
  positions.forEach(([longitude = 0, latitude = 0], index) => {
    line[index * 2] = projectLongitude(longitude);
    line[index * 2 + 1] = projectLatitude(latitude);
  });
  return line;
}

function alongWorldEdge(ax: number, ay: number, bx: number, by: number) {
  const low = EDGE_TOLERANCE;
  const high = TILE_SIZE - EDGE_TOLERANCE;
  return (
    (ax <= low && bx <= low) || (ax >= high && bx >= high) || (ay <= low && by <= low) || (ay >= high && by >= high)
  );
}

export function splitAtWorldEdges(line: Polyline): Polyline[] {
  const parts: Polyline[] = [];
  const count = line.length / 2;
  let start = 0;
  for (let index = 1; index < count; index += 1) {
    if (!alongWorldEdge(line[index * 2 - 2], line[index * 2 - 1], line[index * 2], line[index * 2 + 1])) continue;
    if (index - 1 > start) parts.push(line.slice(start * 2, index * 2));
    start = index;
  }
  if (count - 1 > start) parts.push(start === 0 ? line : line.slice(start * 2));
  return parts;
}

function featuresOf(topology: Topology, name: string): BasemapFeature[] {
  const object = topology.objects[name] as GeometryObject | undefined;
  if (!object) return [];
  const decoded = feature(topology, object);
  return "features" in decoded ? decoded.features : [decoded];
}

function rings(geometry: Geometry | null): Position[][] {
  if (geometry?.type === "Polygon") return geometry.coordinates;
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function lineStrings(geometry: Geometry | null): Position[][] {
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function lines(topology: Topology, name: string) {
  return featuresOf(topology, name).flatMap(({ geometry }) =>
    lineStrings(geometry).flatMap((positions) => splitAtWorldEdges(projectPositions(positions))),
  );
}

function stateLines(topology: Topology): BasemapStateLines[] {
  const byZoom = new Map<number, Polyline[]>();
  for (const { geometry, properties } of featuresOf(topology, "states")) {
    const minZoom = Number(properties?.z);
    if (!Number.isFinite(minZoom)) continue;
    const projected = lineStrings(geometry).map(projectPositions);
    byZoom.set(minZoom, [...(byZoom.get(minZoom) ?? []), ...projected]);
  }
  return [...byZoom]
    .sort(([left], [right]) => left - right)
    .map(([minZoom, polylines]) => ({ minZoom, lines: polylines }));
}

function places(topology: Topology): BasemapPlace[] {
  return featuresOf(topology, "places").flatMap(({ geometry, properties }) => {
    if (geometry?.type !== "Point" || !properties) return [];
    const { n: name, z: minZoom, ...rest } = properties;
    if (typeof name !== "string" || typeof minZoom !== "number") return [];
    const [longitude = 0, latitude = 0] = geometry.coordinates;
    const names = Object.fromEntries(
      Object.entries(rest).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    return [{ x: projectLongitude(longitude), y: projectLatitude(latitude), minZoom, name, names }];
  });
}

export function decodeBasemap(topology: Topology): BasemapLayers {
  return {
    land: featuresOf(topology, "land").flatMap(({ geometry }) => rings(geometry).map(projectPositions)),
    coast: lines(topology, "coast"),
    borders: lines(topology, "borders"),
    states: stateLines(topology),
    places: places(topology),
  };
}

export function parseRegion(id: string): BasemapRegion | null {
  const match = REGION_ID.exec(id);
  if (!match) return null;
  const [zoom, x, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const span = TILE_SIZE / 2 ** zoom;
  if (x >= 2 ** zoom || y >= 2 ** zoom) return null;
  return {
    id,
    file: `region-${zoom}-${x}-${y}.json`,
    bounds: { minX: x * span, minY: y * span, maxX: (x + 1) * span, maxY: (y + 1) * span },
  };
}

export function regionsOf(topology: Topology & { regions?: unknown }) {
  if (!Array.isArray(topology.regions)) return [];
  return topology.regions.flatMap((id) => {
    const region = typeof id === "string" ? parseRegion(id) : null;
    return region ? [region] : [];
  });
}

export function regionsInView(regions: readonly BasemapRegion[], view: WorldBounds) {
  return regions.filter((region) => boundsIntersect(region.bounds, view));
}

export function createBasemapLoader(fetcher: BasemapFetcher = (url) => fetch(url)) {
  const cache = new Map<string, Promise<unknown>>();

  function cached<T>(file: string, decode: (topology: Topology & { regions?: unknown }) => T): Promise<T> {
    const url = `${BASEMAP_URL}${file}`;
    const existing = cache.get(url) as Promise<T> | undefined;
    if (existing) return existing;
    const request = fetcher(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        return decode((await response.json()) as Topology & { regions?: unknown });
      })
      .catch((error: unknown) => {
        cache.delete(url);
        throw error;
      });
    cache.set(url, request);
    return request;
  }

  return {
    loadWorld: () =>
      cached<BasemapWorld>(WORLD_FILE, (topology) => ({
        layers: decodeBasemap(topology),
        regions: regionsOf(topology),
      })),
    loadRegion: (region: BasemapRegion) => cached<BasemapLayers>(region.file, decodeBasemap),
  };
}

export type BasemapLoader = ReturnType<typeof createBasemapLoader>;

export const basemapLoader = createBasemapLoader();
