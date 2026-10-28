import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function exercise(event: "uncaughtException" | "unhandledRejection", peer = false, mode = "throw", name = "Error") {
  const moduleUrl = pathToFileURL(resolve("core/observability/process-errors.ts")).href;
  const script = `
    const { installProcessErrorHandlers } = await import(${JSON.stringify(moduleUrl)});
    const reporter = {
      captureException(error) { process.stdout.write('captured:' + error.message + '\\n'); },
      async flush() { await new Promise(r => setTimeout(r, 40)); process.stdout.write('flushed\\n'); return true; }
    };
    const dispose = installProcessErrorHandlers(reporter);
    installProcessErrorHandlers(reporter);
    if (${peer}) process.on(${JSON.stringify(event)}, () => process.stdout.write('peer\\n'));
    setTimeout(() => { dispose(); process.stdout.write('continued\\n'); }, 100);
    const error = new Error('fixture');
    error.name = ${JSON.stringify(name)};
    ${event === "uncaughtException" ? "setTimeout(() => { throw error; }, 0);" : "Promise.reject(error);"}
  `;
  return spawnSync(process.execPath, [`--unhandled-rejections=${mode}`, "--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 5000,
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
  });
}

describe("native process error boundaries", () => {
  it.each(["uncaughtException", "unhandledRejection"] as const)(
    "flushes %s once and preserves the default fatal exit",
    (event) => {
      const result = exercise(event);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("captured:fixture\nflushed\n");
    },
  );

  it.each(["uncaughtException", "unhandledRejection"] as const)("preserves the host's existing %s handler", (event) => {
    const result = exercise(event, true);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("captured:fixture\npeer\ncontinued\n");
  });

  it.each(["warn", "none"])("preserves explicit non-fatal rejection mode %s", (mode) => {
    const result = exercise("unhandledRejection", false, mode);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("captured:fixture\ncontinued\n");
  });

  it.each(["AbortError", "AI_NoOutputGeneratedError"])("does not report detached AI cancellation %s", (name) => {
    const result = exercise("unhandledRejection", true, "throw", name);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("peer\ncontinued\n");
  });

  it.each(["AbortError", "AI_NoOutputGeneratedError"])("retains the fatal exit policy for ignored %s", (name) => {
    const result = exercise("unhandledRejection", false, "throw", name);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("flushed\n");
  });

  it("still reports unrelated rejection names", () => {
    const result = exercise("unhandledRejection", true, "throw", "AI_ProviderError");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("captured:fixture\npeer\ncontinued\n");
  });
});
