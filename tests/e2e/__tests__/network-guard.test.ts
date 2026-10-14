import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("e2e network guard", () => {
  it("passes its node:test suite in a separate process", () => {
    // The guard patches fetch, http, https and net process-wide, so it runs in its own Node process.
    const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "tests/e2e/network-guard.test.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 60_000,
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/# pass [1-9]/);
    expect(result.stdout).toContain("# fail 0");
  });
});
