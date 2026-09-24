import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type * as FsPromises from "node:fs/promises";
import type * as WorkerThreads from "node:worker_threads";

import { describe, expect, it, vi } from "vitest";

import { ANALYSIS_LIMITS, runAnalysisCode } from "../agent-analysis-isolate";

const TIME_BUDGET_ERROR = "The analysis code ran longer than its time budget and was stopped.";
const STEP_BUDGET_ERROR = "The analysis code exceeded its step budget and was stopped.";
const OUT_OF_MEMORY_ERROR = "The analysis code ran out of memory and was stopped.";
const NEVER_SETTLED_ERROR =
  "The analysis code returned a promise that never settled; the code has no timers, network or tools to wait for.";
const HOLDS_PROMISE_ERROR = "The analysis result holds a promise; await it, for example with Promise.all.";
const NO_MESSAGE_ERROR =
  "The analysis code stopped without an error message: it ran out of memory, or it threw or rejected with null or undefined.";
const HOLDS_COLLECTION_ERROR =
  "The analysis result holds a Map, Set or generator, which JSON cannot represent; convert it with Object.fromEntries or Array.from first.";
const SMALL_MEMORY_LIMITS = { ...ANALYSIS_LIMITS, memoryBytes: 32 * 1024 * 1024 };
const COSTLY_BUILT_IN_LOOP = "() => { const s = 'a'.repeat(4e6); for (let i = 0; i < 2e3; i++) s.indexOf('b'); }";
const RESULT_MAX_CHARS = 10_000;

function twoByteRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    body: `Angebot ${index} – bitte prüfen. `.repeat(6),
  }));
}

