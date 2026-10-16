import type { Topology } from "topojson-specification";

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { BASEMAP_URL, WORLD_FILE, decodeBasemap, regionsInView, regionsOf } from "../map-basemap";
import { project } from "../map-geometry";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DIRECTORY = join(ROOT, "public", BASEMAP_URL);
const WORLD_GZIP_BUDGET = 150_000;
const REGION_GZIP_BUDGET = 200_000;
const TOTAL_BUDGET = 5_000_000;
const LAYERS = ["land", "coast", "borders", "places"];

function read(file: string) {
  return readFileSync(join(DIRECTORY, file));
}

function topology(file: string) {
  return JSON.parse(read(file).toString("utf8")) as Topology & { regions?: unknown };
}

const world = topology(WORLD_FILE);
const regions = regionsOf(world);
const languages = readdirSync(join(ROOT, "i18n", "locales")).map((file) => basename(file, ".json"));

describe("committed basemap files", () => {
  it("ships the world file, one file per listed region and the readme", () => {
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.length).toBe(Array.isArray(world.regions) ? world.regions.length : -1);
    expect(new Set(readdirSync(DIRECTORY))).toEqual(
      new Set([WORLD_FILE, "README.md", ...regions.map(({ file }) => file)]),
    );
  });

  it("stays within the download and disk budgets", () => {
    const world = read(WORLD_FILE);
    expect(gzipSync(world).length).toBeLessThanOrEqual(WORLD_GZIP_BUDGET);
    let total = world.length + read("README.md").length;
    for (const { file } of regions) {
      const content = read(file);
      total += content.length;
      expect(gzipSync(content).length, file).toBeLessThanOrEqual(REGION_GZIP_BUDGET);
    }
    expect(total).toBeLessThanOrEqual(TOTAL_BUDGET);
  });

  it("keeps the layers the renderer draws and only the place attributes it reads", () => {
    for (const file of [WORLD_FILE, ...regions.map((region) => region.file)]) {
      const { type, objects } = topology(file);
      expect(type).toBe("Topology");
      const names = file === WORLD_FILE ? LAYERS : [...LAYERS, "states"];
      expect(Object.keys(objects).sort(), file).toEqual([...names].sort());
      for (const name of ["land", "coast", "borders"]) {
        const object = objects[name];
        const geometries = object && "geometries" in object ? object.geometries : [];
        expect(geometries.every((geometry) => geometry.properties === undefined)).toBe(true);
      }
      const places = objects.places;
      for (const place of places && "geometries" in places ? places.geometries : []) {
        const keys = Object.keys(place.properties ?? {});
        expect(
          keys.every((key) => key === "n" || key === "z" || languages.includes(key)),
          JSON.stringify(place),
        ).toBe(true);
      }
    }
  });

  it("decodes the world with land, coastline, borders and localized places", () => {
    const layers = decodeBasemap(world);
    expect(layers.land.length).toBeGreaterThan(100);
    expect(layers.coast.length).toBeGreaterThan(0);
    expect(layers.borders.length).toBeGreaterThan(0);
    expect(layers.states).toEqual([]);
    expect(layers.places.find((place) => place.name === "Munich")?.names.de).toBe("München");
  });

  it("has region detail for Germany, Austria and Switzerland", () => {
    const covered = [project(13.405, 52.52), project(16.373, 48.208), project(8.541, 47.377)].map((point) =>
      regionsInView(regions, { minX: point.x, minY: point.y, maxX: point.x + 1e-9, maxY: point.y + 1e-9 }),
    );
    for (const found of covered) expect(found).toHaveLength(1);
    const region = covered[0]?.[0];
    if (!region) throw new Error("expected a region");
    const layers = decodeBasemap(topology(region.file));
    expect(layers.states.length).toBeGreaterThan(0);
    expect(layers.places.some((place) => place.name === "Mannheim")).toBe(true);
  });
});
