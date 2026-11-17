import { describe, expect, it } from "vitest";

import { cgroupMemoryLimitGb, defaultParallel, memoryBudgetGb, offloadMemoryStop } from "../lib/memory-budget.mjs";

const GIB = 1024 ** 3;

function fakeFiles(files: Record<string, string>) {
  return {
    read: (path: string) => {
      if (!(path in files)) throw new Error(`missing ${path}`);
      return files[path];
    },
    exists: (path: string) => path in files,
  };
}

describe("verify memory budget", () => {
  it("sizes an offloaded run by the job's 16 GiB limit, not by the test VM's RAM", () => {
    const budget = memoryBudgetGb({ totalGb: 61, env: { WORKSPACE_OFFLOAD_MEMORY_GB: "16" }, cgroupLimitGb: null });
    expect(budget).toBe(16);

    const allTargets = ["chromium", "firefox", "webkit", "mobile", "chromium"];
    expect(defaultParallel({ cores: 16, budgetGb: budget, projects: allTargets })).toBe(1);
    expect(defaultParallel({ cores: 16, budgetGb: budget, projects: ["chromium", "firefox", "chromium"] })).toBe(2);
    expect(defaultParallel({ cores: 16, budgetGb: budget, projects: ["webkit", "mobile"] })).toBe(1);
    expect(defaultParallel({ cores: 16, budgetGb: 61, projects: ["chromium", "chromium"] })).toBe(8);
  });

  it("takes the smallest of the machine, the declared limit and the cgroup limit, and ignores unusable values", () => {
    expect(memoryBudgetGb({ totalGb: 61, env: {}, cgroupLimitGb: 12 })).toBe(12);
    expect(memoryBudgetGb({ totalGb: 8, env: { WORKSPACE_OFFLOAD_MEMORY_GB: "16" }, cgroupLimitGb: null })).toBe(8);
    expect(memoryBudgetGb({ totalGb: 61, env: { WORKSPACE_OFFLOAD_MEMORY_GB: "max" }, cgroupLimitGb: null })).toBe(61);
    expect(memoryBudgetGb({ totalGb: 61, env: { WORKSPACE_OFFLOAD_MEMORY_GB: "0" }, cgroupLimitGb: null })).toBe(61);
  });

  it("never drops below one shard or above half the cores", () => {
    expect(defaultParallel({ cores: 16, budgetGb: 2, projects: ["webkit"] })).toBe(1);
    expect(defaultParallel({ cores: 4, budgetGb: 256, projects: ["chromium"] })).toBe(2);
    expect(defaultParallel({ cores: 16, budgetGb: 16, projects: [] })).toBe(2);
  });

  it("reads the memory limit of the process's own cgroup or of the nearest parent that has one", () => {
    const unit = "/user.slice/user-1000.slice/user@1000.service/app.slice/workspace-offload-abc.service";
    const limited = fakeFiles({
      "/proc/self/cgroup": `0::${unit}\n`,
      [`/sys/fs/cgroup${unit}/memory.max`]: `${16 * GIB}\n`,
    });
    expect(cgroupMemoryLimitGb(limited.read, limited.exists)).toBe(16);

    const inherited = fakeFiles({
      "/proc/self/cgroup": `0::${unit}/child.scope\n`,
      [`/sys/fs/cgroup${unit}/child.scope/memory.max`]: "max\n",
      [`/sys/fs/cgroup${unit}/memory.max`]: `${16 * GIB}\n`,
    });
    expect(cgroupMemoryLimitGb(inherited.read, inherited.exists)).toBe(16);

    const unlimited = fakeFiles({
      "/proc/self/cgroup": "0::/user.slice\n",
      "/sys/fs/cgroup/user.slice/memory.max": "max\n",
    });
    expect(cgroupMemoryLimitGb(unlimited.read, unlimited.exists)).toBeNull();
    expect(cgroupMemoryLimitGb(fakeFiles({}).read, fakeFiles({}).exists)).toBeNull();
  });

  it("recognises the offload's memory-limit message", () => {
    expect(offloadMemoryStop("offload: the job was stopped at its memory limit (16 GiB per job), ...")).toBe(true);
    expect(offloadMemoryStop("offload: waiting for worktree lock")).toBe(false);
    expect(offloadMemoryStop(undefined)).toBe(false);
  });
});
