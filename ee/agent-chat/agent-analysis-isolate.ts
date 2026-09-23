import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MessageChannel, Worker, receiveMessageOnPort, type MessagePort } from "node:worker_threads";

import { Intrinsics } from "quickjs-wasi";

export type AnalysisLimits = { memoryBytes: number; wallMs: number; maxSteps: number };

export const ANALYSIS_LIMITS: AnalysisLimits = { memoryBytes: 32 * 1024 * 1024, wallMs: 1_000, maxSteps: 200_000_000 };

export type AnalysisOutcome = { ok: true; value: unknown } | { ok: false; error: string };

const ANALYSIS_INTRINSICS =
  Intrinsics.EVAL | Intrinsics.JSON | Intrinsics.MAP_SET | Intrinsics.REGEXP | Intrinsics.TYPED_ARRAYS;
const TERMINATE_MARGIN_MS = 250;
const NOT_A_SYNCHRONOUS_FUNCTION = "AnalysisCodeIsNotASynchronousFunction";

type Stop = "time" | "steps" | null;
type WorkerReport = { ok: true; serialized: string | null } | { ok: false; stop: Stop; message: string };
type AnalysisWorkerData = {
  report?: MessagePort;
  quickjsUrl: string;
  wasm: WebAssembly.Module;
  source: string;
  input: string;
  deadline: number;
  maxSteps: number;
  memoryBytes: number;
  intrinsics: number;
};

const TIMED_OUT: WorkerReport = { ok: false, stop: "time", message: "" };

const ANALYSIS_WORKER_SOURCE = `(async () => {
  const { workerData } = await import("node:worker_threads");
  const report = workerData.report;
  const { QuickJS } = await import(workerData.quickjsUrl);
  let steps = 0;
  let stop = null;
  const vm = await QuickJS.create({
    wasm: workerData.wasm,
    memoryLimit: workerData.memoryBytes,
    intrinsics: workerData.intrinsics,
    interruptHandler: () => {
      steps += 1;
      if (steps > workerData.maxSteps) stop = "steps";
      else if (Date.now() > workerData.deadline) stop = "time";
      return stop !== null;
    },
  });
  try {
    const input = vm.newString(workerData.input);
    vm.setProp(vm.global, "__analysisInput", input);
    input.dispose();
    const result = vm.evalCode(workerData.source, "analysis.js");
    try {
      const serialized = vm.dump(result);
      report.postMessage({ ok: true, serialized: typeof serialized === "string" ? serialized : null });
    } finally {
      result.dispose();
    }
  } catch (error) {
    report.postMessage({ ok: false, stop, message: error instanceof Error ? error.message : String(error) });
  } finally {
    vm.dispose();
  }
})();`;

let compiledModule: Promise<WebAssembly.Module> | undefined;

function quickjsModule(): Promise<WebAssembly.Module> {
  compiledModule ??= readFile(join(process.cwd(), "node_modules", "quickjs-wasi", "quickjs.wasm")).then((bytes) =>
    WebAssembly.compile(bytes),
  );
  return compiledModule;
}

function analysisSource(code: string): string {
  return `(() => { const run = (${code}); if (typeof run !== "function") throw new TypeError("${NOT_A_SYNCHRONOUS_FUNCTION}"); const data = JSON.parse(__analysisInput); __analysisInput = undefined; return JSON.stringify(run(data)); })()`;
}

function stoppedError(stop: Stop, message: string): string {
  if (stop === "time") return "The analysis code ran longer than its time budget and was stopped.";
  if (stop === "steps") return "The analysis code exceeded its step budget and was stopped.";
  if (/out of memory/i.test(message)) return "The analysis code ran out of memory and was stopped.";
  if (message === NOT_A_SYNCHRONOUS_FUNCTION)
    return "The analysis code must be one synchronous function expression (data) => result; async functions, await and promises are not available.";
  return `The analysis code failed: ${message.slice(0, 500)}`;
}

async function runInWorker(workerData: AnalysisWorkerData, terminateAfterMs: number): Promise<WorkerReport> {
  const channel = new MessageChannel();
  const worker = new Worker(ANALYSIS_WORKER_SOURCE, {
    eval: true,
    workerData: { ...workerData, report: channel.port2 },
    transferList: [channel.port2],
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<WorkerReport>((resolve, reject) => {
      timer = setTimeout(() => {
        const pending = receiveMessageOnPort(channel.port1);
        resolve(pending ? (pending.message as WorkerReport) : TIMED_OUT);
      }, terminateAfterMs);
      channel.port1.on("message", resolve);
      worker.on("error", reject);
      worker.on("exit", (exitCode) => {
        const pending = receiveMessageOnPort(channel.port1);
        if (pending) resolve(pending.message as WorkerReport);
        else reject(new Error(`The analysis worker exited with code ${exitCode} before it reported a result.`));
      });
    });
  } finally {
    clearTimeout(timer);
    channel.port1.close();
    await worker.terminate();
  }
}

export async function runAnalysisCode(
  code: string,
  data: unknown,
  limits: AnalysisLimits = ANALYSIS_LIMITS,
): Promise<AnalysisOutcome> {
  const wasm = await quickjsModule();
  const deadline = Date.now() + limits.wallMs;
  const report = await runInWorker(
    {
      quickjsUrl: pathToFileURL(join(process.cwd(), "node_modules", "quickjs-wasi", "dist", "index.js")).href,
      wasm,
      source: analysisSource(code),
      input: JSON.stringify(data ?? null),
      deadline,
      maxSteps: limits.maxSteps,
      memoryBytes: limits.memoryBytes,
      intrinsics: ANALYSIS_INTRINSICS,
    },
    deadline + TERMINATE_MARGIN_MS - Date.now(),
  );
  if (!report.ok) return { ok: false, error: stoppedError(report.stop, report.message) };
  return { ok: true, value: report.serialized === null ? null : (JSON.parse(report.serialized) as unknown) };
}
