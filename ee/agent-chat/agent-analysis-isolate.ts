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

export const ANALYSIS_MAX_WORKERS = 2;

type AnalysisOutcome =
  | { ok: true; serialized: string | null }
  | { ok: false; resultChars: number }
  | { ok: false; error: string };

const ANALYSIS_INTRINSICS =
  Intrinsics.JSON | Intrinsics.MAP_SET | Intrinsics.PROMISE | Intrinsics.REGEXP | Intrinsics.TYPED_ARRAYS;
const COMPILER_INTRINSICS = ANALYSIS_INTRINSICS | Intrinsics.EVAL;
const TERMINATE_MARGIN_MS = 250;
const NOT_A_FUNCTION = "AnalysisCodeIsNotAFunction";
const NOT_A_FUNCTION_ERROR = "The analysis code must be one function expression (data) => result; it may be async.";
const NEVER_SETTLED = "AnalysisPromiseNeverSettled";
const HOLDS_PROMISE = "AnalysisResultHoldsAPromise";
const HOLDS_ITERATOR = "AnalysisResultHoldsAMapSetOrIterator";
const NOT_JSON = "AnalysisResultIsNotJson";
const MESSAGE_MAX_CHARS = 500;
const JOB_ERROR_PREFIX = "Job execution error: ";
const TRAILING_COMMENTS =
  /^\s*(?:(?:\/\/[^\n\r\u2028\u2029]*(?:[\n\r\u2028\u2029]|$)|\/\*(?:[^*]|\*(?!\/))*\*\/)\s*)+$/;
const TRAILING_COMMENTS_MAX_CHARS = 2_000;
const NO_MESSAGE = "<null>";

type Stop = "time" | "steps" | "memory" | null;
type WorkerReport =
  | { ok: true; serialized: string | null }
  | { ok: false; resultChars: number }
  | { ok: false; stop: Stop; message: string; unparsed?: true };
type AnalysisWorkerData = {
  report?: MessagePort;
  quickjsUrl: string;
  wasm: WebAssembly.Module;
  code: string;
  fallbackCode: string | null;
  wrapper: string;
  input: string;
  deadline: number;
  maxSteps: number;
  memoryBytes: number;
  intrinsics: number;
  compilerIntrinsics: number;
  resultMaxChars: number;
  messageMaxChars: number;
  checkOnly: boolean;
};

const TIMED_OUT: WorkerReport = { ok: false, stop: "time", message: "" };
const WORKER_OUT_OF_MEMORY: WorkerReport = { ok: false, stop: "memory", message: "" };

const ANALYSIS_WRAPPER = `(run, input) => { if (typeof run !== "function") throw new TypeError("${NOT_A_FUNCTION}"); const data = JSON.parse(input); const iterates = (item) => item instanceof Map || item instanceof Set || item instanceof WeakMap || item instanceof WeakSet || (!Array.isArray(item) && (typeof item.next === "function" || typeof item[Symbol.asyncIterator] === "function")); const serialize = (value) => JSON.stringify(value, (key, item) => { if (item instanceof Promise) throw new TypeError("${HOLDS_PROMISE}"); if (typeof item === "object" && item !== null && iterates(item)) throw new TypeError("${HOLDS_ITERATOR}"); return item; }); const result = run(data); return result instanceof Promise ? result.then(serialize) : serialize(result); }`;

