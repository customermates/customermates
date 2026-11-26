import type { WikiGraphNode } from "@/features/wiki/wiki-graph.schema";

import { describe, expect, it } from "vitest";

import { WIKI_GRAPH_ASPECT } from "@/features/wiki/wiki-graph-frame";

import {
  WIKI_GRAPH_FIT_PADDING,
  WIKI_GRAPH_KIND_DOT,
  WIKI_GRAPH_KIND_NODE,
  WIKI_GRAPH_NODE_RADII,
  WIKI_GRAPH_WORLD_HEIGHT,
  WIKI_GRAPH_WORLD_WIDTH,
  wikiGraphFitTransform,
  wikiGraphLabel,
  wikiGraphLabelIds,
  wikiGraphNeighbours,
  wikiGraphNodeRadius,
  wikiGraphNodeScale,
  wikiGraphPeakInbound,
  wikiGraphToUnit,
  wikiGraphVisibleIds,
  wikiGraphWorldPoint,
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
  it("draws the map in a world as wide as the layout frame", () => {
    expect(WIKI_GRAPH_WORLD_WIDTH).toBe(WIKI_GRAPH_WORLD_HEIGHT * WIKI_GRAPH_ASPECT);
    expect(wikiGraphWorldPoint({ x: 0.5, y: 0.25 })).toEqual({ x: WIKI_GRAPH_WORLD_WIDTH / 2, y: 250 });
  });

  it("shows each page kind as a soft tint with a ring", () => {
    expect(WIKI_GRAPH_KIND_NODE).toEqual({
      guide: { tint: "fill-background", ring: "stroke-foreground" },
      procedure: { tint: "fill-info/15", ring: "stroke-info" },
      knowledge: { tint: "fill-muted", ring: "stroke-muted-foreground/70" },
    });
    expect(WIKI_GRAPH_KIND_DOT).toEqual({
      guide: "border-2 border-foreground bg-background",
      procedure: "border border-info bg-info/15",
      knowledge: "border border-muted-foreground/70 bg-muted",
    });
  });

  it("draws pages in three sizes, measured against the most linked page of the workspace", () => {
    const { small, medium, large } = WIKI_GRAPH_NODE_RADII;
    expect([small, medium, large]).toEqual([7, 9.5, 12]);
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 6 }, 10)).toBe(large);
    expect(wikiGraphNodeRadius({ kind: "procedure", inbound: 3 }, 10)).toBe(medium);
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 2 }, 10)).toBe(small);
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 40 }, 40)).toBe(large);
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 10 }, 40)).toBe(medium);
  });

  it("keeps a page with at most one incoming link small and the guide large in any workspace", () => {
    const { small, large } = WIKI_GRAPH_NODE_RADII;
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 0 }, 0)).toBe(small);
    expect(wikiGraphNodeRadius({ kind: "procedure", inbound: 1 }, 1)).toBe(small);
    expect(wikiGraphNodeRadius({ kind: "knowledge", inbound: 2 }, 2)).toBe(large);
    expect(wikiGraphNodeRadius({ kind: "guide", inbound: 0 }, 40)).toBe(large);
    expect(wikiGraphNodeScale(0.5)).toBe(0.5);
    expect(wikiGraphNodeScale(4)).toBe(2);
  });

  it("measures the most linked page without the guide, which every page links to", () => {
    expect(
      wikiGraphPeakInbound([
        { kind: "guide", inbound: 30 },
        { kind: "knowledge", inbound: 4 },
        { kind: "procedure", inbound: 7 },
      ]),
    ).toBe(7);
    expect(wikiGraphPeakInbound([{ kind: "guide", inbound: 3 }])).toBe(0);
    expect(wikiGraphPeakInbound([])).toBe(0);
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

  it("keeps the guide under a kind filter and adds the pages a search found by their text", () => {
    const nodes = [
      node({ id: "1", title: "Refund policy" }),
      node({ id: "2", title: "Onboarding", kind: "procedure" }),
      node({ id: "3", title: "Operating Guide", kind: "guide" }),
    ];
    expect(wikiGraphVisibleIds(nodes, { query: "", kind: null })).toEqual(new Set(["1", "2", "3"]));
    expect(wikiGraphVisibleIds(nodes, { query: "", kind: "procedure" })).toEqual(new Set(["2", "3"]));
    expect(wikiGraphVisibleIds(nodes, { query: "", kind: "knowledge" })).toEqual(new Set(["1", "3"]));
    expect(wikiGraphVisibleIds(nodes, { query: " REFUND ", kind: null })).toEqual(new Set(["1"]));
    expect(wikiGraphVisibleIds(nodes, { query: "refund", kind: "procedure" })).toEqual(new Set());
    expect(wikiGraphVisibleIds(nodes, { query: "chargeback", kind: null, found: new Set(["2"]) })).toEqual(
      new Set(["2"]),
    );
    expect(wikiGraphVisibleIds(nodes, { query: "chargeback", kind: "knowledge", found: new Set(["2"]) })).toEqual(
      new Set(),
    );
  });

  it("truncates long labels with an ellipsis", () => {
    expect(wikiGraphLabel(" Short ")).toBe("Short");
    const long = wikiGraphLabel("Social Channels: LinkedIn, Reddit, X, Instagram and Telegram");
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(34);
  });

  it("fits every node into the viewport with room for titles, the filter row and the hint", () => {
    const nodes = [node({ id: "a", x: 0.1, y: 0.1 }), node({ id: "b", x: 0.9, y: 0.6 })];
    const viewport = { width: 1200, height: 780 };
    const fit = wikiGraphFitTransform(nodes, viewport);
    expect(fit).toEqual({ k: 0.75, x: 0, y: 131.5 });
    for (const item of nodes) {
      const point = wikiGraphWorldPoint(item);
      const x = point.x * fit.k + fit.x;
      const y = point.y * fit.k + fit.y;
      expect(x).toBeGreaterThanOrEqual(WIKI_GRAPH_FIT_PADDING.side);
      expect(x).toBeLessThanOrEqual(viewport.width - WIKI_GRAPH_FIT_PADDING.side);
      expect(y).toBeGreaterThanOrEqual(WIKI_GRAPH_FIT_PADDING.top);
      expect(y).toBeLessThanOrEqual(viewport.height - WIKI_GRAPH_FIT_PADDING.bottom);
    }
  });

  it("does not blow a single page up to the whole viewport and survives an unmeasured viewport", () => {
    const single = wikiGraphFitTransform([node({ id: "a", x: 0.5, y: 0.5 })], { width: 1200, height: 780 });
    expect(single.k).toBe(1.6);
    expect(800 * single.k + single.x).toBe(600);
    expect(wikiGraphFitTransform([node({ id: "a" })], { width: 0, height: 0 })).toEqual({ k: 1, x: 0, y: 0 });
    expect(wikiGraphFitTransform([], { width: 1200, height: 780 })).toEqual({ k: 1, x: 0, y: 0 });
  });

  it("zooms around the pointer and maps screen points back to unit coordinates", () => {
    const start = { k: 1, x: 0, y: 0 };
    const zoomed = wikiGraphZoomAt(start, 2, { x: 100, y: 50 });
    expect(zoomed).toEqual({ k: 2, x: -100, y: -50 });
    expect(wikiGraphZoomAt(start, 100, { x: 0, y: 0 }).k).toBe(4);
    expect(wikiGraphZoomAt(start, 0.001, { x: 0, y: 0 }).k).toBe(0.25);
    expect(wikiGraphToUnit({ x: 100, y: 50 }, zoomed)).toEqual({ x: 0.0625, y: 0.05 });
    expect(wikiGraphToUnit({ x: -5000, y: 9000 }, start)).toEqual({ x: 0, y: 1 });
  });

  describe("titles", () => {
    const alpha = node({ id: "a", title: "Alpha page title", inbound: 2 });
    const bravo = node({ id: "b", title: "Bravo page title", inbound: 1, x: 0.54 });
    const all = new Set(["a", "b"]);

    it("draws the title of the more linked page when two titles would cover each other", () => {
      expect(wikiGraphLabelIds([alpha, bravo], { zoom: 1, focusId: null, focus: null, visible: all })).toEqual(
        new Set(["a"]),
      );
    });

    it("draws both titles once zooming in has made room", () => {
      expect(wikiGraphLabelIds([alpha, bravo], { zoom: 4, focusId: null, focus: null, visible: all })).toEqual(all);
    });

    it("always draws the hovered or selected page's title, in place of the one it covers", () => {
      expect(wikiGraphLabelIds([alpha, bravo], { zoom: 1, focusId: "b", focus: new Set(["b"]), visible: all })).toEqual(
        new Set(["b"]),
      );
    });

    it("prefers the pages linked with the hovered page over more linked pages elsewhere", () => {
      const far = node({ id: "c", title: "Charlie page title", x: 0.2, y: 0.2 });
      expect(
        wikiGraphLabelIds([alpha, bravo, far], {
          zoom: 1,
          focusId: "c",
          focus: new Set(["c", "b"]),
          visible: new Set(["a", "b", "c"]),
        }),
      ).toEqual(new Set(["b", "c"]));
    });

    it("gives the guide its title before a more linked page", () => {
      const guide = node({ id: "g", title: "Operating Guide", kind: "guide" });
      const busy = node({ id: "k", title: "Bravo page title", inbound: 9, x: 0.54 });
      expect(
        wikiGraphLabelIds([guide, busy], { zoom: 1, focusId: null, focus: null, visible: new Set(["g", "k"]) }),
      ).toEqual(new Set(["g"]));
    });

    it("lets only pages in view compete for the space", () => {
      expect(
        wikiGraphLabelIds([alpha, bravo], { zoom: 1, focusId: null, focus: null, visible: new Set(["b"]) }),
      ).toEqual(new Set(["b"]));
    });

    it("leaves out a title that would cover another page", () => {
      const below = node({ id: "d", title: "Delta", y: 0.512 });
      expect(
        wikiGraphLabelIds([alpha, below], { zoom: 1, focusId: null, focus: null, visible: new Set(["a", "d"]) }),
      ).toEqual(new Set(["d"]));
    });
  });
});
