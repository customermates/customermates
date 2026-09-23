import { readFileSync } from "node:fs";
import { join } from "node:path";

import type * as FsPromises from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { ANALYSIS_LIMITS, runAnalysisCode } from "../agent-analysis-isolate";

const TIME_BUDGET_ERROR = "The analysis code ran longer than its time budget and was stopped.";
const COSTLY_BUILT_IN_LOOP = "() => { const s = 'a'.repeat(4e6); for (let i = 0; i < 2e3; i++) s.indexOf('b'); }";

describe("analysis isolate", () => {
  it("returns the JSON result of a pure function over the data", async () => {
    const values = Array.from({ length: 5_001 }, (_, index) => ({ value: (index * 7919) % 997 }));
    const outcome = await runAnalysisCode(
      "(data) => { const sorted = data.map((row) => row.value).sort((a, b) => a - b); return { count: sorted.length, median: sorted[(sorted.length - 1) / 2] }; }",
      values,
    );
    const sorted = values.map((row) => row.value).sort((a, b) => a - b);
    expect(outcome).toEqual({ ok: true, value: { count: 5_001, median: sorted[2_500] } });
  });

  it("stops an endless loop at the time budget", async () => {
    const started = Date.now();
    const outcome = await runAnalysisCode("() => { for (;;) {} }", null, { ...ANALYSIS_LIMITS, wallMs: 200 });
    expect(outcome).toEqual({ ok: false, error: TIME_BUDGET_ERROR });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("stops a loop over a costly built-in at the time budget", async () => {
    const started = Date.now();
    const outcome = await runAnalysisCode(COSTLY_BUILT_IN_LOOP, null, { ...ANALYSIS_LIMITS, wallMs: 500 });
    expect(outcome).toEqual({ ok: false, error: TIME_BUDGET_ERROR });
    expect(Date.now() - started).toBeLessThan(500 + 1_500);
  });

  it("keeps the event loop free while the analysis code runs", async () => {
    const started = Date.now();
    let firedAfter: number | undefined;
    const timer = setTimeout(() => {
      firedAfter = Date.now() - started;
    }, 100);
    const outcome = await runAnalysisCode(COSTLY_BUILT_IN_LOOP, null, { ...ANALYSIS_LIMITS, wallMs: 1_000 });
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
      await runAnalysisCode("() => 0", null);
      const pending = runAnalysisCode("(data) => data.length", [1, 2, 3], { ...ANALYSIS_LIMITS, wallMs: 300 });
      await new Promise<void>((resolve) =>
        setImmediate(() => {
          const until = Date.now() + busyMs;
          while (Date.now() < until);
          resolve();
        }),
      );
      await expect(pending).resolves.toEqual({ ok: true, value: 3 });
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
        fresh.runAnalysisCode("(data) => data.length", [1, 2], { ...ANALYSIS_LIMITS, wallMs: 200 }),
      ).resolves.toEqual({
        ok: true,
        value: 2,
      });
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  }, 30_000);

  it("stops code that exceeds its step budget", async () => {
    const outcome = await runAnalysisCode(
      "() => { let n = 0; for (let i = 0; i < 1e9; i++) n += i; return n; }",
      null,
      {
        ...ANALYSIS_LIMITS,
        maxSteps: 1_000,
        wallMs: 60_000,
      },
    );
    expect(outcome).toEqual({ ok: false, error: "The analysis code exceeded its step budget and was stopped." });
  }, 30_000);

  it("stops an allocation beyond the memory limit", async () => {
    const outcome = await runAnalysisCode(
      "() => { const rows = []; for (;;) rows.push(new Array(1e5).fill(1)); }",
      null,
    );
    expect(outcome).toEqual({ ok: false, error: "The analysis code ran out of memory and was stopped." });
  });

  it("reaches no host capability: no network, process, module loader, timers, console or clock", async () => {
    const outcome = await runAnalysisCode(
      "() => ['fetch', 'process', 'require', 'import', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval', 'console', 'Date', 'performance', 'std', 'os', 'Deno', 'Bun', 'globalThis.__analysisInput'].map((name) => [name, (() => { try { return typeof eval(name); } catch (error) { return 'unavailable'; } })()])",
      null,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    for (const [, kind] of outcome.value as [string, string][]) expect(["undefined", "unavailable"]).toContain(kind);
  });

  it("reports a failing function as an error rather than a result", async () => {
    await expect(runAnalysisCode("(data) => data.rows.length", {})).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/^The analysis code failed: .*TypeError|cannot read/i),
    });
    await expect(runAnalysisCode("not a function", {})).resolves.toMatchObject({ ok: false });
    await expect(runAnalysisCode("() => undefined", {})).resolves.toEqual({ ok: true, value: null });
  });

  it("asks for one synchronous function only when the code is not one, and reports a synchronous bug as it is", async () => {
    for (const code of [
      "async (data) => data.length",
      "async function (data) { return data; }",
      "42",
      "({ total: 1 })",
    ]) {
      await expect(runAnalysisCode(code, [1])).resolves.toEqual({
        ok: false,
        error:
          "The analysis code must be one synchronous function expression (data) => result; async functions, await and promises are not available.",
      });
    }
    await expect(runAnalysisCode("(data) => data.total()", { total: 3 })).resolves.toEqual({
      ok: false,
      error: "The analysis code failed: not a function",
    });
  });
});
