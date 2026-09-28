import { GATEWAY_KEY } from "./gateway-key";

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type {
  ClassifierModel,
  ClassifierResult,
  ClassifierSpec,
  ClassifierState,
} from "@/ee/agent-chat/classifier";

import { classifyAttempt } from "@/ee/agent-chat/classifier";

export { majority, percentile, signTestP } from "./stats";

const RAW_DIR = join(
  process.cwd(),
  "scripts/agent-benchmark/.runs/classifier-eval",
);
const SPEND_CAP_USD = Number(process.env.CLASSIFIER_EVAL_CAP_USD ?? 5);
const SPEND_STOP_USD = SPEND_CAP_USD * 0.95;
const ZDR_FEE_USD_PER_REQUEST = 0.0001;
const UNREADABLE_COST_USD = 0.002;
const MICROCENTS_PER_USD = 100_000_000;
const LEDGER = join(
  RAW_DIR,
  process.env.CLASSIFIER_EVAL_LEDGER ?? "spend.jsonl",
);

mkdirSync(RAW_DIR, { recursive: true });

type LedgerLine = {
  at: string;
  use: string;
  model: string;
  usd: number;
  zdrUsd: number;
  measured: boolean;
};

function readLedger(): LedgerLine[] {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerLine);
}

let spent = readLedger().reduce((sum, line) => sum + line.usd + line.zdrUsd, 0);

export function spentUsd() {
  return spent;
}

export function spendByUse() {
  const out: Record<
    string,
    { usd: number; zdrUsd: number; calls: number; unmeasured: number }
  > = {};
  for (const line of readLedger()) {
    const key = `${line.use}:${line.model}`;
    out[key] ??= { usd: 0, zdrUsd: 0, calls: 0, unmeasured: 0 };
    out[key].usd += line.usd;
    out[key].zdrUsd += line.zdrUsd;
    out[key].calls += 1;
    if (!line.measured) out[key].unmeasured += 1;
  }
  return out;
}

export function chargeCall(
  use: string,
  model: string,
  costMicrocents: number | null,
) {
  const measured = costMicrocents !== null;
  const usd = measured
    ? costMicrocents / MICROCENTS_PER_USD
    : UNREADABLE_COST_USD;
  const line: LedgerLine = {
    at: new Date().toISOString(),
    use,
    model,
    usd,
    zdrUsd: ZDR_FEE_USD_PER_REQUEST,
    measured,
  };
  appendFileSync(LEDGER, `${JSON.stringify(line)}\n`);
  spent += usd + ZDR_FEE_USD_PER_REQUEST;
}

export function assertBudget() {
  spent = readLedger().reduce((sum, line) => sum + line.usd + line.zdrUsd, 0);
  if (spent >= SPEND_STOP_USD)
    throw new Error(
      `spend ${spent.toFixed(4)} USD reached the stop line of ${SPEND_STOP_USD} USD`,
    );
}

type ClassifierCall = { result: ClassifierResult | null; ms: number };

export async function runClassifier(
  use: string,
  spec: ClassifierSpec,
  state: ClassifierState,
  model: ClassifierModel,
  timeoutMs?: number,
): Promise<ClassifierCall> {
  assertBudget();
  const started = performance.now();
  const { result } = await classifyAttempt(spec, state, {
    apiKey: GATEWAY_KEY,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  const ms = performance.now() - started;
  if (result) chargeCall(use, model, result.costMicrocents);
  return { result, ms };
}

export async function pool<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<R>,
) {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await work(items[index]!, index);
      }
    }),
  );
  return out;
}

export function writeRaw(name: string, data: unknown) {
  writeFileSync(join(RAW_DIR, name), JSON.stringify(data));
}

export function readRaw<T>(name: string): T | null {
  const file = join(RAW_DIR, name);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as T)
    : null;
}