describe("analysis isolate", () => {
  it("gives the analysis code 128 MiB, three seconds and a 256 MB worker heap unless a caller sets other limits", () => {
    expect(ANALYSIS_LIMITS).toEqual({
      memoryBytes: 128 * 1024 * 1024,
      wallMs: 3_000,
      maxSteps: 200_000_000,
      workerHeapMb: 256,
    });
  });

  it("returns the JSON result of a pure function over the data", async () => {
    const values = Array.from({ length: 5_001 }, (_, index) => ({ value: (index * 7919) % 997 }));
    const outcome = await runAnalysisCode(
      "(data) => { const sorted = data.map((row) => row.value).sort((a, b) => a - b); return { count: sorted.length, median: sorted[(sorted.length - 1) / 2] }; }",
      JSON.stringify(values),
      RESULT_MAX_CHARS,
    );
    const sorted = values.map((row) => row.value).sort((a, b) => a - b);
    expect(outcome).toEqual({ ok: true, serialized: JSON.stringify({ count: 5_001, median: sorted[2_500] }) });
  });

  it("stops an endless loop at the time budget", async () => {
    const started = Date.now();
    const outcome = await runAnalysisCode("() => { for (;;) {} }", "null", RESULT_MAX_CHARS, {
      ...ANALYSIS_LIMITS,
      wallMs: 200,
    });
    expect(outcome).toEqual({ ok: false, error: TIME_BUDGET_ERROR });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("stops a loop over a costly built-in at the time budget", async () => {
    const started = Date.now();
    const outcome = await runAnalysisCode(COSTLY_BUILT_IN_LOOP, "null", RESULT_MAX_CHARS, {
      ...ANALYSIS_LIMITS,
      wallMs: 500,
    });
    expect(outcome).toEqual({ ok: false, error: TIME_BUDGET_ERROR });
    expect(Date.now() - started).toBeLessThan(500 + 1_500);
  });

  it("keeps the event loop free while the analysis code runs", async () => {
    const started = Date.now();
    let firedAfter: number | undefined;
    const timer = setTimeout(() => {
      firedAfter = Date.now() - started;
    }, 100);
    const outcome = await runAnalysisCode(COSTLY_BUILT_IN_LOOP, "null", RESULT_MAX_CHARS, {
      ...ANALYSIS_LIMITS,
      wallMs: 1_000,
    });
    clearTimeout(timer);
    expect(outcome).toEqual({ ok: false, error: TIME_BUDGET_ERROR });
    expect(firedAfter).toBeLessThan(600);
  });

  it("traces every file the worker loads at runtime into the workflow function", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const traced = /"\/\.well-known\/workflow\/v1\/flow": \[([^\]]*)\]/.exec(config)?.[1] ?? "";
    for (const path of ["package.json", "dist/*.js", "quickjs.wasm"])
      expect(traced).toContain(`"./node_modules/quickjs-wasi/${path}"`);
    const entry = readFileSync(join(process.cwd(), "node_modules", "quickjs-wasi", "dist", "index.js"), "utf8");
    const relativeImports = [...entry.matchAll(/from\s+["'](\.[^"']*)["']/g)].map((match) => match[1]);
    expect(relativeImports.length).toBeGreaterThan(0);
    for (const specifier of relativeImports) expect(specifier).toMatch(/^\.\/[\w-]+\.js$/);
  });

  it.each([400, 1_200])(
    "returns a result that arrived in time while the main thread was busy for %i ms",
    async (busyMs) => {
      await runAnalysisCode("() => 0", "null", RESULT_MAX_CHARS);
      const pending = runAnalysisCode("(data) => data.length", "[1,2,3]", RESULT_MAX_CHARS, {
        ...ANALYSIS_LIMITS,
        wallMs: 300,
      });
      await new Promise<void>((resolve) =>
        setImmediate(() => {
          const until = Date.now() + busyMs;
          while (Date.now() < until);
          resolve();
        }),
      );
      await expect(pending).resolves.toEqual({ ok: true, serialized: "3" });
    },
    30_000,
  );

  it("starts the wall budget only once the wasm module is compiled", async () => {
    vi.resetModules();
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof FsPromises>();
      return {
        ...actual,
        readFile: async (...args: Parameters<typeof actual.readFile>) => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return actual.readFile(...args);
        },
      };
    });
    try {
      const fresh = await import("../agent-analysis-isolate");
      await expect(
        fresh.runAnalysisCode("(data) => data.length", "[1,2]", RESULT_MAX_CHARS, { ...ANALYSIS_LIMITS, wallMs: 200 }),
      ).resolves.toEqual({
        ok: true,
        serialized: "2",
      });
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  }, 30_000);

  it("stops code that exceeds its step budget", async () => {
    const outcome = await runAnalysisCode(
      "() => { let n = 0; for (let i = 0; i < 1e9; i++) n += i; return n; }",
      "null",
      RESULT_MAX_CHARS,
      {
        ...ANALYSIS_LIMITS,
        maxSteps: 1_000,
        wallMs: 60_000,
      },
    );
    expect(outcome).toEqual({ ok: false, error: STEP_BUDGET_ERROR });
  }, 30_000);

  it("stops an allocation beyond the memory limit and says it ran out of memory when the runtime says so", async () => {
    const outcome = await runAnalysisCode(
      "() => { const rows = []; for (;;) rows.push(new Array(1e5).fill(1)); }",
      "null",
      RESULT_MAX_CHARS,
    );
    expect(outcome).toEqual({ ok: false, error: OUT_OF_MEMORY_ERROR });
  });

  it("reports running out of memory with no room left for an error as a stop without an error message", async () => {
    await expect(
      runAnalysisCode(
        "() => { const a = []; for (;;) a.push([a.length]); }",
        "null",
        RESULT_MAX_CHARS,
        SMALL_MEMORY_LIMITS,
      ),
    ).resolves.toEqual({ ok: false, error: NO_MESSAGE_ERROR });
  }, 15_000);

  it.each([
    ["a thrown null", "() => { throw null; }"],
    ["a thrown undefined", "(data) => { if (data.length < 5) throw undefined; return data.length; }"],
    ["a thrown symbol", "() => { throw Symbol('x'); }"],
    ["an async function that throws null", "async () => { throw null; }"],
    ["a promise rejected without a reason", "() => Promise.reject()"],
    ["a promise rejected with null", "() => Promise.reject(null)"],
    ["an awaited rejection without a reason", "async () => { await Promise.reject(); }"],
  ])("reports %s as a stop without an error message, not as running out of memory", async (_, code) => {
    await expect(runAnalysisCode(code, "[1]", RESULT_MAX_CHARS)).resolves.toEqual({
      ok: false,
      error: NO_MESSAGE_ERROR,
    });
  });

  it("parses the full 8 MB the reads may return even when the text holds two-byte characters", async () => {
    const rows = twoByteRows(40_000);
    const input = JSON.stringify([{ total: rows.length, items: rows }]);
    expect(input.length).toBeGreaterThan(8_000_000);
    expect(input.length).toBeLessThanOrEqual(8 * 1024 * 1024);
    const outcome = await runAnalysisCode(
      "(data) => ({ count: data[0].items.length, chars: data[0].items.reduce((sum, row) => sum + row.body.length, 0) })",
      input,
      RESULT_MAX_CHARS,
      ANALYSIS_LIMITS,
    );
    expect(outcome).toEqual({
      ok: true,
      serialized: JSON.stringify({ count: 40_000, chars: rows.reduce((sum, row) => sum + row.body.length, 0) }),
    });
  }, 15_000);

  it("reports input too large to parse as a stop without an error message rather than as a bare null", async () => {
    const input = JSON.stringify(twoByteRows(24_000));
    expect(input.length).toBeGreaterThan(4_800_000);
    const outcome = await runAnalysisCode("(data) => data.length", input, RESULT_MAX_CHARS, SMALL_MEMORY_LIMITS);
    expect(outcome).toEqual({ ok: false, error: NO_MESSAGE_ERROR });
  }, 15_000);

  it("reaches no host capability: no network, process, module loader, timers, console or clock", async () => {
    const outcome = await runAnalysisCode(
      "() => ['fetch', 'process', 'require', 'import', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval', 'setImmediate', 'console', 'Date', 'performance', 'std', 'os', 'Deno', 'Bun', 'globalThis.__analysisInput'].map((name) => [name, (() => { try { return typeof eval(name); } catch (error) { return 'unavailable'; } })()])",
      "null",
      RESULT_MAX_CHARS,
    );
    if (!outcome.ok || outcome.serialized === null) throw new Error(JSON.stringify(outcome));
    for (const [, kind] of JSON.parse(outcome.serialized) as [string, string][])
      expect(["undefined", "unavailable"]).toContain(kind);
  });

  it("reports a failing function as an error rather than a result", async () => {
    await expect(runAnalysisCode("(data) => data.rows.length", "{}", RESULT_MAX_CHARS)).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/^The analysis code failed: .*TypeError|cannot read/i),
    });
    await expect(runAnalysisCode("not a function", "{}", RESULT_MAX_CHARS)).resolves.toMatchObject({ ok: false });
    await expect(runAnalysisCode("() => undefined", "{}", RESULT_MAX_CHARS)).resolves.toEqual({
      ok: true,
      serialized: null,
    });
  });

  it("asks for one function only when the code is not one, and reports a bug in it as it is", async () => {
    for (const code of ["42", "({ total: 1 })"]) {
      await expect(runAnalysisCode(code, "[1]", RESULT_MAX_CHARS)).resolves.toEqual({
        ok: false,
        error: "The analysis code must be one function expression (data) => result; it may be async.",
      });
    }
    await expect(
      runAnalysisCode("(data) => data.total()", JSON.stringify({ total: 3 }), RESULT_MAX_CHARS),
    ).resolves.toEqual({
      ok: false,
      error: "The analysis code failed: not a function",
    });
  });

  it("runs async code and a function that returns a promise, and returns what the promise resolves to", async () => {
    for (const [code, input, value] of [
      ["async (data) => data.length", "[1]", 1],
      ["async function (data) { return data; }", "[1]", [1]],
      ["(data) => Promise.resolve(data.length + 1)", "[1]", 2],
      ["async (data) => { let sum = 0; for (const n of data) sum += await n; return { sum }; }", "[1,2,3]", { sum: 6 }],
      ["(data) => Promise.all(data.map(async (n) => n * 2))", "[1,2]", [2, 4]],
    ] as const) {
      await expect(runAnalysisCode(code, input, RESULT_MAX_CHARS)).resolves.toEqual({
        ok: true,
        serialized: JSON.stringify(value),
      });
    }
  });

  it("reports a rejected promise as an error", async () => {
    await expect(
      runAnalysisCode("async () => { throw new RangeError('boom'); }", "null", RESULT_MAX_CHARS),
    ).resolves.toEqual({
      ok: false,
      error: "The analysis code failed: boom",
    });
    await expect(
      runAnalysisCode("async (data) => data.total()", JSON.stringify({ total: 3 }), RESULT_MAX_CHARS),
    ).resolves.toEqual({
      ok: false,
      error: "The analysis code failed: not a function",
    });
    await expect(runAnalysisCode("() => Promise.reject('plain')", "null", RESULT_MAX_CHARS)).resolves.toEqual({
      ok: false,
      error: "The analysis code failed: plain",
    });
  });

  it("reports a promise that can never settle, and a tool the code tries to await", async () => {
    for (const code of ["() => new Promise(() => {})", "async () => { await new Promise(() => {}); return 1; }"]) {
      await expect(runAnalysisCode(code, "null", RESULT_MAX_CHARS)).resolves.toEqual({
        ok: false,
        error: NEVER_SETTLED_ERROR,
      });
    }
    await expect(
      runAnalysisCode("async () => (await list_records({ entity: 'deal' })).items.length", "null", RESULT_MAX_CHARS),
    ).resolves.toEqual({ ok: false, error: "The analysis code failed: list_records is not defined" });
  });

  it.each([
    ["an endless await loop", "async () => { for (;;) await 0; }"],
    ["a looping then handler", "() => Promise.resolve().then(() => { for (;;) {} })"],
    ["a catch around the interrupt", "async () => { try { for (;;) await 0; } catch (error) { return 'caught'; } }"],
    [
      "a caught interrupt of an awaited call",
      "async () => { try { await (async () => { for (;;) {} })(); } catch { return 'caught'; } }",
    ],
    [
      "a catch handler after the interrupt",
      "() => Promise.resolve().then(() => { for (;;) {} }).catch(() => 'caught')",
    ],
    [
      "an endless microtask chain",
      "() => { const spin = () => queueMicrotask(spin); spin(); return new Promise(() => {}); }",
    ],
  ])("stops %s in the promise jobs at the time budget", async (_, code) => {
    const started = Date.now();
    const outcome = await runAnalysisCode(code, "null", RESULT_MAX_CHARS, { ...ANALYSIS_LIMITS, wallMs: 200 });
    expect(outcome).toEqual({ ok: false, error: TIME_BUDGET_ERROR });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("holds the step and memory budgets inside the promise jobs", async () => {
    await expect(
      runAnalysisCode("async () => { for (;;) await 0; }", "null", RESULT_MAX_CHARS, {
        ...ANALYSIS_LIMITS,
        maxSteps: 50,
        wallMs: 60_000,
      }),
    ).resolves.toEqual({ ok: false, error: STEP_BUDGET_ERROR });
    await expect(
      runAnalysisCode(
        "async () => { const rows = []; for (;;) { rows.push(new Array(1e5).fill(1)); await 0; } }",
        "null",
        RESULT_MAX_CHARS,
        SMALL_MEMORY_LIMITS,
      ),
    ).resolves.toEqual({ ok: false, error: OUT_OF_MEMORY_ERROR });
  }, 30_000);

  it.each([
    ["an async function", "async () => { await 0; const a = []; for (;;) a.push([a.length]); }"],
    [
      "an awaited inner async function",
      "async () => { const inner = async () => { await 0; const a = []; for (;;) a.push([a.length]); }; return await inner(); }",
    ],
    [
      "one of the promises Promise.all waits for",
      "async () => (await Promise.all([0].map(async () => { await 0; const a = []; for (;;) a.push([a.length]); }))).length",
    ],
  ])(
    "reports running out of memory in %s after an await as a stop without an error message, not as a promise that never settled",
    async (_, code) => {
      await expect(runAnalysisCode(code, "null", RESULT_MAX_CHARS, SMALL_MEMORY_LIMITS)).resolves.toEqual({
        ok: false,
        error: NO_MESSAGE_ERROR,
      });
    },
    15_000,
  );

  it("reports an error thrown in a queued job like any other failure, without the job prefix", async () => {
    await expect(
      runAnalysisCode(
        "async () => { queueMicrotask(() => { throw new Error('mt'); }); await 0; return 1; }",
        "null",
        RESULT_MAX_CHARS,
      ),
    ).resolves.toEqual({ ok: false, error: "The analysis code failed: Error: mt" });
    for (const thrown of ["null", "undefined"]) {
      await expect(
        runAnalysisCode(
          `() => new Promise(() => queueMicrotask(() => { throw ${thrown}; }))`,
          "null",
          RESULT_MAX_CHARS,
        ),
      ).resolves.toEqual({ ok: false, error: NO_MESSAGE_ERROR });
    }
  });

  it.each([
    ["the runtime says so", "a.push(new Array(1e5).fill(1))", OUT_OF_MEMORY_ERROR],
    ["no room is left for an error", "a.push([a.length])", NO_MESSAGE_ERROR],
  ])(
    "reports running out of memory in a queued job when %s as it would outside a job",
    async (_, push, error) => {
      await expect(
        runAnalysisCode(
          `async () => { queueMicrotask(() => { const a = []; for (;;) ${push}; }); await 0; return 1; }`,
          "null",
          RESULT_MAX_CHARS,
          SMALL_MEMORY_LIMITS,
        ),
      ).resolves.toEqual({ ok: false, error });
    },
    15_000,
  );

  it("runs a queued microtask inside the isolate", async () => {
    await expect(
      runAnalysisCode(
        "(data) => new Promise((resolve) => queueMicrotask(() => resolve(data.length)))",
        "[1,2]",
        RESULT_MAX_CHARS,
      ),
    ).resolves.toEqual({ ok: true, serialized: "2" });
  });

  it("refuses a result that still holds a promise instead of returning it as an empty object", async () => {
    for (const code of ["(data) => data.map(async (n) => n * 2)", "async () => ({ total: Promise.resolve(1) })"]) {
      await expect(runAnalysisCode(code, "[1,2]", RESULT_MAX_CHARS)).resolves.toEqual({
        ok: false,
        error: HOLDS_PROMISE_ERROR,
      });
    }
  });

  it.each([
    ["a Map", "(data) => new Map(data.map((n) => [n, n * 2]))"],
    ["a Set", "(data) => new Set(data)"],
    ["a Map nested in an object", "(data) => ({ total: data.length, byValue: new Map(data.map((n) => [n, 1])) })"],
    ["a Set inside an async result", "async (data) => [{ seen: new Set(data) }]"],
    ["a WeakMap", "() => new WeakMap()"],
    ["a WeakSet", "() => ({ refs: new WeakSet() })"],
    ["a generator", "function* (data) { for (const n of data) yield n; }"],
    ["an async generator", "async function* (data) { for (const n of data) yield n; }"],
    ["a generator nested in an array", "(data) => [(function* () { yield* data; })()]"],
  ])("refuses a result that holds %s instead of returning it as an empty object", async (_, code) => {
    await expect(runAnalysisCode(code, "[1,2]", RESULT_MAX_CHARS)).resolves.toEqual({
      ok: false,
      error: HOLDS_COLLECTION_ERROR,
    });
  });

  it("returns Maps and Sets the code converts before it returns them", async () => {
    await expect(
      runAnalysisCode(
        "(data) => ({ byValue: Object.fromEntries(new Map(data.map((n) => [n, n * 2]))), seen: Array.from(new Set(data)) })",
        "[1,2,2]",
        RESULT_MAX_CHARS,
      ),
    ).resolves.toEqual({ ok: true, serialized: JSON.stringify({ byValue: { 1: 2, 2: 4 }, seen: [1, 2] }) });
  });

  it("returns a result at its character budget exactly as the sandbox serialized it, and only the length of one over", async () => {
    const serialized = JSON.stringify({
      name: 'Müller "Nord" \\ Süd',
      lines: "a\nb\u2028c\u0001",
      emoji: "😀",
      ratio: 0.1 + 0.2,
      rows: [{ id: "row-1", value: -12.5 }, null, true],
    });
    await expect(runAnalysisCode("(data) => data", serialized, serialized.length)).resolves.toEqual({
      ok: true,
      serialized,
    });
    await expect(runAnalysisCode("(data) => data", serialized, serialized.length - 1)).resolves.toEqual({
      ok: false,
      resultChars: serialized.length,
    });
    await expect(runAnalysisCode("() => 'x'.repeat(1e6)", "null", 100)).resolves.toEqual({
      ok: false,
      resultChars: 1_000_002,
    });
  });

  it("gives the worker a bounded heap and reports a worker that outgrows it as running out of memory", async () => {
    const heapLimits: unknown[] = [];
    vi.resetModules();
    vi.doMock("node:worker_threads", async (importOriginal) => {
      const actual = await importOriginal<typeof WorkerThreads>();
      class OutOfMemoryWorker extends EventEmitter {
        constructor(_source: string, options: WorkerThreads.WorkerOptions) {
          super();
          heapLimits.push(options.resourceLimits);
          setImmediate(() => {
            this.emit(
              "error",
              Object.assign(new Error("Worker terminated due to reaching memory limit: JS heap out of memory"), {
                code: "ERR_WORKER_OUT_OF_MEMORY",
              }),
            );
            this.emit("exit", 1);
          });
        }

        terminate() {
          return Promise.resolve(1);
        }
      }
      return { ...actual, Worker: OutOfMemoryWorker };
    });
    try {
      const fresh = await import("../agent-analysis-isolate");
      await expect(fresh.runAnalysisCode("(data) => data.length", "[1,2]", RESULT_MAX_CHARS)).resolves.toEqual({
        ok: false,
        error: OUT_OF_MEMORY_ERROR,
      });
      await expect(
        fresh.runAnalysisCode("(data) => data.length", "[1,2]", RESULT_MAX_CHARS, {
          ...ANALYSIS_LIMITS,
          workerHeapMb: 64,
        }),
      ).resolves.toEqual({ ok: false, error: OUT_OF_MEMORY_ERROR });
      expect(heapLimits).toEqual([{ maxOldGenerationSizeMb: 256 }, { maxOldGenerationSizeMb: 64 }]);
    } finally {
      vi.doUnmock("node:worker_threads");
      vi.resetModules();
    }
  });
});
