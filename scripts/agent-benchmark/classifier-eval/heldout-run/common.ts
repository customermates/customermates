import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { signTestP } from "../stats";

export const HELDOUT_REPORT_DIR = join(
  process.cwd(),
  "scripts/agent-benchmark/reports/2026-09-27-classifier-heldout",
);
export const HELDOUT_RUNS = 3;
export const BOOTSTRAP_RESAMPLES = 10_000;
const BOOTSTRAP_SEED = 20_260_927;

mkdirSync(HELDOUT_REPORT_DIR, { recursive: true });

export function writeHeldoutReport(name: string, data: unknown) {
  writeFileSync(join(HELDOUT_REPORT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

export const round = (value: number | null, digits = 1) => (value === null ? null : Number(value.toFixed(digits)));

export const pct = (n: number, d: number) => (d === 0 ? null : round((100 * n) / d));

export function wilson(successes: number, n: number) {
  if (n === 0) return null;
  const z = 1.959964;
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [round(100 * Math.max(0, centre - half)), round(100 * Math.min(1, centre + half))];
}

export function mcnemar(pairs: readonly { control: boolean; candidate: boolean }[]) {
  const candidateOnly = pairs.filter((pair) => pair.candidate && !pair.control).length;
  const controlOnly = pairs.filter((pair) => pair.control && !pair.candidate).length;
  return {
    pairs: pairs.length,
    candidateOnly,
    controlOnly,
    exactP: Number(signTestP(candidateOnly, controlOnly).toPrecision(3)),
  };
}

function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type PairedUnit = { cluster: string; control: number; candidate: number };

export function clusterBootstrap(units: readonly PairedUnit[], scale = 1) {
  const clusters = [...new Set(units.map((unit) => unit.cluster))];
  const byCluster = new Map(clusters.map((cluster) => [cluster, units.filter((unit) => unit.cluster === cluster)]));
  const meanDiff = (picked: readonly string[]) => {
    let sum = 0;
    let count = 0;
    for (const cluster of picked)
      for (const unit of byCluster.get(cluster)!) {
        sum += unit.candidate - unit.control;
        count += 1;
      }
    return count === 0 ? 0 : sum / count;
  };
  const random = prng(BOOTSTRAP_SEED);
  const draws: number[] = [];
  for (let i = 0; i < BOOTSTRAP_RESAMPLES; i += 1)
    draws.push(meanDiff(clusters.map(() => clusters[Math.floor(random() * clusters.length)]!)));
  draws.sort((a, b) => a - b);
  const at = (q: number) => draws[Math.min(draws.length - 1, Math.floor(q * draws.length))]!;
  return {
    clusters: clusters.length,
    units: units.length,
    meanDiff: round(scale * meanDiff(clusters), 2),
    ci95: [round(scale * at(0.025), 2), round(scale * at(0.975), 2)],
  };
}

export function holm(pValues: Record<string, number>) {
  const entries = Object.entries(pValues).sort((a, b) => a[1] - b[1]);
  const adjusted: Record<string, number> = {};
  let running = 0;
  entries.forEach(([name, p], index) => {
    running = Math.max(running, Math.min(1, p * (entries.length - index)));
    adjusted[name] = Number(running.toPrecision(3));
  });
  return adjusted;
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const out: Record<string, T[]> = {};
  for (const item of items) (out[key(item)] ??= []).push(item);
  return out;
}
