import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";

export const WIKI_GRAPH_WORLD = 1000;
export const WIKI_GRAPH_MIN_ZOOM = 0.25;
export const WIKI_GRAPH_MAX_ZOOM = 4;
export const WIKI_GRAPH_LABEL_LIMIT = 150;
export const WIKI_GRAPH_DRAG_THRESHOLD = 4;
const LABEL_MAX_LENGTH = 34;

export type WikiGraphTransform = { k: number; x: number; y: number };

export const WIKI_GRAPH_KIND_FILL: Record<WikiPageKind, string> = {
  guide: "fill-foreground",
  procedure: "fill-chart-1",
  knowledge: "fill-chart-2",
};

export const WIKI_GRAPH_KIND_DOT: Record<WikiPageKind, string> = {
  guide: "bg-foreground",
  procedure: "bg-chart-1",
  knowledge: "bg-chart-2",
};

export function wikiGraphNodeRadius(node: Pick<WikiGraphNode, "kind" | "inbound">): number {
  if (node.kind === "guide") return 11;
  return Math.min(14, 4 + Math.sqrt(node.inbound) * 1.8);
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
  filter: { query: string; kinds: ReadonlySet<WikiPageKind> },
): Set<string> {
  return new Set(
    nodes.filter((node) => filter.kinds.has(node.kind) && wikiGraphMatches(node, filter.query)).map((node) => node.id),
  );
}

export function wikiGraphLabel(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= LABEL_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, LABEL_MAX_LENGTH - 1).trimEnd()}…`;
}

export function wikiGraphWorldPoint(node: Pick<WikiGraphNode, "x" | "y">): { x: number; y: number } {
  return { x: node.x * WIKI_GRAPH_WORLD, y: node.y * WIKI_GRAPH_WORLD };
}

export function clampWikiGraphZoom(k: number): number {
  return Math.min(WIKI_GRAPH_MAX_ZOOM, Math.max(WIKI_GRAPH_MIN_ZOOM, k));
}

export function wikiGraphFitTransform(
  nodes: ReadonlyArray<Pick<WikiGraphNode, "x" | "y">>,
  viewport: { width: number; height: number },
  padding = 96,
): WikiGraphTransform {
  if (viewport.width <= 0 || viewport.height <= 0) return { k: 1, x: 0, y: 0 };
  const points = nodes.map(wikiGraphWorldPoint);
  if (points.length === 0) return { k: 1, x: 0, y: 0 };
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const k = clampWikiGraphZoom(
    Math.min((viewport.width - padding * 2) / spanX, (viewport.height - padding * 2) / spanY, 1.6),
  );
  return {
    k,
    x: viewport.width / 2 - ((minX + maxX) / 2) * k,
    y: viewport.height / 2 - ((minY + maxY) / 2) * k,
  };
}

export const WIKI_GRAPH_REVEAL_PADDING = 72;

export function wikiGraphRevealNode(
  node: Pick<WikiGraphNode, "x" | "y">,
  viewport: { width: number; height: number },
  current: WikiGraphTransform,
  reservedRight = 0,
): WikiGraphTransform {
  if (viewport.width === 0 || viewport.height === 0) return current;
  const point = wikiGraphWorldPoint(node);
  const screenX = point.x * current.k + current.x;
  const screenY = point.y * current.k + current.y;
  const minX = WIKI_GRAPH_REVEAL_PADDING;
  const maxX = Math.max(minX, viewport.width - reservedRight - WIKI_GRAPH_REVEAL_PADDING);
  const minY = WIKI_GRAPH_REVEAL_PADDING;
  const maxY = Math.max(minY, viewport.height - WIKI_GRAPH_REVEAL_PADDING);
  const shiftX = screenX < minX ? minX - screenX : screenX > maxX ? maxX - screenX : 0;
  const shiftY = screenY < minY ? minY - screenY : screenY > maxY ? maxY - screenY : 0;
  if (shiftX === 0 && shiftY === 0) return current;
  return { k: current.k, x: current.x + shiftX, y: current.y + shiftY };
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
    x: Math.min(1, Math.max(0, (screen.x - transform.x) / transform.k / WIKI_GRAPH_WORLD)),
    y: Math.min(1, Math.max(0, (screen.y - transform.y) / transform.k / WIKI_GRAPH_WORLD)),
  };
}

export function wikiGraphShowsLabel(
  node: Pick<WikiGraphNode, "id" | "inbound" | "kind">,
  context: { total: number; zoom: number; focus: ReadonlySet<string> | null; selected: string | null },
): boolean {
  if (context.selected === node.id || context.focus?.has(node.id)) return true;
  if (context.total <= WIKI_GRAPH_LABEL_LIMIT) return context.zoom >= 0.45 || node.kind === "guide";
  return context.zoom >= 1.2 || node.kind === "guide" || node.inbound >= 8;
}
