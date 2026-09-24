import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MessageChannel, Worker, receiveMessageOnPort, type MessagePort } from "node:worker_threads";

import { Intrinsics } from "quickjs-wasi";

export type AnalysisLimits = { memoryBytes: number; wallMs: number; maxSteps: number; workerHeapMb: number };

export const ANALYSIS_LIMITS: AnalysisLimits = {
  memoryBytes: 128 * 1024 * 1024,
  wallMs: 3_000,
  maxSteps: 200_000_000,
  workerHeapMb: 256,
};

export type AnalysisOutcome =
  | { ok: true; serialized: string | null }
  | { ok: false; resultChars: number }
  | { ok: false; error: string };

const ANALYSIS_INTRINSICS =
  Intrinsics.EVAL |
  Intrinsics.JSON |
  Intrinsics.MAP_SET |
  Intrinsics.PROMISE |
  Intrinsics.REGEXP |
  Intrinsics.TYPED_ARRAYS;
const TERMINATE_MARGIN_MS = 250;
const NOT_A_FUNCTION = "AnalysisCodeIsNotAFunction";
const NEVER_SETTLED = "AnalysisPromiseNeverSettled";
const HOLDS_PROMISE = "AnalysisResultHoldsAPromise";
const HOLDS_ITERATOR = "AnalysisResultHoldsAMapSetOrIterator";
const NOT_JSON = "AnalysisResultIsNotJson";
const MESSAGE_MAX_CHARS = 500;
const JOB_ERROR_PREFIX = "Job execution error: ";
const NO_MESSAGE = "<null>";

type Stop = "time" | "steps" | "memory" | null;
type WorkerReport =
  | { ok: true; serialized: string | null }
  | { ok: false; resultChars: number }
  | { ok: false; stop: Stop; message: string };
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
  resultMaxChars: number;
  messageMaxChars: number;
};

