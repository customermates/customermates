import { describe, expect, it } from "vitest";

import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  MAX_LATITUDE,
  MAX_ZOOM,
  TILE_SIZE,
  clampCamera,
  fitCamera,
  interpolateCamera,
  isValidCoordinate,
  minZoomFor,
  panBy,
  project,
  toScreen,
  toWorld,
  unprojectX,
  unprojectY,
  visibleWorldBounds,
  worldBoundsOf,
  worldToLonLatBounds,
  zoomAround,
} from "../map-geometry";

const SIZE = { width: 800, height: 400 };

describe("Web Mercator projection", () => {
  it("maps the equator, the antimeridian and the latitude limit onto the 256 unit world", () => {
    expect(project(0, 0)).toEqual({ x: 128, y: 128 });
    expect(project(-180, MAX_LATITUDE).x).toBe(0);
    expect(project(-180, MAX_LATITUDE).y).toBeCloseTo(0, 6);
    expect(project(180, -MAX_LATITUDE).x).toBe(TILE_SIZE);
    expect(project(180, -MAX_LATITUDE).y).toBeCloseTo(TILE_SIZE, 6);
    expect(project(10, 89.9).y).toBeCloseTo(0, 6);
  });

  it("round-trips longitude and latitude", () => {
    for (const [longitude, latitude] of [
      [8.466, 49.487],
      [-74.006, 40.7128],
      [151.2093, -33.8688],
    ]) {
      const { x, y } = project(longitude, latitude);
      expect(unprojectX(x)).toBeCloseTo(longitude, 9);
      expect(unprojectY(y)).toBeCloseTo(latitude, 9);
    }
  });

  it("rejects coordinates outside the globe", () => {
    expect(isValidCoordinate(8.4, 49.4)).toBe(true);
    expect(isValidCoordinate(Number.NaN, 49.4)).toBe(false);
    expect(isValidCoordinate(8.4, 91)).toBe(false);
    expect(isValidCoordinate(181, 0)).toBe(false);
  });
});

describe("camera", () => {
  it("converts between screen and world coordinates", () => {
    const camera = { x: 100, y: 80, zoom: 3 };
    const screen = toScreen(camera, SIZE, { x: 101, y: 79 });
    expect(screen).toEqual({ x: 408, y: 192 });
    expect(toWorld(camera, SIZE, screen)).toEqual({ x: 101, y: 79 });
  });

  it("lets the whole world fit the shorter side and stops at the maximum zoom", () => {
    expect(minZoomFor(SIZE)).toBeCloseTo(Math.log2(400 / 256), 9);
    expect(minZoomFor({ width: 100, height: 100 })).toBe(0);
    expect(clampCamera({ x: 128, y: 128, zoom: -4 }, SIZE).zoom).toBeCloseTo(minZoomFor(SIZE), 9);
    expect(clampCamera({ x: 128, y: 128, zoom: 40 }, SIZE).zoom).toBe(MAX_ZOOM);
  });

  it("keeps the view inside the world and centres an axis the world does not fill", () => {
    const edge = clampCamera({ x: 0, y: 0, zoom: 4 }, SIZE);
    expect(edge.x).toBeCloseTo(800 / 2 / 16, 9);
    expect(edge.y).toBeCloseTo(400 / 2 / 16, 9);
    const small = clampCamera({ x: 10, y: 10, zoom: minZoomFor(SIZE) }, SIZE);
    expect(small.x).toBeCloseTo(128, 9);
  });

  it("zooms around an anchor that stays under the pointer", () => {
    const camera = { x: 136, y: 88, zoom: 5 };
    const anchor = { x: 620, y: 110 };
    const zoomed = zoomAround(camera, SIZE, anchor, 6.5);
    expect(zoomed.zoom).toBe(6.5);
    const before = toWorld(camera, SIZE, anchor);
    const after = toWorld(zoomed, SIZE, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("pans by screen pixels", () => {
    const panned = panBy({ x: 136, y: 88, zoom: 5 }, SIZE, 64, -32);
    expect(panned.x).toBeCloseTo(138, 9);
    expect(panned.y).toBeCloseTo(87, 9);
  });

  it("interpolates from the start to the end camera with a fixed zoom anchor", () => {
    const from = { x: 136, y: 88, zoom: 5 };
    const to = { x: 137, y: 87.5, zoom: 7 };
    expect(interpolateCamera(from, to, 0)).toEqual(from);
    const end = interpolateCamera(from, to, 1);
    expect(end.x).toBeCloseTo(to.x, 9);
    expect(end.y).toBeCloseTo(to.y, 9);
    expect(end.zoom).toBe(7);
    const middle = interpolateCamera(from, to, 0.5);
    expect(middle.zoom).toBe(6);
    expect(middle.x).toBeCloseTo(136 + (1 - 0.5) / (1 - 0.25), 9);
    expect(interpolateCamera(from, { ...from, x: 140 }, 0.25).x).toBe(137);
  });
});

describe("fit to bounds", () => {
  it("centres a single point at the city-level cap", () => {
    const point = project(8.466, 49.487);
    const camera = fitCamera({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }, SIZE);
    expect(camera.zoom).toBe(FIT_MAX_ZOOM);
    expect(camera.x).toBeCloseTo(point.x, 9);
    expect(camera.y).toBeCloseTo(point.y, 9);
  });

  it("keeps several points inside the padded view", () => {
    const points = [project(6.96, 50.938), project(16.373, 48.208), project(8.541, 47.377), project(9.993, 53.551)];
    const bounds = worldBoundsOf(points);
    if (!bounds) throw new Error("expected bounds");
    const camera = fitCamera(bounds, SIZE);
    expect(camera.zoom).toBeLessThan(FIT_MAX_ZOOM);
    for (const point of points) {
      const { x, y } = toScreen(camera, SIZE, point);
      expect(x).toBeGreaterThanOrEqual(FIT_PADDING - 1e-6);
      expect(x).toBeLessThanOrEqual(SIZE.width - FIT_PADDING + 1e-6);
      expect(y).toBeGreaterThanOrEqual(FIT_PADDING - 1e-6);
      expect(y).toBeLessThanOrEqual(SIZE.height - FIT_PADDING + 1e-6);
    }
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    expect(camera.zoom).toBeCloseTo(
      Math.min(Math.log2((SIZE.width - 2 * FIT_PADDING) / spanX), Math.log2((SIZE.height - 2 * FIT_PADDING) / spanY)),
      9,
    );
  });

  it("returns no bounds without points", () => {
    expect(worldBoundsOf([])).toBeNull();
  });

  it("describes the visible area in world units and in degrees", () => {
    const camera = { x: 128, y: 128, zoom: 2 };
    expect(visibleWorldBounds(camera, SIZE)).toEqual({ minX: 28, minY: 78, maxX: 228, maxY: 178 });
    const degrees = worldToLonLatBounds(visibleWorldBounds(camera, SIZE));
    expect(degrees.west).toBeCloseTo(-140.625, 9);
    expect(degrees.east).toBeCloseTo(140.625, 9);
    expect(degrees.north).toBeCloseTo(-degrees.south, 9);
  });
});
