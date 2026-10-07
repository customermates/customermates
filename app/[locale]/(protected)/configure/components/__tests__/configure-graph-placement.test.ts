import { describe, expect, it } from "vitest";

import { configureEdgeGeometry, configureGraphPlacement } from "../configure-graph-layout";

const box = (x: number, y: number) => ({ x, y, width: 300, height: 200 });

describe("Configure graph placement", () => {
  it("keeps the automatic layout when nothing is saved", () => {
    const layout = new Map([["deals", box(0, 0)]]);
    expect(configureGraphPlacement(layout, null)).toEqual(layout);
  });

  it("puts saved lists at their saved point and keeps their measured size", () => {
    const placement = configureGraphPlacement(new Map([["deals", box(0, 0)]]), { deals: { x: 500, y: -80 } });
    expect(placement.get("deals")).toEqual({ x: 500, y: -80, width: 300, height: 200 });
  });

  it("places a new list without overlapping saved lists", () => {
    const layout = new Map([
      ["deals", box(0, 0)],
      ["contacts", box(400, 0)],
      ["projects", box(0, 300)],
    ]);
    const placement = configureGraphPlacement(layout, { deals: { x: 0, y: 300 }, contacts: { x: 0, y: 560 } });
    const projects = placement.get("projects");
    expect(projects?.x).toBe(0);
    for (const id of ["deals", "contacts"]) {
      const other = placement.get(id);
      if (!projects || !other) throw new Error("missing placement");
      const apart =
        projects.y >= other.y + other.height ||
        other.y >= projects.y + projects.height ||
        projects.x >= other.x + other.width ||
        other.x >= projects.x + projects.width;
      expect(apart).toBe(true);
    }
  });
});

describe("Configure edge geometry", () => {
  const route = {
    points: [
      { x: 150, y: 200 },
      { x: 150, y: 250 },
      { x: 150, y: 300 },
    ],
    label: { x: 150, y: 250 },
  };
  const anchors = { source: box(0, 0), target: box(0, 300) };

  it("moves the routed line with both lists when they move together", () => {
    const geometry = configureEdgeGeometry(route, anchors, box(100, 50), box(100, 350), 0);
    expect(geometry.label).toEqual({ x: 250, y: 300 });
    expect(geometry.path.startsWith("M 250 250")).toBe(true);
  });

  it("draws a direct line between the list borders after one list moved", () => {
    const geometry = configureEdgeGeometry(route, anchors, box(0, 0), box(600, 0), 0);
    expect(geometry.path).toBe("M 300 100 Q 450 100 600 100");
    expect(geometry.label).toEqual({ x: 450, y: 100 });
  });

  it("separates parallel relationships into lanes", () => {
    const first = configureEdgeGeometry(route, anchors, box(0, 0), box(600, 0), -0.5);
    const second = configureEdgeGeometry(route, anchors, box(0, 0), box(600, 0), 0.5);
    expect(first.label.y).not.toBe(second.label.y);
  });
});
