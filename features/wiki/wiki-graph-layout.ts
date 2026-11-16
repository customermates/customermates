import { createHash } from "node:crypto";

export type WikiGraphPosition = { x: number; y: number; pinned?: boolean };
export type WikiGraphPositions = Record<string, WikiGraphPosition>;

export const WIKI_GRAPH_MAX_NODES = 600;

const LAYOUT_VERSION = "3";
const CENTER = 0.5;
const SPREAD = 0.42;
const EDGE = 0.02;
const MAX_IDEAL_DISTANCE = 0.28;
const IDEAL_DISTANCE_FACTOR = 0.85;
const REPULSION_REACH = 3;
const GRAVITY_PER_IDEAL = 18;
const COLD_TEMPERATURE = 0.1;
const WARM_TEMPERATURE = 0.006;
const FINAL_TEMPERATURE = 0.002;
const WARM_ITERATIONS = 30;
const COINCIDENT = 1e-6;

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
  if (count <= 120) return 400;
  if (count <= 300) return 200;
  return 120;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return CENTER;
  return Math.min(1 - EDGE, Math.max(EDGE, value));
}

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
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
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
  const ideal = Math.min(MAX_IDEAL_DISTANCE, IDEAL_DISTANCE_FACTOR / Math.sqrt(count));
  for (let position = 0; position < count; position += 1) {
    if (placed[position]) continue;
    const anchors = neighbours[position].filter((other) => placed[other]);
    const angle = random() * Math.PI * 2;
    if (anchors.length > 0) {
      const anchorX = anchors.reduce((sum, other) => sum + x[other], 0) / anchors.length;
      const anchorY = anchors.reduce((sum, other) => sum + y[other], 0) / anchors.length;
      x[position] = clamp(anchorX + Math.cos(angle) * ideal);
      y[position] = clamp(anchorY + Math.sin(angle) * ideal);
    } else {
      const radius = SPREAD * (0.35 + random() * 0.65);
      x[position] = clamp(CENTER + Math.cos(angle) * radius);
      y[position] = clamp(CENTER + Math.sin(angle) * radius);
    }
    placed[position] = 1;
  }

  const previouslyPlaced = ids.filter((id) => previous[id]).length;
  const warm = previouslyPlaced > 0 && previouslyPlaced * 2 >= count;
  const iterations = warm ? WARM_ITERATIONS : iterationsFor(count);
  const startTemperature = warm ? WARM_TEMPERATURE : COLD_TEMPERATURE;
  const reach = ideal * REPULSION_REACH;
  const gravity = GRAVITY_PER_IDEAL * ideal;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const temperature = startTemperature * (1 - iteration / iterations) + FINAL_TEMPERATURE;
    dx.fill(0);
    dy.fill(0);
    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        let deltaX = x[b] - x[a];
        let deltaY = y[b] - y[a];
        let distance = Math.hypot(deltaX, deltaY);
        if (distance < COINCIDENT) {
          const angle = ((a * 7919 + b * 104729) % 360) * (Math.PI / 180);
          deltaX = Math.cos(angle) * COINCIDENT;
          deltaY = Math.sin(angle) * COINCIDENT;
          distance = COINCIDENT;
        }
        if (distance > reach) continue;
        const force = (ideal * ideal) / distance;
        const unitX = (deltaX / distance) * force;
        const unitY = (deltaY / distance) * force;
        dx[a] -= unitX;
        dy[a] -= unitY;
        dx[b] += unitX;
        dy[b] += unitY;
      }
    }
    for (const [a, b] of edges) {
      const deltaX = x[b] - x[a];
      const deltaY = y[b] - y[a];
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < COINCIDENT) continue;
      const force = (distance * distance) / ideal;
      const unitX = (deltaX / distance) * force;
      const unitY = (deltaY / distance) * force;
      dx[a] += unitX;
      dy[a] += unitY;
      dx[b] -= unitX;
      dy[b] -= unitY;
    }
    for (let position = 0; position < count; position += 1) {
      if (fixed[position]) continue;
      dx[position] += (CENTER - x[position]) * gravity;
      dy[position] += (CENTER - y[position]) * gravity;
      const length = Math.hypot(dx[position], dy[position]);
      if (length < COINCIDENT) continue;
      const step = Math.min(length, temperature) / length;
      x[position] = clamp(x[position] + dx[position] * step);
      y[position] = clamp(y[position] + dy[position] * step);
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
