import type { Topology } from "topojson-specification";

export const WORLD_FIXTURE = {
  type: "Topology",
  arcs: [
    [
      [5, 45],
      [17, 45],
      [17, 55],
      [5, 55],
      [5, 45],
    ],
    [
      [11, 45],
      [11, 55],
    ],
    [
      [-180, 60],
      [-180, 70],
      [-170, 70],
    ],
  ],
  objects: {
    land: { type: "GeometryCollection", geometries: [{ type: "Polygon", arcs: [[0]] }] },
    coast: { type: "GeometryCollection", geometries: [{ type: "LineString", arcs: [2] }] },
    borders: { type: "GeometryCollection", geometries: [{ type: "LineString", arcs: [1] }] },
    places: {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [11.575, 48.137], properties: { n: "Munich", z: 4.7, de: "München" } },
        { type: "Point", coordinates: [13.405, 52.52], properties: { n: "Berlin", z: 2.7 } },
      ],
    },
  },
  regions: ["4/8/5", "9/0"],
} as unknown as Topology & { regions: unknown };

export const REGION_FIXTURE = {
  type: "Topology",
  arcs: [
    [
      [9, 47],
      [13, 47],
      [13, 50],
      [9, 50],
      [9, 47],
    ],
    [
      [9, 49],
      [13, 49],
    ],
    [
      [10, 47],
      [10, 50],
    ],
  ],
  objects: {
    land: { type: "GeometryCollection", geometries: [{ type: "Polygon", arcs: [[0]] }] },
    coast: { type: "GeometryCollection", geometries: [] },
    borders: { type: "GeometryCollection", geometries: [] },
    states: {
      type: "GeometryCollection",
      geometries: [
        { type: "MultiLineString", arcs: [[1]], properties: { z: 7 } },
        { type: "MultiLineString", arcs: [[2]], properties: { z: 9 } },
      ],
    },
    places: {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [11.077, 49.452], properties: { n: "Nuremberg", z: 5.7, de: "Nürnberg" } },
      ],
    },
  },
} as unknown as Topology;

export function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}
