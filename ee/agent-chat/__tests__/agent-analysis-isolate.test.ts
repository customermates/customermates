import { describe, expect, it } from "vitest";

import { ANALYSIS_LIMITS, runAnalysisCode } from "../agent-analysis-isolate";

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
    expect(outcome).toEqual({ ok: false, error: "The analysis code ran longer than its time budget and was stopped." });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("stops code that exceeds its step budget", async () => {
    const outcome = await runAnalysisCode(
      "() => { let n = 0; for (let i = 0; i < 1e9; i++) n += i; return n; }",
      null,
      {
        ...ANALYSIS_LIMITS,
        maxSteps: 10_000,
        wallMs: 60_000,
      },
    );
    expect(outcome).toEqual({ ok: false, error: "The analysis code exceeded its step budget and was stopped." });
  });

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
});
