import { describe, expect, it, vi } from "vitest";

import {
  resolveBenchmarkBuildSource,
  resolveBenchmarkRuntimeSource,
  UNKNOWN_BENCHMARK_BUILD_SOURCE,
} from "../build-source";

const COMMIT = "a".repeat(40);

describe("benchmark build source", () => {
  it("identifies only a clean build as the exact source commit", () => {
    const git = vi
      .fn<(args: readonly string[]) => string>()
      .mockReturnValueOnce(`${COMMIT}\n`)
      .mockReturnValueOnce("");

    expect(resolveBenchmarkBuildSource(git)).toBe(COMMIT);
    expect(git).toHaveBeenNthCalledWith(1, [
      "rev-parse",
      "--verify",
      "HEAD^{commit}",
    ]);
    expect(git).toHaveBeenNthCalledWith(2, ["status", "--porcelain"]);
  });

  it("marks a build from a dirty tree so it cannot equal the clean commit", () => {
    const git = vi
      .fn<(args: readonly string[]) => string>()
      .mockReturnValueOnce(`${COMMIT}\n`)
      .mockReturnValueOnce(" M app/page.tsx\n");

    expect(resolveBenchmarkBuildSource(git)).toBe(`dirty:${COMMIT}`);
  });

  it.each([
    [
      "git is unavailable",
      () =>
        vi.fn(() => {
          throw new Error("git unavailable");
        }),
    ],
    ["the revision is not a full commit", () => vi.fn(() => "not-a-commit\n")],
  ])("fails closed when %s", (_label, createGit) => {
    expect(resolveBenchmarkBuildSource(createGit())).toBe(
      UNKNOWN_BENCHMARK_BUILD_SOURCE,
    );
  });

  it("ignores generated reports but treats every other runtime source change as dirty", () => {
    const git = vi
      .fn<(args: readonly string[]) => string>()
      .mockReturnValueOnce(`${COMMIT}\n`)
      .mockReturnValueOnce("");

    expect(resolveBenchmarkRuntimeSource(git)).toEqual({
      sourceCommit: COMMIT,
      sourceDirty: false,
    });
    expect(git).toHaveBeenNthCalledWith(2, [
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ".",
      ":(exclude)scripts/agent-benchmark/reports",
      ":(exclude)scripts/agent-benchmark/reports/**",
    ]);

    const dirtyGit = vi
      .fn<(args: readonly string[]) => string>()
      .mockReturnValueOnce(`${COMMIT}\n`)
      .mockReturnValueOnce(" M scripts/agent-benchmark/cli.ts\n");
    expect(resolveBenchmarkRuntimeSource(dirtyGit).sourceDirty).toBe(true);
  });
});
