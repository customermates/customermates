import type { RecordModel, RecordRelationship, RecordType } from "@/features/records/record-model.schema";

import { configureParentId, configureRailRows } from "./configure-model";

export const MAP_NODE_WIDTH = 168;
export const MAP_NODE_HEIGHT = 44;
const PADDING = 48;
const NODE_GAP = 56;
const CHILD_DISTANCE = 120;

export type ConfigureMapNode = { type: RecordType; x: number; y: number };

export type ConfigureMapEdge = {
  relation: RecordRelationship;
  path: string;
  labelX: number;
  labelY: number;
};

export type ConfigureMapLayout = {
  nodes: ConfigureMapNode[];
  edges: ConfigureMapEdge[];
  width: number;
  height: number;
};

function clip(fromX: number, fromY: number, towardX: number, towardY: number) {
  const dx = towardX - fromX;
  const dy = towardY - fromY;
  if (dx === 0 && dy === 0) return { x: fromX, y: fromY };
  const scale = Math.min(
    dx === 0 ? Infinity : MAP_NODE_WIDTH / 2 / Math.abs(dx),
    dy === 0 ? Infinity : MAP_NODE_HEIGHT / 2 / Math.abs(dy),
  );
  return { x: fromX + dx * Math.min(scale, 1), y: fromY + dy * Math.min(scale, 1) };
}

const round = (value: number) => Math.round(value * 10) / 10;

export function configureMapLayout(model: RecordModel, showArchived: boolean): ConfigureMapLayout {
  const types = configureRailRows(model, { showArchived }).map((row) => row.type);
  const visible = new Set(types.map((type) => type.id));
  const parents = new Map(types.map((type) => [type.id, configureParentId(model, type)]));
  const roots = types.filter((type) => {
    const parent = parents.get(type.id);
    return !parent || !visible.has(parent);
  });
  const radius = roots.length <= 1 ? 0 : Math.max(150, ((MAP_NODE_WIDTH + NODE_GAP) * roots.length) / (2 * Math.PI));
  const placed = new Map<string, { x: number; y: number; angle: number; depth: number }>();
  roots.forEach((type, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(roots.length, 1);
    placed.set(type.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle), angle, depth: 0 });
  });
  for (const type of types) {
    if (placed.has(type.id)) continue;
    const parentId = parents.get(type.id);
    const parent = parentId ? placed.get(parentId) : undefined;
    if (!parent || !parentId) continue;
    const siblings = types.filter((candidate) => parents.get(candidate.id) === parentId);
    const offset = siblings.findIndex((candidate) => candidate.id === type.id) - (siblings.length - 1) / 2;
    const angle = parent.angle + offset * 0.45;
    const distance = CHILD_DISTANCE + (roots.length <= 1 ? MAP_NODE_HEIGHT : 0);
    placed.set(type.id, {
      x: parent.x + Math.cos(angle) * (distance + MAP_NODE_WIDTH / 3),
      y: parent.y + Math.sin(angle) * distance,
      angle,
      depth: parent.depth + 1,
    });
  }
  const positions = types.flatMap((type) => {
    const position = placed.get(type.id);
    return position ? [{ type, ...position }] : [];
  });
  const minX = Math.min(...positions.map((node) => node.x)) - MAP_NODE_WIDTH / 2 - PADDING;
  const minY = Math.min(...positions.map((node) => node.y)) - MAP_NODE_HEIGHT / 2 - PADDING;
  const maxX = Math.max(...positions.map((node) => node.x)) + MAP_NODE_WIDTH / 2 + PADDING;
  const maxY = Math.max(...positions.map((node) => node.y)) + MAP_NODE_HEIGHT / 2 + PADDING;
  const nodes = positions.map(({ type, x, y }) => ({ type, x: round(x - minX), y: round(y - minY) }));
  const at = new Map(nodes.map((node) => [node.type.id, node]));
  const relations = model.relationships.filter(
    (relation) =>
      (!relation.archived || showArchived) && at.has(relation.sourceTypeId) && at.has(relation.targetTypeId),
  );
  const pairKey = (relation: RecordRelationship) => [relation.sourceTypeId, relation.targetTypeId].sort().join(":");
  const edges = relations.map((relation) => {
    const source = at.get(relation.sourceTypeId) as ConfigureMapNode;
    const target = at.get(relation.targetTypeId) as ConfigureMapNode;
    const siblings = relations.filter((candidate) => pairKey(candidate) === pairKey(relation));
    const index = siblings.indexOf(relation);
    if (source === target) {
      const lift = MAP_NODE_HEIGHT / 2 + 28 + index * 18;
      const startX = source.x - 24;
      const endX = source.x + 24;
      const top = source.y - MAP_NODE_HEIGHT / 2;
      return {
        relation,
        path: `M ${round(startX)} ${round(top)} C ${round(startX - 20)} ${round(source.y - lift)} ${round(endX + 20)} ${round(source.y - lift)} ${round(endX)} ${round(top)}`,
        labelX: source.x,
        labelY: round(source.y - lift),
      };
    }
    const reversed = relation.sourceTypeId > relation.targetTypeId ? -1 : 1;
    const bend = (index - (siblings.length - 1) / 2) * 44 * reversed;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const controlX = (source.x + target.x) / 2 + (-dy / length) * bend;
    const controlY = (source.y + target.y) / 2 + (dx / length) * bend;
    const start = clip(source.x, source.y, controlX, controlY);
    const end = clip(target.x, target.y, controlX, controlY);
    return {
      relation,
      path: `M ${round(start.x)} ${round(start.y)} Q ${round(controlX)} ${round(controlY)} ${round(end.x)} ${round(end.y)}`,
      labelX: round(0.25 * start.x + 0.5 * controlX + 0.25 * end.x),
      labelY: round(0.25 * start.y + 0.5 * controlY + 0.25 * end.y),
    };
  });
  return {
    nodes,
    edges,
    width: nodes.length ? Math.ceil(maxX - minX) : 0,
    height: nodes.length ? Math.ceil(maxY - minY) : 0,
  };
}
