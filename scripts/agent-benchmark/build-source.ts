import { execFileSync } from "node:child_process";

export const UNKNOWN_BENCHMARK_BUILD_SOURCE = "unknown";
const REPORT_PATHS = [
  ":(exclude)scripts/agent-benchmark/reports",
  ":(exclude)scripts/agent-benchmark/reports/**",
] as const;

type GitCommand = (args: readonly string[]) => string;

function runGit(args: readonly string[]) {
  return execFileSync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function resolveBenchmarkBuildSource(git: GitCommand = runGit): string {
  try {
    const commit = git(["rev-parse", "--verify", "HEAD^{commit}"])
      .trim()
      .toLowerCase();
    if (!/^[0-9a-f]{40,64}$/.test(commit))
      return UNKNOWN_BENCHMARK_BUILD_SOURCE;
    const dirty = Boolean(git(["status", "--porcelain"]).trim());
    return dirty ? `dirty:${commit}` : commit;
  } catch {
    return UNKNOWN_BENCHMARK_BUILD_SOURCE;
  }
}

export function resolveBenchmarkRuntimeSource(
  git: GitCommand = runGit,
): { sourceCommit: string; sourceDirty: boolean } {
  const sourceCommit = git(["rev-parse", "--verify", "HEAD^{commit}"])
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40,64}$/.test(sourceCommit))
    throw new Error("The benchmark requires a verifiable Git source commit.");
  const sourceDirty = Boolean(
    git([
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ".",
      ...REPORT_PATHS,
    ]).trim(),
  );
  return { sourceCommit, sourceDirty };
}