const ANALYSIS_WORKER_SOURCE = `(async () => {
  const { workerData } = await import("node:worker_threads");
  const report = workerData.report;
  const { QuickJS } = await import(workerData.quickjsUrl);
  let steps = 0;
  let stop = null;
  const interruptHandler = () => {
    steps += 1;
    if (steps > workerData.maxSteps) stop = "steps";
    else if (Date.now() > workerData.deadline) stop = "time";
    return stop !== null;
  };
  const compiler = await QuickJS.create({
    wasm: workerData.wasm,
    memoryLimit: workerData.memoryBytes,
    intrinsics: workerData.compilerIntrinsics,
    interruptHandler,
  });
  let vm = null;
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
  const errorText = (error) => (error instanceof Error ? error.message : String(error));
  const compileSingleExpression = (code) => {
    const bytecode = compiler.compile("(\\n" + code + "\\n)", "analysis.js");
    compiler.compile("[\\n" + code + "\\n]", "analysis.js");
    compiler.compile("(single = \\n" + code + "\\n) => single", "analysis.js");
    return bytecode;
  };
  const compiles = (source) => {
    try {
      compiler.compile(source, "analysis-shape.js");
      return true;
    } catch {
      return false;
    }
  };
  const FUNCTION_HEAD = /^\\s*(async\\s+)?function\\b\\s*(\\*?)\\s*(?:[A-Za-z_$][\\w$]*)?\\s*(?=\\()/;
  const ASYNC_PREFIX = /^\\s*async\\b/;
  const IDENTIFIER = /^\\s*[A-Za-z_$][\\w$]*\\s*$/;
  const LEADING_TRIVIA = /^(?:\\s+|\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n\\r\\u2028\\u2029]*)*/;
  const isArrowHead = (head) => {
    const async = ASYNC_PREFIX.exec(head);
    const params = async ? head.slice(async[0].length) : head;
    if (IDENTIFIER.test(params)) return !async || /^\\s/.test(params);
    return (
      params.slice(LEADING_TRIVIA.exec(params)[0].length).startsWith("(") &&
      compiles("(" + (async ? "async " : "") + "function" + params + " {}\\n)")
    );
  };
  const isOneFunction = (code, depth) => {
    const head = FUNCTION_HEAD.exec(code);
    if (head) return compiles("({ " + (head[1] ? "async " : "") + head[2] + "run" + code.slice(head[0].length) + "\\n})");
    for (let at = code.indexOf("=>"), tries = 0; at >= 0 && tries < 32; at = code.indexOf("=>", at + 2), tries += 1)
      if (isArrowHead(code.slice(0, at))) return true;
    const trimmed = code.trim();
    if (depth >= 4 || !trimmed.startsWith("(") || !trimmed.endsWith(")")) return false;
    const inner = trimmed.slice(1, -1);
    try {
      compileSingleExpression(inner);
    } catch {
      return false;
    }
    return isOneFunction(inner, depth + 1);
  };
  const compileExpression = (code) => {
    const bytecode = compileSingleExpression(code);
    if (!isOneFunction(code, 0)) throw new Error("${NOT_A_FUNCTION}");
    return bytecode;
  };
  const tryCompile = (code) => {
    try {
      return { bytecode: compileExpression(code) };
    } catch (error) {
      return { error: errorText(error) };
    }
  };
  try {
    const primary = tryCompile(workerData.code);
    const fallback = "error" in primary && workerData.fallbackCode !== null ? tryCompile(workerData.fallbackCode) : null;
    const compiled = fallback && "bytecode" in fallback ? fallback : primary;
    if ("error" in compiled) {
      report.postMessage({ ok: false, stop, message: compiled.error.slice(0, workerData.messageMaxChars), unparsed: true });
      return;
    }
    if (workerData.checkOnly) {
      report.postMessage({ ok: true, serialized: null });
      return;
    }
    const wrapperBytecode = compiler.compile(workerData.wrapper, "analysis-wrapper.js");
    compiler.dispose();
    vm = await QuickJS.create({
      wasm: workerData.wasm,
      memoryLimit: workerData.memoryBytes,
      intrinsics: workerData.intrinsics,
      interruptHandler,
    });
    const wrapper = vm.evalBytecode(wrapperBytecode);
    const run = vm.evalBytecode(compiled.bytecode);
    const input = vm.newString(workerData.input);
    let result;
    try {
      result = vm.callFunction(wrapper, vm.undefined, run, input);
    } finally {
      input.dispose();
      run.dispose();
      wrapper.dispose();
    }
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
    report.postMessage({ ok: false, stop, message: errorText(error).slice(0, workerData.messageMaxChars) });
  } finally {
    if (vm) vm.dispose();
    else compiler.dispose();
  }
})();`;

let compiledModule: Promise<WebAssembly.Module> | undefined;
let activeWorkers = 0;
const waitingForWorker: (() => void)[] = [];

function quickjsModule(): Promise<WebAssembly.Module> {
  compiledModule ??= readFile(join(process.cwd(), "node_modules", "quickjs-wasi", "quickjs.wasm"))
    .then((bytes) => WebAssembly.compile(bytes))
    .catch((error: unknown) => {
      compiledModule = undefined;
      throw error;
    });
  return compiledModule;
}

