import { execFileSync } from "node:child_process";

import { REPO_ROOT } from "./walk";

export const REVIEW_BASE_SHA = "89f336f1978401d945ba7ba75141d2e435208a3e";

const FULL_SHA = /^[0-9a-f]{40}$/;

const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 << 20,
    stdio: ["ignore", "pipe", "pipe"],
  });

function succeeds(...args: string[]) {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

const verifiedBases = new Set<string>();

export function reviewBaseSha(): string {
  const base = process.env.CONVENTION_REVIEW_BASE?.trim() || REVIEW_BASE_SHA;
  if (verifiedBases.has(base)) return base;
  if (!FULL_SHA.test(base))
    throw new Error(`CONVENTION_REVIEW_BASE must be a full 40-character commit sha, got "${base}"`);
  if (!succeeds("cat-file", "-e", `${base}^{commit}`))
    throw new Error(
      `The review base commit ${base} is not available in this clone, so exception membership cannot be checked. ` +
        `Fetch it (git fetch origin ${base}, or check out with fetch-depth: 0) and rerun.`,
    );
  if (!succeeds("merge-base", "--is-ancestor", base, "HEAD"))
    throw new Error(`The review base ${base} is not an ancestor of HEAD; supply the merge-base of this change.`);
  verifiedBases.add(base);
  return base;
}

export function listBaseFiles(dir: string): string[] {
  const base = reviewBaseSha();
  return git("ls-tree", "-r", "--name-only", base, "--", dir.replace(/\/?$/, "/")).split("\n").filter(Boolean);
}

export function readBaseSource(path: string): string | undefined {
  const base = reviewBaseSha();
  if (!git("ls-tree", "--name-only", base, "--", path).trim()) return undefined;
  return git("show", `${base}:${path}`);
}
