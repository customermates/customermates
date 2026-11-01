import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { e2eSample, meanDurations, repositoryPath } from "../refresh-durations.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));

describe("refresh durations", () => {
  it("averages each file over the runs that ran it and drops files that no longer exist", () => {
    expect(
      meanDurations(
        [{ "a.spec.ts": 100, "b.spec.ts": 10, "gone.spec.ts": 5 }, { "a.spec.ts": 201 }],
        (file) => file !== "gone.spec.ts",
      ),
    ).toEqual({ "a.spec.ts": 151, "b.spec.ts": 10 });
  });

  it("sums a spec file's tests per target and leaves out a target the run covered only partly", () => {
    const shard = (target: string, files: string[]) => ({
      [target]: files.map((file) => ({ file, duration: 10 })),
    });
    const sample = e2eSample(
      [
        shard("cloud-chromium", ["a.spec.ts", "a.spec.ts", "b.spec.ts"]),
        shard("cloud-chromium", ["c.spec.ts", "d.spec.ts"]),
        shard("cloud-firefox", ["a.spec.ts"]),
      ],
      5,
    );
    expect(sample).toEqual({
      "cloud-chromium": {
        "a.spec.ts": 20,
        "b.spec.ts": 10,
        "c.spec.ts": 10,
        "d.spec.ts": 10,
      },
    });
  });

  it("maps a runner's absolute test path to the repository path", () => {
    const exists = (path: string) => path === "scripts/verify/__tests__/refresh-durations.test.ts";
    expect(
      repositoryPath(
        "/home/runner/work/customermates/customermates/scripts/verify/__tests__/refresh-durations.test.ts",
        exists,
      ),
    ).toBe("scripts/verify/__tests__/refresh-durations.test.ts");
    expect(repositoryPath("/elsewhere/unknown.test.ts", exists)).toBeNull();
  });

  it("keeps the checked-in timings covering the current test files, so shards stay balanced", () => {
    const e2e = JSON.parse(readFileSync(join(root, "tests/e2e/durations.json"), "utf8")) as {
      targets: Record<string, Record<string, number>>;
    };
    const specs = readdirSync(join(root, "tests/e2e")).filter((file) => file.endsWith(".spec.ts"));
    for (const target of ["cloud-chromium", "self-hosted-chromium"]) {
      const missing = specs.filter((file) => !(file in e2e.targets[target]));
      // A few new files fall back to the median; once many are missing, run node scripts/verify/refresh-durations.mjs.
      expect(missing.length, `${target} lacks ${missing.join(", ")}`).toBeLessThanOrEqual(
        Math.ceil(specs.length * 0.1),
      );
    }
  });
});
