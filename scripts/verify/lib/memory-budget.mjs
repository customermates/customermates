import { existsSync, readFileSync } from "node:fs";

const GIB = 1024 ** 3;

/**
 * Memory one Playwright shard (production server, browser, worker) needs, in GiB. WebKit and the mobile emulation take
 * twice that. Measured on the test VM: three shards at once exceeded a 16 GiB job.
 */
export const SHARD_MEMORY_GB = 6;
const HEAVY_PROJECTS = new Set(["webkit", "mobile"]);

/**
 * Memory limit of the cgroup this process runs in (cgroup v2), in GiB, or null when there is none.
 * @param {(path: string) => string} [read]
 * @param {(path: string) => boolean} [exists]
 * @returns {number | null}
 */
export function cgroupMemoryLimitGb(read = (path) => readFileSync(path, "utf8"), exists = existsSync) {
  try {
    if (!exists("/proc/self/cgroup")) return null;
    const path = /^0::(.*)$/m.exec(read("/proc/self/cgroup"))?.[1]?.trim();
    if (path === undefined) return null;
    for (let current = path; ; current = current.replace(/\/[^/]*$/, "")) {
      const file = `/sys/fs/cgroup${current}/memory.max`;
      if (exists(file)) {
        const value = read(file).trim();
        if (/^\d+$/.test(value)) return Number(value) / GIB;
      }
      if (current === "" || current === "/") return null;
    }
  } catch {
    return null;
  }
}

/**
 * The memory this run may use, in GiB: the machine's RAM, capped by the offload job's limit and by its cgroup.
 * @param {{ totalGb: number, env?: Record<string, string | undefined>, cgroupLimitGb?: number | null }} options
 */
export function memoryBudgetGb({ totalGb, env = process.env, cgroupLimitGb = cgroupMemoryLimitGb() }) {
  const declared = Number(env.WORKSPACE_OFFLOAD_MEMORY_GB);
  const limits = [totalGb, Number.isFinite(declared) && declared > 0 ? declared : null, cgroupLimitGb].filter(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  return Math.min(...limits);
}

/** How many shards run at once when --parallel is not given: half the cores, and as many as the memory budget holds for
 * the targets' average shard weight (WebKit and mobile count twice). */
export function defaultParallel({ cores, budgetGb, projects }) {
  const weights = projects.length ? projects.map((project) => (HEAVY_PROJECTS.has(project) ? 2 : 1)) : [1];
  const averageWeight = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  return Math.max(1, Math.min(Math.floor(cores / 2), Math.floor(budgetGb / (SHARD_MEMORY_GB * averageWeight))));
}

/** The line `workspace offload` prints when it stopped a job at its memory limit. */
export function offloadMemoryStop(output) {
  return /offload: the job was stopped at its memory limit/i.test(output ?? "");
}
