import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Intrinsics, QuickJS } from "quickjs-wasi";

export type AnalysisLimits = { memoryBytes: number; wallMs: number; maxSteps: number };

export const ANALYSIS_LIMITS: AnalysisLimits = { memoryBytes: 32 * 1024 * 1024, wallMs: 1_000, maxSteps: 200_000_000 };

export type AnalysisOutcome = { ok: true; value: unknown } | { ok: false; error: string };

const ANALYSIS_INTRINSICS =
  Intrinsics.EVAL | Intrinsics.JSON | Intrinsics.MAP_SET | Intrinsics.REGEXP | Intrinsics.TYPED_ARRAYS;
const DEADLINE_CHECK_INTERVAL = 4_096;

let compiledModule: Promise<WebAssembly.Module> | undefined;

function quickjsModule(): Promise<WebAssembly.Module> {
  compiledModule ??= readFile(join(process.cwd(), "node_modules", "quickjs-wasi", "quickjs.wasm")).then((bytes) =>
    WebAssembly.compile(bytes),
  );
  return compiledModule;
}

function stoppedError(stop: "time" | "steps" | null, message: string): string {
  if (stop === "time") return "The analysis code ran longer than its time budget and was stopped.";
  if (stop === "steps") return "The analysis code exceeded its step budget and was stopped.";
  if (/out of memory/i.test(message)) return "The analysis code ran out of memory and was stopped.";
  return `The analysis code failed: ${message.slice(0, 500)}`;
}

export async function runAnalysisCode(
  code: string,
  data: unknown,
  limits: AnalysisLimits = ANALYSIS_LIMITS,
): Promise<AnalysisOutcome> {
  const deadline = Date.now() + limits.wallMs;
  let steps = 0;
  let stop: "time" | "steps" | null = null;
  const vm = await QuickJS.create({
    wasm: await quickjsModule(),
    memoryLimit: limits.memoryBytes,
    intrinsics: ANALYSIS_INTRINSICS,
    interruptHandler: () => {
      steps += 1;
      if (steps > limits.maxSteps) stop = "steps";
      else if (steps % DEADLINE_CHECK_INTERVAL === 0 && Date.now() > deadline) stop = "time";
      return stop !== null;
    },
  });
  try {
    const input = vm.newString(JSON.stringify(data ?? null));
    vm.setProp(vm.global, "__analysisInput", input);
    input.dispose();
    const result = vm.evalCode(
      `(() => { const run = (${code}); const data = JSON.parse(__analysisInput); __analysisInput = undefined; return JSON.stringify(run(data)); })()`,
      "analysis.js",
    );
    try {
      const serialized = vm.dump(result);
      return { ok: true, value: typeof serialized === "string" ? (JSON.parse(serialized) as unknown) : null };
    } finally {
      result.dispose();
    }
  } catch (error) {
    return { ok: false, error: stoppedError(stop, error instanceof Error ? error.message : String(error)) };
  } finally {
    vm.dispose();
  }
}
