import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";

import { WIKI_GRAPH_ASPECT } from "@/features/wiki/wiki-graph-frame";

export const WIKI_GRAPH_WORLD_HEIGHT = 1000;
export const WIKI_GRAPH_WORLD_WIDTH = WIKI_GRAPH_WORLD_HEIGHT * WIKI_GRAPH_ASPECT;
export const WIKI_GRAPH_MIN_ZOOM = 0.25;
export const WIKI_GRAPH_MAX_ZOOM = 4;
export const WIKI_GRAPH_DRAG_THRESHOLD = 4;
export const WIKI_GRAPH_LABEL_FONT_SIZE = 11;
const LABEL_MAX_LENGTH = 34;
const LABEL_CHARACTER_WIDTH = 6.1;
const LABEL_HEIGHT = 15;
const LABEL_GAP = 3;
const LABEL_PADDING = 3;

export type WikiGraphTransform = { k: number; x: number; y: number };

export const WIKI_GRAPH_KIND_NODE: Record<WikiPageKind, { tint: string; ring: string }> = {
  guide: { tint: "fill-background", ring: "stroke-foreground" },
  procedure: { tint: "fill-info/15", ring: "stroke-info" },
  knowledge: { tint: "fill-muted", ring: "stroke-muted-foreground/70" },
};

export const WIKI_GRAPH_KIND_DOT: Record<WikiPageKind, string> = {
  guide: "border-2 border-foreground bg-background",
  procedure: "border border-info bg-info/15",
  knowledge: "border border-muted-foreground/70 bg-muted",
};

export const WIKI_GRAPH_NODE_RADII = { small: 7, medium: 9.5, large: 12 } as const;
const LARGE_SHARE = 0.6;
const MEDIUM_SHARE = 0.25;
const SIZED_FROM_INBOUND = 2;

export function wikiGraphPeakInbound(nodes: ReadonlyArray<Pick<WikiGraphNode, "kind" | "inbound">>): number {
  return nodes.reduce((peak, node) => (node.kind === "guide" ? peak : Math.max(peak, node.inbound)), 0);
}

export function wikiGraphNodeRadius(node: Pick<WikiGraphNode, "kind" | "inbound">, peak: number): number {
  if (node.kind === "guide") return WIKI_GRAPH_NODE_RADII.large;
  if (node.inbound < SIZED_FROM_INBOUND) return WIKI_GRAPH_NODE_RADII.small;
  if (node.inbound >= peak * LARGE_SHARE) return WIKI_GRAPH_NODE_RADII.large;
  return node.inbound >= peak * MEDIUM_SHARE ? WIKI_GRAPH_NODE_RADII.medium : WIKI_GRAPH_NODE_RADII.small;
}

export function wikiGraphNodeScale(zoom: number): number {
  return zoom < 1 ? zoom : Math.sqrt(zoom);
}

export function wikiGraphNeighbours(graph: Pick<WikiGraph, "links">): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const set = neighbours.get(from) ?? new Set<string>();
    set.add(to);
    neighbours.set(from, set);
  };
  for (const link of graph.links) {
    add(link.source, link.target);
    add(link.target, link.source);
  }
  return neighbours;
}

export function wikiGraphMatches(node: Pick<WikiGraphNode, "title">, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle === "" || node.title.toLocaleLowerCase().includes(needle);
}

export function wikiGraphVisibleIds(
  nodes: ReadonlyArray<Pick<WikiGraphNode, "id" | "title" | "kind">>,
  filter: { query: string; kind: WikiPageKind | null; found?: ReadonlySet<string> },
): Set<string> {
  return new Set(
    nodes
      .filter(
        (node) =>
          (filter.kind === null || node.kind === filter.kind || node.kind === "guide") &&
          (wikiGraphMatches(node, filter.query) || filter.found?.has(node.id) === true),
      )
      .map((node) => node.id),
  );
}