const TIMED_OUT: WorkerReport = { ok: false, stop: "time", message: "" };
const WORKER_OUT_OF_MEMORY: WorkerReport = { ok: false, stop: "memory", message: "" };

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
  const messageOf = (thrown) =>
    thrown.consume((value) =>
      value.getProp("message").consume((message) => (message.isUndefined ? value.toString() : message.toString())),
    );
  const isJson = (text) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  };
  try {
    const input = vm.newString(workerData.input);
    vm.setProp(vm.global, "__analysisInput", input);
    input.dispose();
    let result = vm.evalCode(workerData.source, "analysis.js");
    if (result.isPromise) {
      const promise = result;
      try {
        vm.executePendingJobs();
        if (promise.promiseState === 0) {
          const unreported = vm.getException();
          if (unreported.typeof !== "unknown") throw new Error(messageOf(unreported));
          unreported.dispose();
          throw new Error("${NEVER_SETTLED}");
        }
        const settled = await vm.resolvePromise(promise);
        if ("error" in settled) throw new Error(messageOf(settled.error));
        result = settled.value;
      } finally {
        promise.dispose();
      }
    }
    try {
      if (stop !== null) throw new Error("interrupted");
      const resultChars = result.isString ? result.length : 0;
      if (resultChars > workerData.resultMaxChars) report.postMessage({ ok: false, resultChars });
      else {
        const serialized = result.isString ? vm.dump(result) : null;
        if (serialized !== null && !isJson(serialized)) throw new Error("${NOT_JSON}");
        report.postMessage({ ok: true, serialized });
      }
    } finally {
      result.dispose();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.postMessage({ ok: false, stop, message: message.slice(0, workerData.messageMaxChars) });
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
  return `(() => { const run = (${code}); if (typeof run !== "function") throw new TypeError("${NOT_A_FUNCTION}"); const data = JSON.parse(__analysisInput); __analysisInput = undefined; const iterates = (item) => item instanceof Map || item instanceof Set || item instanceof WeakMap || item instanceof WeakSet || (!Array.isArray(item) && (typeof item.next === "function" || typeof item[Symbol.asyncIterator] === "function")); const serialize = (value) => JSON.stringify(value, (key, item) => { if (item instanceof Promise) throw new TypeError("${HOLDS_PROMISE}"); if (typeof item === "object" && item !== null && iterates(item)) throw new TypeError("${HOLDS_ITERATOR}"); return item; }); const result = run(data); return result instanceof Promise ? result.then(serialize) : serialize(result); })()`;
}

function reportedMessage(message: string): string {
  if (!message.startsWith(JOB_ERROR_PREFIX)) return message;
  const jobMessage = message.slice(JOB_ERROR_PREFIX.length);
  return jobMessage === "null" || jobMessage === "undefined" ? NO_MESSAGE : jobMessage;
}

function stoppedError(stop: Stop, reported: string): string {
  const message = reportedMessage(reported);
  if (stop === "time") return "The analysis code ran longer than its time budget and was stopped.";
  if (stop === "steps") return "The analysis code exceeded its step budget and was stopped.";
  if (stop === "memory" || /out of memory/i.test(message))
    return "The analysis code ran out of memory and was stopped.";
  if (message === NO_MESSAGE)
    return "The analysis code stopped without an error message: it ran out of memory, or it threw or rejected with null or undefined.";
  if (message === NOT_A_FUNCTION)
    return "The analysis code must be one function expression (data) => result; it may be async.";
  if (message === NEVER_SETTLED)
    return "The analysis code returned a promise that never settled; the code has no timers, network or tools to wait for.";
  if (message === HOLDS_PROMISE) return "The analysis result holds a promise; await it, for example with Promise.all.";
  if (message === HOLDS_ITERATOR)
    return "The analysis result holds a Map, Set, iterator or generator, which JSON cannot represent; convert it with Object.fromEntries or Array.from first.";
  if (message === NOT_JSON) return "The analysis code replaced JSON.stringify, so its result is not valid JSON.";
  return `The analysis code failed: ${message.slice(0, MESSAGE_MAX_CHARS)}`;
}

async function runInWorker(
  workerData: AnalysisWorkerData,
  terminateAfterMs: number,
  heapMb: number,
): Promise<WorkerReport> {
  const channel = new MessageChannel();
  const worker = new Worker(ANALYSIS_WORKER_SOURCE, {
    eval: true,
    workerData: { ...workerData, report: channel.port2 },
    transferList: [channel.port2],
    resourceLimits: { maxOldGenerationSizeMb: heapMb },
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<WorkerReport>((resolve, reject) => {
      timer = setTimeout(() => {
        const pending = receiveMessageOnPort(channel.port1);
        resolve(pending ? (pending.message as WorkerReport) : TIMED_OUT);
      }, terminateAfterMs);
      channel.port1.on("message", resolve);
      worker.on("error", (error: NodeJS.ErrnoException) =>
        error.code === "ERR_WORKER_OUT_OF_MEMORY" ? resolve(WORKER_OUT_OF_MEMORY) : reject(error),
      );
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
  input: string,
  resultMaxChars: number,
  limits: AnalysisLimits = ANALYSIS_LIMITS,
): Promise<AnalysisOutcome> {
  const wasm = await quickjsModule();
  const deadline = Date.now() + limits.wallMs;
  const report = await runInWorker(
    {
      quickjsUrl: pathToFileURL(join(process.cwd(), "node_modules", "quickjs-wasi", "dist", "index.js")).href,
      wasm,
      source: analysisSource(code),
      input,
      deadline,
      maxSteps: limits.maxSteps,
      memoryBytes: limits.memoryBytes,
      intrinsics: ANALYSIS_INTRINSICS,
      resultMaxChars,
      messageMaxChars: MESSAGE_MAX_CHARS,
    },
    deadline + TERMINATE_MARGIN_MS - Date.now(),
    limits.workerHeapMb,
  );
  if (report.ok) return { ok: true, serialized: report.serialized };
  if ("resultChars" in report) return { ok: false, resultChars: report.resultChars };
  return { ok: false, error: stoppedError(report.stop, report.message) };
}
