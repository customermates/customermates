import dagre, { type EdgeLabel, type Point } from "@dagrejs/dagre";

import type { ConfigureGraphData } from "./configure-graph-model";

import { ACCOUNTS_NODE_ID } from "./configure-graph-model";

export const GRAPH_NODE_WIDTH = 352;
export const GRAPH_VISIBLE_FIELDS = 6;
export const GRAPH_VISIBLE_ACCOUNTS = 4;
const LIST_CHROME_HEIGHT = 112;
const FIELD_ROW_HEIGHT = 36;
const SOURCE_CHROME_HEIGHT = 100;
const SOURCE_ROW_HEIGHT = 48;
const PROMPT_HEIGHT = 128;
const RELATIONSHIP_CHIP = { width: 120, height: 28 };
const ICON_CHIP = { width: 24, height: 24 };

export type ConfigureGraphPoint = { x: number; y: number };

export type ConfigureGraphPosition = ConfigureGraphPoint & { width: number; height: number };

export type ConfigureGraphRoute = { points: ConfigureGraphPoint[]; label: ConfigureGraphPoint };

export type ConfigureGraphLayout = {
  positions: Map<string, ConfigureGraphPosition>;
  routes: Map<string, ConfigureGraphRoute>;
};

export function graphListHeight(fieldCount: number, canManage: boolean) {
  const visible = Math.min(fieldCount, GRAPH_VISIBLE_FIELDS);
  const more = fieldCount > GRAPH_VISIBLE_FIELDS ? 1 : 0;
  return LIST_CHROME_HEIGHT + (visible + more + (canManage ? 1 : 0)) * FIELD_ROW_HEIGHT;
}

export function graphSourceHeight(accountCount: number) {
  if (!accountCount) return PROMPT_HEIGHT;
  const more = accountCount > GRAPH_VISIBLE_ACCOUNTS ? 1 : 0;
  return SOURCE_CHROME_HEIGHT + (Math.min(accountCount, GRAPH_VISIBLE_ACCOUNTS) + more) * SOURCE_ROW_HEIGHT;
}

export function configureGraphLayout(
  data: ConfigureGraphData,
  canManage: boolean,
  connectPrompt: boolean,
  measured: ReadonlyMap<string, { width: number; height: number }> = new Map(),
  direction: "TB" | "LR" = "TB",
): ConfigureGraphLayout {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 64, edgesep: 20, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));
  const size = (id: string, height: number) => measured.get(id) ?? { width: GRAPH_NODE_WIDTH, height };
  for (const list of data.lists)
    graph.setNode(list.type.id, size(list.type.id, graphListHeight(list.fields.length, canManage)));
  if (data.sources.length || connectPrompt)
    graph.setNode(ACCOUNTS_NODE_ID, size(ACCOUNTS_NODE_ID, graphSourceHeight(data.sources.length)));
  for (const edge of data.edges) {
    if (edge.kind !== "relationship") {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target))
        graph.setEdge(edge.source, edge.target, { ...ICON_CHIP, minlen: 1, weight: 2, labelpos: "c" }, edge.id);
      continue;
    }
    const { sourceTypeId, targetTypeId } = edge.relation;
    const [from, to] = edge.parent ? [targetTypeId, sourceTypeId] : [sourceTypeId, targetTypeId];
    graph.setEdge(from, to, { ...RELATIONSHIP_CHIP, minlen: 1, weight: edge.parent ? 4 : 1, labelpos: "c" }, edge.id);
  }
  dagre.layout(graph);
  const positions = new Map<string, ConfigureGraphPosition>();
  for (const id of graph.nodes()) {
    const node = graph.node(id);
    positions.set(id, {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
    });
  }
  const routes = new Map<string, ConfigureGraphRoute>();
  for (const { v, w, name } of graph.edges()) {
    const edge: EdgeLabel | undefined = graph.edge(v, w, name);
    if (!name || !edge?.points?.length) continue;
    routes.set(name, {
      points: edge.points.map((point: Point) => ({ x: point.x, y: point.y })),
      label: { x: edge.x ?? edge.points[0].x, y: edge.y ?? edge.points[0].y },
    });
  }
  return { positions, routes };
}

export function configureRoutePath(points: readonly ConfigureGraphPoint[]) {
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length < 2)
    return [first, ...rest].map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < rest.length - 1; index++) {
    const point = rest[index];
    const next = rest[index + 1];
    path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }
  const last = rest[rest.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

const VIEWPORT_PADDING = 16;
const VIEWPORT_TOP = 64;
const HINT_WIDTH = 1024;
const READABLE_ZOOM = 0.85;
const NARROW_READABLE_ZOOM = 0.55;
const NARROW_WIDTH = 640;

export function configureGraphViewport(positions: Map<string, ConfigureGraphPosition>, width: number, height: number) {
  const boxes = [...positions.values()];
  if (!boxes.length) return { x: 0, y: 0, zoom: 1 };
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const graphWidth = Math.max(...boxes.map((box) => box.x + box.width)) - minX;
  const graphHeight = Math.max(...boxes.map((box) => box.y + box.height)) - minY;
  const fitWidth = (width - VIEWPORT_PADDING * 2) / graphWidth;
  const top = width >= HINT_WIDTH ? VIEWPORT_TOP : VIEWPORT_PADDING;
  const fitAll = Math.min(fitWidth, (height - top - VIEWPORT_PADDING) / graphHeight);
  const readable = width < NARROW_WIDTH ? NARROW_READABLE_ZOOM : READABLE_ZOOM;
  const zoom = Math.min(1, Math.max(readable, fitAll));
  return {
    x: Math.max(VIEWPORT_PADDING, (width - graphWidth * zoom) / 2) - minX * zoom,
    y: top - minY * zoom,
    zoom,
  };
}
