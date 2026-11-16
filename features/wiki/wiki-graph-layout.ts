import { createHash } from "node:crypto";

export type WikiGraphPosition = { x: number; y: number; pinned?: boolean };
export type WikiGraphPositions = Record<string, WikiGraphPosition>;

export const WIKI_GRAPH_MAX_NODES = 600;

const CENTER = 0.5;
const SPREAD = 0.42;
const REPULSION = 0.0008;
const REPULSION_RANGE = 0.35;
const REPULSION_MAX = 0.05;
const LINK_LENGTH = 0.2;
const LINK_STRENGTH = 0.05;
const GRAVITY = 0.03;
const DAMPING = 0.6;
const EDGE = 0.02;
const WARM_ITERATIONS = 120;
const WARM_ALPHA = 0.1;

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hash32(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function iterationsFor(count: number): number {
  if (count <= 120) return 600;
  if (count <= 300) return 250;
  return 120;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return CENTER;
  return Math.min(1 - EDGE, Math.max(EDGE, value));
}

const LAYOUT_VERSION = "2";

export function wikiLinksHash(nodeIds: readonly string[], links: ReadonlyArray<readonly [string, string]>): string {
  const hash = createHash("sha256");
  hash.update(`v:${LAYOUT_VERSION}\n`);
  for (const id of [...nodeIds].sort()) hash.update(`n:${id}\n`);
  for (const link of links.map(([source, target]) => `${source}>${target}`).sort()) hash.update(`l:${link}\n`);
  return hash.digest("hex");
}

export function layoutWikiGraph({
  nodeIds,
  links,
  previous = {},
  hubId,
}: {
  nodeIds: readonly string[];
  links: ReadonlyArray<readonly [string, string]>;
  previous?: WikiGraphPositions;
  hubId?: string | null;
}): WikiGraphPositions {
  const ids = [...new Set(nodeIds)].slice(0, WIKI_GRAPH_MAX_NODES);
  const count = ids.length;
  if (count === 0) return {};
  const index = new Map(ids.map((id, position) => [id, position] as const));
  const edges = links
    .filter(([source, target]) => source !== target && index.has(source) && index.has(target))
    .map(([source, target]) => [index.get(source) as number, index.get(target) as number] as const);
  const neighbours: number[][] = ids.map(() => []);
  for (const [source, target] of edges) {
    neighbours[source].push(target);
    neighbours[target].push(source);
  }

  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const vx = new Float64Array(count);
  const vy = new Float64Array(count);
  const fixed = new Uint8Array(count);
  const placed = new Uint8Array(count);
  const random = seededRandom(ids.join("|"));

  ids.forEach((id, position) => {
    const stored = previous[id];
    if (!stored) return;
    x[position] = clamp(stored.x);
    y[position] = clamp(stored.y);
    placed[position] = 1;
    if (stored.pinned) fixed[position] = 1;
  });
  const hubPosition = hubId ? index.get(hubId) : undefined;
  const anyPinned = fixed.some((value) => value === 1);
  if (hubPosition !== undefined && !placed[hubPosition] && !anyPinned) {
    x[hubPosition] = CENTER;
    y[hubPosition] = CENTER;
    placed[hubPosition] = 1;
    fixed[hubPosition] = 1;
  }
  for (let position = 0; position < count; position += 1) {
    if (placed[position]) continue;
    const anchors = neighbours[position].filter((other) => placed[other]);
    if (anchors.length > 0) {
      const angle = random() * Math.PI * 2;
      x[position] = clamp(anchors.reduce((sum, other) => sum + x[other], 0) / anchors.length + Math.cos(angle) * 0.08);
      y[position] = clamp(anchors.reduce((sum, other) => sum + y[other], 0) / anchors.length + Math.sin(angle) * 0.08);
    } else {
      const angle = random() * Math.PI * 2;
      const radius = SPREAD * (0.55 + random() * 0.45);
      x[position] = CENTER + Math.cos(angle) * radius;
      y[position] = CENTER + Math.sin(angle) * radius;
    }
    placed[position] = 1;
  }

  const previouslyPlaced = ids.filter((id) => previous[id]).length;
  const warm = previouslyPlaced > 0 && previouslyPlaced * 2 >= count;
  const iterations = warm ? WARM_ITERATIONS : iterationsFor(count);
  const startAlpha = warm ? WARM_ALPHA : 0.9;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const alpha = startAlpha * (1 - iteration / iterations) + 0.02;
    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        let dx = x[b] - x[a];
        let dy = y[b] - y[a];
        const distanceSquared = dx * dx + dy * dy + 1e-4;
        const distance = Math.sqrt(distanceSquared);
        if (distance > REPULSION_RANGE) continue;
        const force = Math.min(REPULSION_MAX, REPULSION / distanceSquared);
        dx /= distance;
        dy /= distance;
        vx[a] -= dx * force;
        vy[a] -= dy * force;
        vx[b] += dx * force;
        vy[b] += dy * force;
      }
    }
    for (const [a, b] of edges) {
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const distance = Math.sqrt(dx * dx + dy * dy) + 1e-6;
      const force = (distance - LINK_LENGTH) * LINK_STRENGTH;
      vx[a] += (dx / distance) * force;
      vy[a] += (dy / distance) * force;
      vx[b] -= (dx / distance) * force;
      vy[b] -= (dy / distance) * force;
    }
    for (let position = 0; position < count; position += 1) {
      vx[position] += (CENTER - x[position]) * GRAVITY;
      vy[position] += (CENTER - y[position]) * GRAVITY;
      if (fixed[position]) {
        vx[position] = 0;
        vy[position] = 0;
        continue;
      }
      x[position] = clamp(x[position] + vx[position] * alpha);
      y[position] = clamp(y[position] + vy[position] * alpha);
      vx[position] *= DAMPING;
      vy[position] *= DAMPING;
    }
  }

  const positions: WikiGraphPositions = {};
  ids.forEach((id, position) => {
    const pinned = previous[id]?.pinned === true;
    positions[id] = pinned
      ? { x: x[position], y: y[position], pinned: true }
      : { x: Number(x[position].toFixed(4)), y: Number(y[position].toFixed(4)) };
  });
  return positions;
}

export function pinWikiGraphPosition(
  positions: WikiGraphPositions,
  pageId: string,
  position: { x: number; y: number } | null,
): WikiGraphPositions {
  const current = positions[pageId];
  if (!position) {
    if (!current) return positions;
    return { ...positions, [pageId]: { x: current.x, y: current.y } };
  }
  return { ...positions, [pageId]: { x: clamp(position.x), y: clamp(position.y), pinned: true } };
}
