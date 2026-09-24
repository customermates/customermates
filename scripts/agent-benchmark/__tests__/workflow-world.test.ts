import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { configureBenchmarkWorkflowWorld } from "../workflow-world";

describe("benchmark Workflow world", () => {
  it("shares Next's local Workflow directory by default", () => {
    const environment: Record<string, string | undefined> = {};

    expect(configureBenchmarkWorkflowWorld(environment, "/worktree")).toBe(
      resolve("/worktree/.next/workflow-data"),
    );
    expect(environment.WORKFLOW_LOCAL_DATA_DIR).toBe(
      resolve("/worktree/.next/workflow-data"),
    );
    expect(environment.WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS).toBe("false");
    expect(environment.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS).toBe("0");
    expect(environment.WORKFLOW_LOCAL_BODY_TIMEOUT_MS).toBe("0");
  });

  it("preserves a shared custom directory and disables secondary recovery", () => {
    const environment = {
      WORKFLOW_LOCAL_DATA_DIR: "./tmp/benchmark-world",
      WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "true",
    };

    expect(configureBenchmarkWorkflowWorld(environment, "/worktree")).toBe(
      resolve("/worktree/tmp/benchmark-world"),
    );
    expect(environment).toEqual({
      WORKFLOW_LOCAL_DATA_DIR: resolve("/worktree/tmp/benchmark-world"),
      WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false",
      WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS: "0",
      WORKFLOW_LOCAL_BODY_TIMEOUT_MS: "0",
    });
  });
});