export function wikiGraphLabel(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= LABEL_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, LABEL_MAX_LENGTH - 1).trimEnd()}…`;
}

export function wikiGraphWorldPoint(node: Pick<WikiGraphNode, "x" | "y">): { x: number; y: number } {
  return { x: node.x * WIKI_GRAPH_WORLD_WIDTH, y: node.y * WIKI_GRAPH_WORLD_HEIGHT };
}

export function clampWikiGraphZoom(k: number): number {
  return Math.min(WIKI_GRAPH_MAX_ZOOM, Math.max(WIKI_GRAPH_MIN_ZOOM, k));
}

export const WIKI_GRAPH_FIT_PADDING = { side: 120, top: 72, bottom: 64 };
const FIT_MAX_ZOOM = 1.6;

export function wikiGraphFitTransform(
  nodes: ReadonlyArray<Pick<WikiGraphNode, "x" | "y">>,
  viewport: { width: number; height: number },
): WikiGraphTransform {
  if (viewport.width <= 0 || viewport.height <= 0) return { k: 1, x: 0, y: 0 };
  const points = nodes.map(wikiGraphWorldPoint);
  if (points.length === 0) return { k: 1, x: 0, y: 0 };
  const { side, top, bottom } = WIKI_GRAPH_FIT_PADDING;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const width = Math.max(viewport.width - side * 2, 1);
  const height = Math.max(viewport.height - top - bottom, 1);
  const k = clampWikiGraphZoom(Math.min(width / spanX, height / spanY, FIT_MAX_ZOOM));
  return {
    k,
    x: side + width / 2 - ((minX + maxX) / 2) * k,
    y: top + height / 2 - ((minY + maxY) / 2) * k,
  };
}

export function wikiGraphZoomAt(
  current: WikiGraphTransform,
  factor: number,
  pivot: { x: number; y: number },
): WikiGraphTransform {
  const k = clampWikiGraphZoom(current.k * factor);
  const ratio = k / current.k;
  return {
    k,
    x: pivot.x - (pivot.x - current.x) * ratio,
    y: pivot.y - (pivot.y - current.y) * ratio,
  };
}

export function wikiGraphToUnit(
  screen: { x: number; y: number },
  transform: WikiGraphTransform,
): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, (screen.x - transform.x) / transform.k / WIKI_GRAPH_WORLD_WIDTH)),
    y: Math.min(1, Math.max(0, (screen.y - transform.y) / transform.k / WIKI_GRAPH_WORLD_HEIGHT)),
  };
}

type LabelNode = Pick<WikiGraphNode, "id" | "title" | "kind" | "inbound" | "x" | "y">;

export function wikiGraphLabelIds(
  nodes: readonly LabelNode[],
  context: {
    zoom: number;
    focusId: string | null;
    focus: ReadonlySet<string> | null;
    visible: ReadonlySet<string>;
  },
): Set<string> {
  const scale = wikiGraphNodeScale(context.zoom);
  const peak = wikiGraphPeakInbound(nodes);
  const placed = nodes.map((node) => {
    const point = wikiGraphWorldPoint(node);
    const x = point.x * context.zoom;
    const y = point.y * context.zoom;
    const radius = (wikiGraphNodeRadius(node, peak) / scale) * context.zoom;
    const width = wikiGraphLabel(node.title).length * LABEL_CHARACTER_WIDTH + LABEL_PADDING * 2;
    const top = y + radius + LABEL_GAP;
    return { node, x, y, radius, left: x - width / 2, right: x + width / 2, top, bottom: top + LABEL_HEIGHT };
  });
  const rank = (item: (typeof placed)[number]) =>
    (item.node.id === context.focusId ? 8 : 0) +
    (context.focus?.has(item.node.id) ? 4 : 0) +
    (item.node.kind === "guide" ? 2 : 0);
  const order = placed
    .filter((item) => context.visible.has(item.node.id))
    .sort((a, b) => rank(b) - rank(a) || b.node.inbound - a.node.inbound || (a.node.id < b.node.id ? -1 : 1));
  const shown: typeof placed = [];
  for (const item of order) {
    const forced = item.node.id === context.focusId;
    const coversLabel = shown.some(
      (other) =>
        item.left < other.right && other.left < item.right && item.top < other.bottom && other.top < item.bottom,
    );
    const coversNode =
      !forced &&
      placed.some((other) => {
        if (other === item) return false;
        const nearestX = Math.min(Math.max(other.x, item.left), item.right);
        const nearestY = Math.min(Math.max(other.y, item.top), item.bottom);
        return Math.hypot(nearestX - other.x, nearestY - other.y) < other.radius + 1;
      });
    if (forced || (!coversLabel && !coversNode)) shown.push(item);
  }
  return new Set(shown.map((item) => item.node.id));
}