async function withWorkerSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeWorkers < ANALYSIS_MAX_WORKERS) activeWorkers += 1;
  else await new Promise<void>((resolve) => waitingForWorker.push(resolve));
  try {
    return await run();
  } finally {
    const next = waitingForWorker.shift();
    if (next) next();
    else activeWorkers -= 1;
  }
}

function withoutTrailingSemicolons(code: string): string {
  let end = code.trimEnd().length;
  while (end > 0 && code[end - 1] === ";") end = code.slice(0, end - 1).trimEnd().length;
  return code.slice(0, end);
}

function withoutSemicolonBeforeTrailingComment(code: string): string | null {
  for (
    let end = code.lastIndexOf(";");
    end >= 0 && code.length - end <= TRAILING_COMMENTS_MAX_CHARS;
    end = code.lastIndexOf(";", end - 1)
  ) {
    const comments = code.slice(end + 1);
    if (TRAILING_COMMENTS.test(comments)) return `${withoutTrailingSemicolons(code.slice(0, end))}\n${comments}`;
  }
  return null;
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
  if (message === NOT_A_FUNCTION) return NOT_A_FUNCTION_ERROR;
  if (message === NEVER_SETTLED)
    return "The analysis code returned a promise that never settled; the code has no timers, network or tools to wait for.";
  if (message === HOLDS_PROMISE) return "The analysis result holds a promise; await it, for example with Promise.all.";
  if (message === HOLDS_ITERATOR)
    return "The analysis result holds a Map, Set, iterator or generator, which JSON cannot represent; convert it with Object.fromEntries or Array.from first.";
  if (message === NOT_JSON) return "The analysis code replaced JSON.stringify, so its result is not valid JSON.";
  if (/memory access out of bounds|Maximum call stack size exceeded/.test(message))
    return "The analysis code nested calls too deeply, more than a few thousand levels, and was stopped; rewrite the recursion as a loop.";
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

function unparsedError(reported: string): string {
  const message = reported.replace(/^Compilation error: /, "");
  if (/out of memory/i.test(message)) return "The analysis code ran out of memory and was stopped.";
  if (message === NOT_A_FUNCTION) return NOT_A_FUNCTION_ERROR;
  return `The analysis code does not parse as one function expression (${message.slice(0, MESSAGE_MAX_CHARS)}). Write it as (data) => { ...; return result; } and declare any helper functions inside it.`;
}

async function runAnalysisWorker(
  code: string,
  input: string,
  resultMaxChars: number,
  limits: AnalysisLimits,
  checkOnly: boolean,
): Promise<WorkerReport> {
  const wasm = await quickjsModule();
  const fallback = withoutSemicolonBeforeTrailingComment(code);
  return withWorkerSlot(() => {
    const deadline = Date.now() + limits.wallMs;
    return runInWorker(
      {
        quickjsUrl: pathToFileURL(join(process.cwd(), "node_modules", "quickjs-wasi", "dist", "index.js")).href,
        wasm,
        code: withoutTrailingSemicolons(code),
        fallbackCode: fallback,
        wrapper: ANALYSIS_WRAPPER,
        input,
        deadline,
        maxSteps: limits.maxSteps,
        memoryBytes: limits.memoryBytes,
        intrinsics: ANALYSIS_INTRINSICS,
        compilerIntrinsics: COMPILER_INTRINSICS,
        resultMaxChars,
        messageMaxChars: MESSAGE_MAX_CHARS,
        checkOnly,
      },
      deadline + TERMINATE_MARGIN_MS - Date.now(),
      limits.workerHeapMb,
    );
  });
}

export async function checkAnalysisCode(
  code: string,
  limits: AnalysisLimits = ANALYSIS_LIMITS,
): Promise<string | null> {
  const report = await runAnalysisWorker(code, "null", 0, limits, true);
  if (report.ok || "resultChars" in report) return null;
  return report.unparsed ? unparsedError(report.message) : stoppedError(report.stop, report.message);
}

export async function runAnalysisCode(
  code: string,
  input: string,
  resultMaxChars: number,
  limits: AnalysisLimits = ANALYSIS_LIMITS,
): Promise<AnalysisOutcome> {
  const report = await runAnalysisWorker(code, input, resultMaxChars, limits, false);
  if (report.ok) return { ok: true, serialized: report.serialized };
  if ("resultChars" in report) return { ok: false, resultChars: report.resultChars };
  if (report.unparsed) return { ok: false, error: unparsedError(report.message) };
  return { ok: false, error: stoppedError(report.stop, report.message) };
}
