import { describe, expect, it, vi } from "vitest";

import {
  BASEMAP_URL,
  createBasemapLoader,
  decodeBasemap,
  parseRegion,
  regionsInView,
  regionsOf,
  splitAtWorldEdges,
} from "../map-basemap";
import { TILE_SIZE, project } from "../map-geometry";

import { REGION_FIXTURE, WORLD_FIXTURE, jsonResponse } from "./basemap-fixture";

describe("TopoJSON decoding", () => {
  it("projects land rings, lines and places into world units", () => {
    const layers = decodeBasemap(WORLD_FIXTURE);
    expect(layers.land).toHaveLength(1);
    const [ring] = layers.land;
    expect(Array.from(ring ?? []).slice(0, 2)).toEqual([project(5, 45).x, project(5, 45).y]);
    expect(ring).toHaveLength(10);
    expect(layers.borders).toHaveLength(1);
    expect(layers.places).toEqual([
      { ...project(11.575, 48.137), minZoom: 4.7, name: "Munich", names: { de: "München" } },
      { ...project(13.405, 52.52), minZoom: 2.7, name: "Berlin", names: {} },
    ]);
  });

  it("drops coast segments that only trace the antimeridian", () => {
    const [coast] = decodeBasemap(WORLD_FIXTURE).coast;
    expect(decodeBasemap(WORLD_FIXTURE).coast).toHaveLength(1);
    expect(Array.from(coast ?? [])).toEqual([0, project(-180, 70).y, project(-170, 70).x, project(-170, 70).y]);
  });

  it("splits a line wherever it runs along the edge of the world", () => {
    const line = Float64Array.from([10, 10, 0, 20, 0, 30, 0, 40, 10, 50, 20, TILE_SIZE, 30, TILE_SIZE]);
    expect(splitAtWorldEdges(line).map((part) => Array.from(part))).toEqual([
      [10, 10, 0, 20],
      [0, 40, 10, 50, 20, TILE_SIZE],
    ]);
  });

  it("groups state boundaries by their minimum zoom", () => {
    const { states, places } = decodeBasemap(REGION_FIXTURE);
    expect(states.map(({ minZoom, lines }) => [minZoom, lines.length])).toEqual([
      [7, 1],
      [9, 1],
    ]);
    expect(places[0]?.names).toEqual({ de: "Nürnberg" });
  });
});

describe("regions", () => {
  it("parses Web Mercator tile ids into files and world bounds", () => {
    expect(parseRegion("4/8/5")).toEqual({
      id: "4/8/5",
      file: "region-4-8-5.json",
      bounds: { minX: 128, minY: 80, maxX: 144, maxY: 96 },
    });
    expect(parseRegion("2/4/0")).toBeNull();
    expect(parseRegion("../world")).toBeNull();
    expect(regionsOf(WORLD_FIXTURE).map(({ id }) => id)).toEqual(["4/8/5"]);
  });

  it("selects the regions that intersect the view", () => {
    const regions = ["4/8/5", "4/9/5", "4/0/0"].map((id) => parseRegion(id)).filter((region) => region !== null);
    expect(regionsInView(regions, { minX: 140, minY: 85, maxX: 150, maxY: 90 }).map(({ id }) => id)).toEqual([
      "4/8/5",
      "4/9/5",
    ]);
  });
});

describe("basemap loader", () => {
  it("fetches each file once and shares the decoded result", async () => {
    const fetcher = vi.fn((url: string) =>
      Promise.resolve(jsonResponse(url.endsWith("world.json") ? WORLD_FIXTURE : REGION_FIXTURE)),
    );
    const loader = createBasemapLoader(fetcher);
    const [first, second] = await Promise.all([loader.loadWorld(), loader.loadWorld()]);
    expect(first).toBe(second);
    expect(first.regions.map(({ id }) => id)).toEqual(["4/8/5"]);
    const region = first.regions[0];
    if (!region) throw new Error("expected a region");
    const layers = await loader.loadRegion(region);
    expect(layers.states).toHaveLength(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${BASEMAP_URL}world.json`,
      `${BASEMAP_URL}region-4-8-5.json`,
    ]);
  });

  it("forgets a failed download so a retry fetches again", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, 503))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse(WORLD_FIXTURE));
    const loader = createBasemapLoader(fetcher);
    await expect(loader.loadWorld()).rejects.toThrow("503");
    await expect(loader.loadWorld()).rejects.toThrow("offline");
    await expect(loader.loadWorld()).resolves.toMatchObject({ regions: [{ id: "4/8/5" }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
