import { describe, expect, it } from "vitest";

import { WIKI_GRAPH_MAX_NODES, layoutWikiGraph, pinWikiGraphPosition, wikiLinksHash } from "../wiki-graph-layout";

const id = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const ids = Array.from({ length: 12 }, (_, index) => id(index));
const links: Array<[string, string]> = [
  [id(0), id(1)],
  [id(0), id(2)],
  [id(1), id(2)],
  [id(3), id(4)],
  [id(4), id(5)],
  [id(5), id(3)],
  [id(0), id(6)],
];

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("Knowledge Base map layout", () => {
  it("is deterministic and keeps every node inside the unit square", () => {
    const first = layoutWikiGraph({ nodeIds: ids, links });
    const second = layoutWikiGraph({ nodeIds: ids, links });
    expect(second).toEqual(first);
    for (const position of Object.values(first)) {
      expect(position.x).toBeGreaterThanOrEqual(0.02);
      expect(position.x).toBeLessThanOrEqual(0.98);
      expect(position.y).toBeGreaterThanOrEqual(0.02);
      expect(position.y).toBeLessThanOrEqual(0.98);
    }
    expect(Object.keys(first)).toHaveLength(ids.length);
  });

  it("places linked pages closer together than unlinked ones", () => {
    const positions = layoutWikiGraph({ nodeIds: ids, links });
    const linked = links.map(([a, b]) => distance(positions[a], positions[b]));
    const unlinked = [distance(positions[id(0)], positions[id(9)]), distance(positions[id(3)], positions[id(10)])];
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(average(linked)).toBeLessThan(average(unlinked));
  });

  it("puts the hub page in the centre of a fresh layout", () => {
    const positions = layoutWikiGraph({ nodeIds: ids, links, hubId: id(0) });
    expect(positions[id(0)]).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps a pinned page exactly where it was and leaves the rest near their previous place", () => {
    const previous = layoutWikiGraph({ nodeIds: ids, links, hubId: id(0) });
    const pinned = pinWikiGraphPosition(previous, id(7), { x: 0.9, y: 0.1 });
    const next = layoutWikiGraph({ nodeIds: [...ids, id(12)], links: [...links, [id(12), id(1)]], previous: pinned });
    expect(next[id(7)]).toEqual({ x: 0.9, y: 0.1, pinned: true });
    expect(next[id(12)]).toBeDefined();
    const moved = ids.filter((node) => node !== id(7)).map((node) => distance(previous[node], next[node]));
    expect(Math.max(...moved)).toBeLessThan(0.2);
  });

  it("unpins a page without moving it", () => {
    const positions = pinWikiGraphPosition({ [id(1)]: { x: 0.3, y: 0.4, pinned: true } }, id(1), null);
    expect(positions[id(1)]).toEqual({ x: 0.3, y: 0.4 });
    expect(pinWikiGraphPosition({}, id(2), null)).toEqual({});
    expect(pinWikiGraphPosition({}, id(2), { x: 2, y: -1 })[id(2)]).toEqual({ x: 0.98, y: 0.02, pinned: true });
  });

  it("ignores self links, unknown endpoints and duplicate ids and caps the node count", () => {
    const many = Array.from({ length: WIKI_GRAPH_MAX_NODES + 5 }, (_, index) => id(index));
    const positions = layoutWikiGraph({
      nodeIds: [...many, id(0)],
      links: [
        [id(0), id(0)],
        [id(0), "ffffffff-ffff-ffff-ffff-ffffffffffff"],
      ],
    });
    expect(Object.keys(positions)).toHaveLength(WIKI_GRAPH_MAX_NODES);
  });

  it("spreads a few hundred sparsely linked pages without piling them on the border", () => {
    const many = Array.from({ length: 300 }, (_, index) => id(index));
    const sparse: Array<[string, string]> = many
      .filter((_, index) => index % 3 === 0 && index + 1 < many.length)
      .map((node, index) => [node, many[index * 3 + 1]]);
    const positions = layoutWikiGraph({ nodeIds: many, links: sparse, hubId: many[0] });
    const values = Object.values(positions);
    const onBorder = values.filter(({ x, y }) => x <= 0.02 || x >= 0.98 || y <= 0.02 || y >= 0.98).length;
    expect(onBorder / values.length).toBeLessThan(0.15);
    expect(new Set(values.map(({ x, y }) => `${x},${y}`)).size).toBe(values.length);
    let nearestSum = 0;
    for (const a of values) {
      let nearest = Infinity;
      for (const b of values) if (a !== b) nearest = Math.min(nearest, distance(a, b));
      nearestSum += nearest;
    }
    expect(nearestSum / values.length).toBeGreaterThan(0.01);
  });

  it("hashes the link set independent of order", () => {
    const forward = wikiLinksHash(ids, links);
    const reversed = wikiLinksHash([...ids].reverse(), [...links].reverse());
    expect(reversed).toBe(forward);
    expect(wikiLinksHash(ids, links.slice(1))).not.toBe(forward);
    expect(wikiLinksHash([...ids, id(12)], links)).not.toBe(forward);
  });
});
