import type { WikiGraphNode } from "@/features/wiki/wiki-graph.schema";

import { describe, expect, it } from "vitest";

import {
  WIKI_GRAPH_LABEL_LIMIT,
  WIKI_GRAPH_WORLD,
  wikiGraphFitTransform,
  wikiGraphLabel,
  wikiGraphNeighbours,
  wikiGraphNodeRadius,
  wikiGraphRevealNode,
  wikiGraphShowsLabel,
  wikiGraphToUnit,
  wikiGraphVisibleIds,
  wikiGraphZoomAt,
} from "../wiki-graph-model";

const node = (overrides: Partial<WikiGraphNode> & { id: string }): WikiGraphNode => ({
  title: overrides.id,
  kind: "knowledge",
  whenToUse: null,
  updatedAt: new Date("2026-11-16T10:00:00.000Z"),
  inbound: 0,
  outbound: 0,
  missing: 0,
  records: 0,
  x: 0.5,
  y: 0.5,
  pinned: false,
  ...overrides,
});

describe("Knowledge Base map model", () => {
  it("sizes nodes by inbound links and keeps the guide largest", () => {
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 0 })).toBe(4);
    expect(wikiGraphNodeRadius({ kind: "procedure", inbound: 25 })).toBe(13);
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 400 })).toBe(14);
    expect(wikiGraphNodeRadius({ kind: "guide", inbound: 0 })).toBe(11);
  });

  it("builds undirected neighbour sets", () => {
    const neighbours = wikiGraphNeighbours({
      links: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    });
    expect([...(neighbours.get("b") ?? [])].sort()).toEqual(["a", "c"]);
    expect(neighbours.get("d")).toBeUndefined();
  });

  it("filters by query and kind", () => {
    const nodes = [
      node({ id: "1", title: "Refund policy" }),
      node({ id: "2", title: "Onboarding", kind: "procedure" }),
      node({ id: "3", title: "Operating Guide", kind: "guide" }),
    ];
    expect(wikiGraphVisibleIds(nodes, { query: "", kinds: new Set(["guide", "procedure", "knowledge"]) })).toEqual(
      new Set(["1", "2", "3"]),
    );
    expect(wikiGraphVisibleIds(nodes, { query: "refund", kinds: new Set(["knowledge"]) })).toEqual(new Set(["1"]));
    expect(wikiGraphVisibleIds(nodes, { query: "ON", kinds: new Set(["procedure", "guide"]) })).toEqual(new Set(["2"]));
  });

  it("truncates long labels with an ellipsis", () => {
    expect(wikiGraphLabel("Short")).toBe("Short");
    const long = wikiGraphLabel("Social Channels: LinkedIn, Reddit, X, Instagram and Telegram");
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(34);
  });

  it("fits every node into the viewport and centres a node beside the drawer", () => {
    const nodes = [node({ id: "a", x: 0.1, y: 0.1 }), node({ id: "b", x: 0.9, y: 0.6 })];
    const fit = wikiGraphFitTransform(nodes, { width: 1000, height: 600 });
    const screen = (point: { x: number; y: number }) => ({
      x: point.x * WIKI_GRAPH_WORLD * fit.k + fit.x,
      y: point.y * WIKI_GRAPH_WORLD * fit.k + fit.y,
    });
    for (const item of nodes) {
      const { x, y } = screen(item);
      expect(x).toBeGreaterThanOrEqual(96);
      expect(x).toBeLessThanOrEqual(904);
      expect(y).toBeGreaterThanOrEqual(96);
      expect(y).toBeLessThanOrEqual(504);
    }
    expect(wikiGraphRevealNode(nodes[0], { width: 1000, height: 600 }, fit, 400)).toBe(fit);
    const revealed = wikiGraphRevealNode(nodes[1], { width: 1000, height: 600 }, fit, 400);
    expect(revealed.k).toBe(fit.k);
    expect(0.9 * WIKI_GRAPH_WORLD * revealed.k + revealed.x).toBeCloseTo(1000 - 400 - 72);
    expect(revealed.y).toBe(fit.y);
    expect(wikiGraphRevealNode(nodes[1], { width: 0, height: 0 }, fit, 400)).toBe(fit);
  });

  it("zooms around the pointer and maps screen points back to unit coordinates", () => {
    const start = { k: 1, x: 0, y: 0 };
    const zoomed = wikiGraphZoomAt(start, 2, { x: 100, y: 50 });
    expect(zoomed.k).toBe(2);
    expect(zoomed.x).toBe(-100);
    expect(zoomed.y).toBe(-50);
    expect(wikiGraphZoomAt(start, 100, { x: 0, y: 0 }).k).toBe(4);
    expect(wikiGraphToUnit({ x: 100, y: 50 }, zoomed)).toEqual({ x: 0.1, y: 0.05 });
    expect(wikiGraphToUnit({ x: -5000, y: 9000 }, start)).toEqual({ x: 0, y: 1 });
  });

  it("shows every label on a small map and only important ones on a large map", () => {
    const small = { total: 40, zoom: 1, focus: null, selected: null };
    expect(wikiGraphShowsLabel(node({ id: "a" }), small)).toBe(true);
    expect(wikiGraphShowsLabel(node({ id: "a" }), { ...small, zoom: 0.3 })).toBe(false);
    const large = { total: WIKI_GRAPH_LABEL_LIMIT + 1, zoom: 1, focus: null, selected: null };
    expect(wikiGraphShowsLabel(node({ id: "a" }), large)).toBe(false);
    expect(wikiGraphShowsLabel(node({ id: "a", inbound: 9 }), large)).toBe(true);
    expect(wikiGraphShowsLabel(node({ id: "a" }), { ...large, focus: new Set(["a"]) })).toBe(true);
    expect(wikiGraphShowsLabel(node({ id: "a" }), { ...large, selected: "a" })).toBe(true);
  });
});
